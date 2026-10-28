"use client";

import type { FrameToHost } from "@widget/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { hostMessageSchema, type HostSession } from "@/lib/host-protocol";

/** Anticipación con la que se pide una sesión nueva antes de que caduque la actual. */
const RENEW_MARGIN_MS = 5_000;

function readParentOrigin(): string | null {
  if (window.parent === window) return null;
  try {
    const raw = new URLSearchParams(window.location.search).get("parent");
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}

/**
 * Recibe la sesión que crea el loader en la página del cliente. El token vive solo en este estado:
 * nunca se guarda en localStorage ni en la URL.
 */
export function useHostSession() {
  const [parentOrigin, setParentOrigin] = useState<string | null | undefined>(undefined);
  const [session, setSession] = useState<HostSession | null>(null);
  const [expired, setExpired] = useState(false);
  /** `true` si esta sesión sustituye a una caducada: la conversación anterior se ha perdido. */
  const [renewed, setRenewed] = useState(false);
  const hadSession = useRef(false);
  const notifiedToken = useRef<string | null>(null);

  const post = useCallback(
    (msg: FrameToHost) => {
      if (parentOrigin) window.parent.postMessage(msg, parentOrigin);
    },
    [parentOrigin],
  );

  useEffect(() => {
    const origin = readParentOrigin();
    setParentOrigin(origin);
    if (!origin) return;

    const onMessage = (e: MessageEvent) => {
      // Solo el padre que declaró el loader, con su origen exacto.
      if (e.origin !== origin || e.source !== window.parent) return;
      const parsed = hostMessageSchema.safeParse(e.data);
      if (!parsed.success || parsed.data.type !== "widget:init") return;
      setSession(parsed.data);
      setExpired(false);
      setRenewed(hadSession.current);
      hadSession.current = true;
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "widget:ready" } satisfies FrameToHost, origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /** Pide otra sesión al loader (una sola vez por token). */
  const notifyExpired = useCallback(() => {
    if (!session || notifiedToken.current === session.token) return;
    notifiedToken.current = session.token;
    setExpired(true);
    post({ type: "widget:session-expired" });
  }, [session, post]);

  useEffect(() => {
    if (!session) return;
    const ms = Date.parse(session.expiresAt) - Date.now() - RENEW_MARGIN_MS;
    const timer = setTimeout(notifyExpired, Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [session, notifyExpired]);

  const requestClose = useCallback(() => post({ type: "widget:close" }), [post]);

  return { parentOrigin, session, expired, renewed, notifyExpired, requestClose };
}
