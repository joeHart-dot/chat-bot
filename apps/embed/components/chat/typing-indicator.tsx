"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/lib/i18n";

/** Con el LLM actual la espera puede ser de minutos: tras unos segundos se avisa. */
const SLOW_AFTER_MS = 15_000;

export function TypingIndicator({ t }: { t: Strings }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status">
      <span className="sr-only">{t.typing}</span>
      <span className="flex h-5 items-center gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {slow && <p className="mt-1 text-xs text-muted-foreground">{t.slow}</p>}
    </div>
  );
}
