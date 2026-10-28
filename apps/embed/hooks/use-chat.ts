"use client";

import { ApiError, createChatApi, streamReply, type ChatMessage } from "@widget/api-client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { chatReducer, initialChatState } from "@/lib/chat-reducer";
import type { HostSession } from "@/lib/host-protocol";

interface Options {
  session: HostSession;
  /** El backend respondió 401: el token caducó o se revocó. */
  onUnauthorized(): void;
}

/**
 * La transcripción la hace un worker que puede estar detrás de otras generaciones: se sondea con
 * espera creciente durante este tiempo antes de rendirse.
 */
const TRANSCRIPTION_TIMEOUT_MS = 180_000;

const isUnauthorized = (code: string) => code === "unauthorized" || code === "http_401";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

function errorCode(err: unknown): string {
  if (!(err instanceof ApiError)) return "network";
  return err.status === 429 ? "rate_limited" : (err.code ?? `http_${err.status}`);
}

export function useChat({ session, onUnauthorized }: Options) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  /** Pasa a `false` si el backend responde `audio_unavailable`: no hay forma de saberlo antes. */
  const [audioAvailable, setAudioAvailable] = useState(true);
  const api = useMemo(
    () => createChatApi({ baseUrl: session.apiBase }, session.token),
    [session.apiBase, session.token],
  );
  const abort = useRef<AbortController | null>(null);
  const counter = useRef(0);
  /** Una sola respuesta en curso: el hilo es secuencial y el botón de enviar se deshabilita. */
  const busy = useRef(false);

  /** URLs locales de las grabaciones: se liberan al cerrar el chat. */
  const objectUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      abort.current?.abort();
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  /** Sondea el historial hasta que la nota de voz tiene texto (o falla). */
  const pollTranscription = useCallback(
    async (savedId: number, userKey: string, signal: AbortSignal, voice: { done: boolean; failed: boolean }) => {
      const started = Date.now();
      for (let i = 0; Date.now() - started < TRANSCRIPTION_TIMEOUT_MS; i++) {
        await sleep(Math.min(1500 + i * 250, 4000), signal);
        if (signal.aborted || voice.done) return;
        try {
          const page = await api.listMessages(savedId - 1);
          const m = page.messages.find((x) => x.id === savedId);
          if (m && m.awaiting_transcription !== true) {
            voice.done = true;
            voice.failed = !m.content;
            dispatch(m.content ? { type: "transcribed", key: userKey, content: m.content } : { type: "transcription-failed", key: userKey });
            return;
          }
        } catch (err) {
          if (isUnauthorized(errorCode(err))) return onUnauthorized();
          // fallo de red puntual: se sigue sondeando
        }
      }
      if (!voice.done) {
        voice.done = true;
        voice.failed = true;
        dispatch({ type: "transcription-failed", key: userKey });
      }
    },
    [api, onUnauthorized],
  );

  /** Lee la respuesta por SSE; si es nota de voz, sondea a la vez la transcripción. */
  const run = useCallback(
    async (saved: ChatMessage, userKey: string, botKey: string, isVoice: boolean) => {
      dispatch({ type: "user-saved", key: userKey, id: saved.id });
      dispatch({ type: "assistant-start", key: botKey });

      if (saved.generation_status === "unconfigured") {
        dispatch({ type: "assistant-failed", key: botKey, code: "unconfigured" });
        busy.current = false;
        return;
      }

      const ctrl = new AbortController();
      abort.current = ctrl;
      const voice = { done: !isVoice, failed: false };
      if (isVoice) void pollTranscription(saved.id, userKey, ctrl.signal, voice);

      const finish = () => {
        ctrl.abort(); // detiene también el sondeo
        busy.current = false;
      };

      await streamReply(
        { baseUrl: session.apiBase, token: session.token, messageId: saved.id, signal: ctrl.signal },
        {
          onReset: () => dispatch({ type: "reset", key: botKey }),
          onDelta: (text) => dispatch({ type: "delta", key: botKey, text }),
          onComplete: (id, sources) => {
            // El historial es la fuente de verdad: texto definitivo y, en notas de voz, la transcripción.
            void api
              .listMessages(isVoice ? saved.id - 1 : saved.id)
              .catch(() => undefined)
              .then((page) => {
                const final = page?.messages.find((m) => m.id === id)?.content;
                const transcript = page?.messages.find((m) => m.id === saved.id)?.content;
                if (isVoice && !voice.done) {
                  voice.done = true;
                  dispatch(transcript ? { type: "transcribed", key: userKey, content: transcript } : { type: "transcription-failed", key: userKey });
                }
                dispatch({ type: "complete", key: botKey, id, sources, ...(final ? { content: final } : {}) });
                finish();
              });
          },
          onError: (code) => {
            if (isUnauthorized(code)) onUnauthorized();
            // Si la nota de voz no llegó a transcribirse, el fallo es del audio, no de la respuesta.
            const audioFailed = isVoice && (!voice.done || voice.failed);
            if (isVoice && !voice.done) dispatch({ type: "transcription-failed", key: userKey });
            voice.done = true;
            dispatch({ type: "assistant-failed", key: botKey, code: audioFailed ? "audio_failed" : code });
            finish();
          },
        },
      );
    },
    [api, pollTranscription, session.apiBase, session.token, onUnauthorized],
  );

  const submit = useCallback(
    async (isVoice: boolean, upload: () => Promise<ChatMessage>, optimistic: (userKey: string) => void) => {
      if (busy.current) return;
      busy.current = true;
      const n = ++counter.current;
      const userKey = `u${n}`;
      optimistic(userKey);
      try {
        await run(await upload(), userKey, `a${n}`, isVoice);
      } catch (err) {
        const code = errorCode(err);
        if (isUnauthorized(code)) onUnauthorized();
        if (code === "audio_unavailable") setAudioAvailable(false);
        dispatch({ type: "user-failed", key: userKey, code });
        busy.current = false;
      }
    },
    [run, onUnauthorized],
  );

  const send = useCallback(
    (raw: string) => {
      const content = raw.trim();
      if (!content) return Promise.resolve();
      return submit(
        false,
        () => api.sendMessage(content),
        (key) => dispatch({ type: "user-sent", key, content }),
      );
    },
    [api, submit],
  );

  const sendVoice = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      objectUrls.current.push(url);
      return submit(
        true,
        () => api.sendAudio(blob),
        (key) => dispatch({ type: "voice-sent", key, url }),
      );
    },
    [api, submit],
  );

  return { ...state, audioAvailable, send, sendVoice };
}
