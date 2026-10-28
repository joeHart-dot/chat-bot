"use client";

import { Mic, SendHorizontal, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAudioRecorder, type RecorderError } from "@/hooks/use-audio-recorder";
import type { Strings } from "@/lib/i18n";

const MAX_LENGTH = 4000;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function recorderErrorText(error: RecorderError, t: Strings): string {
  switch (error) {
    case "denied":
      return t.micDenied;
    case "empty":
      return t.audioEmpty;
    case "too_large":
      return t.audioTooLarge;
    case "unavailable":
      return t.micUnavailable;
  }
}

export function Composer({
  t,
  disabled,
  audioAvailable,
  onSend,
  onSendVoice,
}: {
  t: Strings;
  /** Hay una respuesta en curso o la sesión caducó. */
  disabled: boolean;
  /** El backend no tiene transcripción configurada. */
  audioAvailable: boolean;
  onSend(text: string): void;
  onSendVoice(audio: Blob): void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const recorder = useAudioRecorder({ onRecorded: onSendVoice });
  const canSend = !disabled && value.trim().length > 0;
  const showMic = recorder.supported && audioAvailable;

  function submit() {
    if (!canSend) return;
    onSend(value);
    setValue("");
    ref.current?.focus();
  }

  if (recorder.recording) {
    return (
      <div className="flex items-center gap-2 border-t p-3">
        <Button type="button" variant="ghost" className="size-9 shrink-0" onClick={recorder.cancel} aria-label={t.cancelRecording}>
          <X />
        </Button>
        <div role="status" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="size-2.5 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden />
          {/* El texto se anuncia una vez; el contador cambia cada segundo y no se anuncia. */}
          <span>{t.recording}</span>
          <span className="tabular-nums text-muted-foreground" aria-hidden>
            {clock(recorder.elapsed)}
          </span>
        </div>
        <Button type="button" className="size-9 shrink-0" onClick={recorder.stop} aria-label={t.sendRecording}>
          <SendHorizontal />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter envía; Shift+Enter inserta salto de línea. No se envía mientras se compone (IME).
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label={t.inputLabel}
          placeholder={t.placeholder}
          maxLength={MAX_LENGTH}
          rows={1}
          className="max-h-32 min-h-9 min-w-0 flex-1 resize-none"
        />
        {showMic && (
          <Button
            type="button"
            variant="outline"
            className="size-9 shrink-0"
            onClick={recorder.start}
            aria-label={t.record}
            disabled={disabled}
          >
            <Mic />
          </Button>
        )}
        <Button type="submit" className="size-9 shrink-0" disabled={!canSend} aria-label={t.send}>
          <SendHorizontal />
        </Button>
      </div>
      {recorder.error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {recorderErrorText(recorder.error, t)}
        </p>
      )}
    </form>
  );
}
