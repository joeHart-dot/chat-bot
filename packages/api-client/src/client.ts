import { ApiError, type ChatMessage, type MessagePage, type Session } from './types';

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  let code: string | null = null;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') code = body.error;
  } catch {
    // 404 sin cuerpo u otras respuestas no JSON
  }
  const retry = Number(res.headers.get('Retry-After'));
  throw new ApiError(res.status, code, Number.isFinite(retry) && retry > 0 ? retry : null);
}

/**
 * Crea una sesión pública. Debe llamarse desde la página del cliente (origen registrado).
 * No envía cookies ni credenciales.
 */
export async function createSession(opts: ClientOptions, key: string): Promise<Session> {
  const res = await (opts.fetch ?? fetch)(`${opts.baseUrl}/widget/v1/sessions/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const data = await parse<{ conversation_id: string; access_token: string; expires_at: string }>(res);
  return {
    conversationId: data.conversation_id,
    accessToken: data.access_token,
    expiresAt: data.expires_at,
  };
}

/** Operaciones con el token `ws_...`. Solo se envía `Authorization` (y `Content-Type` en POST). */
export function createChatApi(opts: ClientOptions, token: string) {
  const f = opts.fetch ?? fetch;
  const auth = { Authorization: `Bearer ${token}` };
  const url = (path: string) => `${opts.baseUrl}/widget/v1${path}`;

  return {
    async sendMessage(content: string): Promise<ChatMessage> {
      const res = await f(url('/messages/'), {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      return parse<ChatMessage>(res);
    },

    /** Sube una nota de voz. No se fija `Content-Type`: el navegador añade el boundary del multipart. */
    async sendAudio(audio: Blob): Promise<ChatMessage> {
      const form = new FormData();
      form.append('audio', audio, 'audio');
      return parse<ChatMessage>(await f(url('/messages/audio/'), { method: 'POST', headers: auth, body: form }));
    },

    async listMessages(afterId?: number): Promise<MessagePage> {
      const qs = afterId === undefined ? '' : `?after_id=${afterId}`;
      return parse<MessagePage>(await f(url(`/messages/${qs}`), { headers: auth }));
    },

    async revokeSession(): Promise<void> {
      await parse<void>(await f(url('/sessions/current'), { method: 'DELETE', headers: auth }));
    },
  };
}
