import { createParser } from 'eventsource-parser';
import { ApiError, type Source } from './types';

export interface StreamHandlers {
  /** Vaciar el borrador: cada conexión (y cada reintento del backend) reproduce desde el inicio. */
  onReset(): void;
  onDelta(text: string): void;
  onComplete(messageId: number, sources: Source[]): void;
  /** `code` es opaco; también puede ser `http_<status>` o `too_many_reconnects`. */
  onError(code: string): void;
}

export interface StreamOptions {
  baseUrl: string;
  token: string;
  messageId: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  /** Reconexiones máximas (el servidor cierra a los 120 s). Por defecto 20, cubre la vida de la sesión. */
  maxReconnects?: number;
  /** Pausa antes de reabrir tras un corte sin `reconnect`. Por defecto 1000 ms. */
  retryDelayMs?: number;
}

type Outcome = 'done' | 'reconnect' | 'closed';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

/**
 * Lee `/messages/{id}/events/` con fetch (EventSource no permite `Authorization`) y
 * reabre la conexión tras `reconnect`. Resuelve al terminar con `complete` o `error`, o al abortar.
 */
export async function streamReply(opts: StreamOptions, on: StreamHandlers): Promise<void> {
  const f = opts.fetch ?? fetch;
  const max = opts.maxReconnects ?? 20;
  const url = `${opts.baseUrl}/widget/v1/messages/${opts.messageId}/events/`;

  for (let attempt = 0; attempt <= max; attempt++) {
    if (opts.signal?.aborted) return;
    let outcome: Outcome;
    try {
      outcome = await readOnce(f, url, opts, on);
    } catch (err) {
      if (opts.signal?.aborted) return;
      if (err instanceof ApiError) return on.onError(err.code ?? `http_${err.status}`);
      outcome = 'closed'; // corte de red: se reintenta igual que un cierre sin evento
    }
    if (outcome === 'done') return;
    if (outcome === 'closed') await sleep(opts.retryDelayMs ?? 1000, opts.signal);
  }
  on.onError('too_many_reconnects');
}

async function readOnce(
  f: typeof fetch,
  url: string,
  opts: StreamOptions,
  on: StreamHandlers,
): Promise<Outcome> {
  const res = await f(url, {
    headers: { Authorization: `Bearer ${opts.token}`, Accept: 'text/event-stream' },
    signal: opts.signal ?? null,
  });
  if (!res.ok || !res.body) {
    let code: string | null = null;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string') code = body.error;
    } catch {
      // sin cuerpo JSON
    }
    throw new ApiError(res.status, code);
  }

  let outcome: Outcome = 'closed';
  const parser = createParser({
    onEvent(ev) {
      let p: Record<string, unknown>;
      try {
        p = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      switch (ev.event) {
        case 'reset':
          on.onReset();
          break;
        case 'delta':
          if (typeof p.text === 'string') on.onDelta(p.text);
          break;
        case 'complete':
          outcome = 'done';
          on.onComplete(Number(p.message_id), Array.isArray(p.sources) ? (p.sources as Source[]) : []);
          break;
        case 'error':
          outcome = 'done';
          on.onError(typeof p.code === 'string' ? p.code : 'generation_failed');
          break;
        case 'reconnect':
          outcome = 'reconnect';
          break;
      }
    },
  });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(value);
    if (outcome !== 'closed') {
      await reader.cancel();
      break;
    }
  }
  return outcome;
}
