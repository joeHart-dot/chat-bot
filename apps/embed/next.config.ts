import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** Origen de la API, para cerrar connect-src a ese único destino. */
function apiOrigin(): string | null {
  try {
    return process.env.WIDGET_API_BASE ? new URL(process.env.WIDGET_API_BASE).origin : null;
  } catch {
    return null;
  }
}

// El chat se embebe en webs de terceros: sin X-Frame-Options y con frame-ancestors configurable.
// La restricción real de orígenes la aplica el backend por clave pública.
const frameAncestors = process.env.WIDGET_FRAME_ANCESTORS?.trim() || "*";

// Next inyecta scripts y estilos inline. En desarrollo la CSP se limita a frame-ancestors (HMR
// necesita eval y websockets).
const csp = isProd
  ? [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      `connect-src 'self' ${apiOrigin() ?? "https:"}`,
      `frame-ancestors ${frameAncestors}`,
    ].join("; ")
  : `frame-ancestors ${frameAncestors}`;

const nextConfig: NextConfig = {
  transpilePackages: ["@widget/api-client"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/embed",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
