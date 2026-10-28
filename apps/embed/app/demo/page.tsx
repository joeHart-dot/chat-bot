import { notFound } from "next/navigation";
import Script from "next/script";

// Se evalúa en cada petición para que ENABLE_DEMO funcione sin recompilar.
export const dynamic = "force-dynamic";

export const metadata = { title: "Demo del widget", robots: { index: false } };

/** Simula la web de un cliente con el widget instalado. Solo existe si ENABLE_DEMO=true. */
export default function DemoPage() {
  const key = process.env.DEMO_WIDGET_KEY;
  if (process.env.ENABLE_DEMO !== "true" || !key) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-3 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Web de un cliente (demo)</h1>
      <p className="text-muted-foreground">
        Esta página simula la web de un cliente. El botón del chat lo inyecta el loader.
      </p>
      <Script
        src="/widget/v1/loader.js"
        strategy="afterInteractive"
        data-widget-key={key}
        data-lang="es"
      />
    </main>
  );
}
