"use client";

import { useHostSession } from "@/hooks/use-host-session";
import { strings } from "@/lib/i18n";
import { ChatPanel } from "./chat-panel";

export function ChatApp() {
  const { parentOrigin, session, expired, renewed, notifyExpired, requestClose } = useHostSession();

  if (parentOrigin === null) {
    return <p className="p-4 text-sm text-muted-foreground">{strings("es").noParent}</p>;
  }
  if (!session) {
    return <p className="p-4 text-sm text-muted-foreground">{strings("es").connecting}</p>;
  }
  // La clave por conversación reinicia el hilo cuando llega una sesión nueva.
  return (
    <ChatPanel
      key={session.conversationId}
      session={session}
      renewed={renewed}
      expired={expired}
      onUnauthorized={notifyExpired}
      onClose={requestClose}
    />
  );
}
