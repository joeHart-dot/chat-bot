"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Límite del backend: 5 MiB por archivo. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export type RecorderError = "denied" | "unavailable" | "empty" | "too_large";

// Chrome/Edge/Firefox graban webm u ogg; Safari, mp4. Todos están admitidos por el backend.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

interface Options {
  /** Corte automático de la grabación. */
  maxSeconds?: number;
  onRecorded(blob: Blob): void;
}

export function useAudioRecorder({ maxSeconds = 120, onRecorded }: Options) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<RecorderError | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const keep = useRef(true);
  const cb = useRef(onRecorded);
  cb.current = onRecorded;

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    // Al desmontar se descarta lo grabado y se apaga el micrófono.
    return () => {
      keep.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);

  // Temporizador y corte automático.
  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= maxSeconds) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recording, maxSeconds]);

  const start = useCallback(async () => {
    if (recorder.current) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "unavailable");
      return;
    }
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    // Bitrate bajo: una nota de voz de 2 minutos queda muy por debajo de los 5 MiB.
    const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32_000, ...(mimeType ? { mimeType } : {}) });
    const chunks: Blob[] = [];
    keep.current = true;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); // apaga el micrófono
      recorder.current = null;
      setRecording(false);
      if (!keep.current) return;
      const blob = new Blob(chunks, { type: rec.mimeType });
      if (blob.size === 0) return setError("empty");
      if (blob.size > MAX_AUDIO_BYTES) return setError("too_large");
      cb.current(blob);
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
  }, []);

  /** Termina y envía lo grabado. */
  const stop = useCallback(() => {
    keep.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  /** Termina y descarta lo grabado. */
  const cancel = useCallback(() => {
    keep.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  return { supported, recording, elapsed, error, start, stop, cancel };
}
