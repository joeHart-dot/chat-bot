"use client";

import type { Source } from "@widget/api-client";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

const CITE_HREF = /#(?:user-content-)?cite-(\d+)$/;

/** Convierte `[n]` en un enlace interno solo si `n` apunta a una fuente existente. */
function linkCitations(text: string, count: number): string {
  return text.replace(/\[(\d{1,2})\]/g, (match, n: string) =>
    Number(n) >= 1 && Number(n) <= count ? `[\\[${n}\\]](#cite-${n})` : match,
  );
}

function goToSource(n: string) {
  const el = document.getElementById(`source-${n}`);
  el?.scrollIntoView({ block: "nearest" });
  el?.focus();
}

const components: Components = {
  a({ href, children }) {
    const cite = href ? CITE_HREF.exec(href)?.[1] : undefined;
    if (cite) {
      return (
        <sup>
          <a
            href={`#source-${cite}`}
            className="px-0.5 font-medium text-primary underline-offset-2 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              goToSource(cite);
            }}
          >
            {children}
          </a>
        </sup>
      );
    }
    // Solo enlaces http(s) externos; el resto se muestra como texto.
    if (!href || !/^https?:\/\//i.test(href)) return <>{children}</>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
        {children}
      </a>
    );
  },
  img: () => null,
};

/**
 * El texto viene de un LLM: se renderiza como Markdown sin HTML crudo (react-markdown no lo
 * interpreta) y además pasa por rehype-sanitize. Nunca se usa innerHTML.
 */
export function MessageMarkdown({ text, sources }: { text: string; sources: Source[] | undefined }) {
  return (
    <div className="space-y-2 break-words [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_pre]:overflow-x-auto">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={components}>
        {linkCitations(text, sources?.length ?? 0)}
      </ReactMarkdown>
    </div>
  );
}
