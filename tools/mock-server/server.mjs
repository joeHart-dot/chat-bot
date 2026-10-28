// Backend simulado del widget (contrato de guia-desarrollo-widget.md). Sin dependencias.
//
// Variables de entorno:
//   PORT                  (4000)
//   MOCK_FIRST_DELTA_MS   espera hasta el primer delta, simula el LLM lento (3000)
//   MOCK_RECONNECT_MS     el servidor envía `reconnect` y cierra a los N ms (8000; el real: 120000)
//   MOCK_TRANSCRIBE_MS    tiempo hasta que la nota de voz tiene texto (4000)
//   MOCK_AUDIO            off = 503 audio_unavailable; fail = la transcripción falla
//   MOCK_SESSION_TTL_MS   vida del token (1800000; ponla a 20000 para probar el 401)
//
// Mensajes especiales: "error:..." provoca un evento `error`; "429:..." devuelve rate_limited.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4000);
const FIRST_DELTA_MS = Number(process.env.MOCK_FIRST_DELTA_MS ?? 3000);
const RECONNECT_MS = Number(process.env.MOCK_RECONNECT_MS ?? 8000);
const TRANSCRIBE_MS = Number(process.env.MOCK_TRANSCRIBE_MS ?? 4000);
const AUDIO_MODE = process.env.MOCK_AUDIO ?? "on";
const MAX_AUDIO = 5 * 1024 * 1024;
const TTL_MS = Number(process.env.MOCK_SESSION_TTL_MS ?? 30 * 60 * 1000);

const ANSWER =
  'Marlene Quispe Arroyo es de Arequipa [1]. Es una estudiante registrada en el documento de ejemplo, ' +
  'con datos inventados para las pruebas.';
const SOURCES = [{ document_id: randomUUID(), filename: 'estudiantes.txt', page: null, chunk: 0 }];

/** @type {Map<string, {conversationId: string, expiresAt: number}>} */
const sessions = new Map();
/** @type {Map<string, Array<any>>} */
const messagesByConv = new Map();
/** @type {Map<number, {conversationId: string, startedAt: number, fail: boolean, assistantId: number | null}>} */
const generations = new Map();
let nextId = 1;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

/** Lee el cuerpo crudo; devuelve null si supera el límite. */
function readRaw(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on("end", () => resolve(size > limit ? null : Buffer.concat(chunks)));
  });
}

function sessionFrom(req) {
  const token = /^Bearer (ws_\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  const s = token && sessions.get(token);
  return s && s.expiresAt > Date.now() ? { token, ...s } : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const origin = req.headers.origin;

  const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      // Solo las cabeceras que permite el backend real.
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });
    return res.end();
  }
  if (!origin) return send(res, 404, undefined);

  if (req.method === 'POST' && path === '/widget/v1/sessions/') {
    const body = await readBody(req);
    if (!body || Object.keys(body).join() !== 'key') return send(res, 400, { error: 'invalid_request' });
    const token = `ws_${randomUUID().replace(/-/g, '')}`;
    const conversationId = randomUUID();
    const expiresAt = Date.now() + TTL_MS;
    sessions.set(token, { conversationId, expiresAt });
    messagesByConv.set(conversationId, []);
    return send(res, 201, {
      conversation_id: conversationId,
      access_token: token,
      token_type: 'Bearer',
      expires_at: new Date(expiresAt).toISOString(),
    });
  }

  const session = sessionFrom(req);
  if (!session) {
    return send(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
  }
  const msgs = messagesByConv.get(session.conversationId);

  if (path === '/widget/v1/sessions/current') {
    if (req.method === 'DELETE') {
      sessions.delete(session.token);
      return send(res, 204);
    }
    return send(res, 200, {
      conversation_id: session.conversationId,
      expires_at: new Date(session.expiresAt).toISOString(),
    });
  }

  if (path === "/widget/v1/messages/audio/" && req.method === "POST") {
    if (AUDIO_MODE === "off") return send(res, 503, { error: "audio_unavailable" });
    if (!(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) return send(res, 415, { error: "multipart_required" });
    const raw = await readRaw(req, MAX_AUDIO + 1024);
    if (!raw || raw.length === 0) return send(res, 413, { error: "body_too_large" });
    if (!raw.includes('name="audio"')) return send(res, 400, { error: "invalid_request" });
    const message = {
      id: nextId++,
      role: "user",
      content: "",
      created_at: new Date().toISOString(),
      generation_status: "pending",
      awaiting_transcription: true,
    };
    msgs.push(message);
    const failing = AUDIO_MODE === "fail";
    // La generación empieza al terminar la transcripción, como en el backend real.
    generations.set(message.id, {
      conversationId: session.conversationId,
      startedAt: Date.now() + TRANSCRIBE_MS,
      fail: failing,
      assistantId: null,
    });
    setTimeout(() => {
      message.awaiting_transcription = false;
      if (failing) message.generation_status = "failed";
      else message.content = "¿De dónde es Marlene Quispe Arroyo?";
    }, TRANSCRIBE_MS);
    return send(res, 201, message);
  }

  if (path === '/widget/v1/messages/') {
    if (req.method === 'GET') {
      const after = Number(url.searchParams.get('after_id') ?? 0);
      const page = msgs.filter((m) => m.id > after).slice(0, 50);
      return send(res, 200, {
        messages: page,
        has_more: msgs.filter((m) => m.id > after).length > page.length,
        next_cursor: page.at(-1)?.id ?? null,
      });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      if (!body || Object.keys(body).join() !== 'content') return send(res, 400, { error: 'invalid_request' });
      if (!content || content.length > 4000) return send(res, 400, { error: 'invalid_content' });
      if (content.startsWith('429:')) return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '60' });
      const message = {
        id: nextId++,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
        generation_status: 'pending',
      };
      msgs.push(message);
      generations.set(message.id, {
        conversationId: session.conversationId,
        startedAt: Date.now(),
        fail: content.startsWith('error:'),
        assistantId: null,
      });
      return send(res, 201, message);
    }
  }

  const events = /^\/widget\/v1\/messages\/(\d+)\/events\/$/.exec(path);
  if (events && req.method === 'GET') {
    const gen = generations.get(Number(events[1]));
    if (!gen || gen.conversationId !== session.conversationId) return send(res, 404, undefined);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    const ev = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    res.write('retry: 1000\n\n');
    ev('reset', { attempt: 1 });

    const closedAt = Date.now() + RECONNECT_MS;
    let sent = 0; // caracteres ya enviados en esta conexión (cada conexión reproduce desde el inicio)
    const timer = setInterval(() => {
      const elapsed = Date.now() - gen.startedAt;
      if (Date.now() >= closedAt) {
        ev('reconnect', {});
        return end();
      }
      if (elapsed < FIRST_DELTA_MS) return;
      if (gen.fail) {
        ev('error', { code: 'upstream_unavailable' });
        return end();
      }
      // ~20 caracteres cada 250 ms tras el primer delta, en lotes como el backend real.
      const target = Math.min(ANSWER.length, Math.floor(((elapsed - FIRST_DELTA_MS) / 250 + 1) * 20));
      if (target > sent) {
        ev('delta', { text: ANSWER.slice(sent, target) });
        sent = target;
      }
      if (sent >= ANSWER.length) {
        if (gen.assistantId === null) {
          gen.assistantId = nextId++;
          const user = msgs.find((m) => m.id === Number(events[1]));
          if (user) user.generation_status = 'completed';
          msgs.push({ id: gen.assistantId, role: 'assistant', content: ANSWER, created_at: new Date().toISOString() });
        }
        ev('complete', { message_id: gen.assistantId, sources: SOURCES });
        end();
      }
    }, 250);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    function end() {
      clearInterval(timer);
      clearInterval(ping);
      res.end();
    }
    req.on('close', () => (clearInterval(timer), clearInterval(ping)));
    return;
  }

  send(res, 404, undefined);
}).listen(PORT, () => console.log(`[mock] http://localhost:${PORT}  (reconnect ${RECONNECT_MS} ms, primer delta ${FIRST_DELTA_MS} ms)`));
