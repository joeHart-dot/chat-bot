export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Chat de asistencia</h1>
        <p className="text-muted-foreground">
          Asistente conversacional para webs de empresa. Responde preguntas con la documentación del cliente y
          cita las fuentes. Se instala con un único fragmento de código.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Instalación</h2>
        <p className="text-sm text-muted-foreground">Añade este script antes de cerrar la etiqueta body:</p>
        <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs leading-relaxed">
          {`<script async
  src="https://TU-DOMINIO/widget/v1/loader.js"
  data-widget-key="pk_..."
  data-lang="es"></script>`}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Atributos</h2>
        <dl className="divide-y rounded-lg border text-sm">
          {[
            ["data-widget-key", "Clave pública de la instalación (obligatoria)."],
            ["data-lang", "Idioma de la interfaz: es o en."],
            ["data-api-base", "URL del backend, si no es la configurada por defecto."],
          ].map(([name, text]) => (
            <div key={name} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
              <dt className="shrink-0 font-mono text-xs sm:w-40">{name}</dt>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
