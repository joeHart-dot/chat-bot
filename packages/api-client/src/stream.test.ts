import { describe, expect, it } from 'vitest';
import { streamReply, type StreamHandlers } from './stream';

function sse(...blocks: string[]): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const b of blocks) c.enqueue(enc.encode(b));
        c.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}
const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const noop: StreamHandlers = { onReset() {}, onDelta() {}, onComplete() {}, onError() {} };
const base = { baseUrl: 'http://x', token: 't', messageId: 1 };

describe('streamReply', () => {
  it('reabre tras reconnect y no duplica texto gracias a reset', async () => {
    const calls = [
      () => sse('retry: 1000\n\n', ev('reset', { attempt: 1 }), ev('delta', { text: 'Ho' }), ev('reconnect', {})),
      () =>
        sse(
          ': ping\n\n',
          ev('reset', { attempt: 1 }),
          ev('delta', { text: 'Hola' }),
          ev('complete', { message_id: 7, sources: [] }),
        ),
    ];
    let i = 0;
    let draft = '';
    let done: number | null = null;
    await streamReply(
      { ...base, fetch: (async () => calls[i++]!()) as typeof fetch },
      {
        ...noop,
        onReset: () => (draft = ''),
        onDelta: (t) => (draft += t),
        onComplete: (id) => (done = id),
      },
    );
    expect(i).toBe(2);
    expect(draft).toBe('Hola');
    expect(done).toBe(7);
  });

  it('propaga el código del evento error', async () => {
    let code = '';
    await streamReply(
      { ...base, fetch: (async () => sse(ev('error', { code: 'upstream_unavailable' }))) as typeof fetch },
      { ...noop, onError: (c) => (code = c) },
    );
    expect(code).toBe('upstream_unavailable');
  });

  it('convierte un 409 HTTP en su código', async () => {
    let code = '';
    await streamReply(
      {
        ...base,
        fetch: (async () => new Response('{"error":"generation_unconfigured"}', { status: 409 })) as typeof fetch,
      },
      { ...noop, onError: (c) => (code = c) },
    );
    expect(code).toBe('generation_unconfigured');
  });
});

describe('createChatApi.sendAudio', () => {
  it('sube multipart con el campo audio y sin Content-Type manual', async () => {
    const { createChatApi } = await import('./client');
    let init: RequestInit | undefined;
    const api = createChatApi(
      {
        baseUrl: 'http://x',
        fetch: (async (_u: string, i: RequestInit) => {
          init = i;
          return new Response('{"id":3,"role":"user","content":"","created_at":"","awaiting_transcription":true}', { status: 201 });
        }) as unknown as typeof fetch,
      },
      'ws_t',
    );
    const msg = await api.sendAudio(new Blob(['x'], { type: 'audio/webm' }));
    expect(msg.awaiting_transcription).toBe(true);
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('audio')).toBeInstanceOf(Blob);
    expect(Object.keys(init?.headers as object)).toEqual(['Authorization']);
  });
});
