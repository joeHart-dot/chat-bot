"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { UiMessage } from "@/lib/chat-reducer";
import type { Strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MessageMarkdown } from "./message-markdown";
import { TypingIndicator } from "./typing-indicator";

function errorText(code: string | undefined, t: Strings): string {
  if (code === "rate_limited") return t.rateLimited;
  if (code === "audio_failed") return t.audioFailed;
  if (code === "audio_unavailable") return t.audioUnavailable;
  if (code === "unsupported_audio") return t.audioUnsupported;
  if (code === "body_too_large") return t.audioTooLarge;
  if (code === "unconfigured" || code === "generation_unconfigured") return t.unconfigured;
  return t.genericError;
}

export function MessageBubble({ message, t }: { message: UiMessage; t: Strings }) {
  const isUser = message.role === "user";
  const waiting = message.status === "streaming" && message.content === "";

  return (
    <li className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      {!isUser && (
        <Avatar className="mt-0.5 size-7 shrink-0" aria-hidden>
          <AvatarFallback className="bg-primary text-xs text-primary-foreground">AI</AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          message.status === "error" && "bg-destructive/10 text-destructive",
        )}
        aria-busy={message.status === "streaming"}
      >
        <span className="sr-only">{isUser ? t.you : t.assistant}: </span>
        {isUser ? (
          <div className="space-y-1.5">
            {message.voice?.url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- nota de voz del propio usuario; la transcripción va debajo
              <audio controls preload="metadata" src={message.voice.url} aria-label={t.voiceNote} className="h-9 w-56 max-w-full" />
            )}
            {message.voice ? (
              <p className="whitespace-pre-wrap break-words text-xs italic opacity-80">
                {message.voice.transcribing ? t.transcribing : message.content}
              </p>
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
        ) : message.status === "error" ? (
          <p>{errorText(message.errorCode, t)}</p>
        ) : waiting ? (
          <TypingIndicator t={t} />
        ) : (
          <MessageMarkdown text={message.content} sources={message.sources} />
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 border-t border-foreground/10 pt-2 text-xs">
            <p className="font-medium">{t.sources}</p>
            <ol className="mt-1 space-y-0.5">
              {message.sources.map((s, i) => (
                <li key={`${s.document_id}-${s.chunk}-${i}`} id={`source-${i + 1}`} tabIndex={-1} className="outline-none focus-visible:underline">
                  [{i + 1}] {s.filename}
                  {s.page !== null && ` (${t.page} ${s.page})`}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </li>
  );
}
