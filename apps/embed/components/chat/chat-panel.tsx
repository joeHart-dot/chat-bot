"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/use-chat";
import type { HostSession } from "@/lib/host-protocol";
import { strings } from "@/lib/i18n";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";

interface Props {
  session: HostSession;
  /** La sesión anterior caducó y esta es una conversación nueva. */
  renewed: boolean;
  /** La sesión caducó y aún no ha llegado otra. */
  expired: boolean;
  onUnauthorized(): void;
  onClose(): void;
}

export function ChatPanel({ session, renewed, expired, onUnauthorized, onClose }: Props) {
  const t = strings(session.lang);
  const { messages, phase, audioAvailable, send, sendVoice } = useChat({ session, onUnauthorized });
  const log = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Sigue el final del hilo solo si la persona no se ha desplazado hacia arriba.
  useEffect(() => {
    const el = log.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="flex h-full flex-col bg-background" aria-label={t.title}>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-sm font-semibold">{t.title}</h1>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t.close}>
          <X />
        </Button>
      </header>

      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto px-4 py-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {renewed && (
          <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t.expired}</p>
        )}
        {messages.length === 0 && <p className="text-sm text-muted-foreground">{t.welcome}</p>}
        <ul className="space-y-3">
          {messages.map((m) => (
            <MessageBubble key={m.key} message={m} t={t} />
          ))}
        </ul>
      </div>

      <Composer
        t={t}
        disabled={phase !== "idle" || expired}
        audioAvailable={audioAvailable}
        onSend={send}
        onSendVoice={sendVoice}
      />
    </section>
  );
}
