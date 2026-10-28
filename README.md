# Widget de chat

Chatbot embebible para webs de empresa. El cliente pega un `<script>`; el widget crea una sesión pública
contra el backend, envía mensajes de texto o notas de voz y muestra la respuesta en streaming con sus fuentes.

Contrato del backend: [guía de desarrollo del widget](guia-desarrollo-widget.md) y [guía de audio](guia-widget-audio.md).

## Estructura

| Carpeta | Qué es |
|---|---|
| `apps/embed` | App Next.js. `/embed` es el chat que se carga en el iframe; `/` documenta la instalación. Sirve también el loader en `/widget/v1/loader.js`. |
| `packages/loader` | Script que se instala en la web del cliente: botón flotante (Shadow DOM), creación de sesión e iframe. Sin dependencias, ~4 KB. |
| `packages/api-client` | Cliente del backend: sesión, mensajes, audio y lector SSE con reconexión. |
| `tools/mock-server` | Backend simulado para desarrollar sin depender del real. No se despliega. |

## Requisitos

Node 20.12 o superior y pnpm 10.

```bash
pnpm install
```

## Configuración

Todo se configura con variables de entorno en un único archivo, `apps/embed/.env.local`
(plantilla en [`apps/embed/.env.example`](apps/embed/.env.example)). Lo leen la app Next y el build del loader.

| Variable | Para qué sirve |
|---|---|
| `WIDGET_API_BASE` | URL del backend. Se incrusta en el loader como valor por defecto y cierra `connect-src` de la CSP a ese origen. |
| `WIDGET_FRAME_ANCESTORS` | Quién puede embeber el chat (`frame-ancestors`). Por defecto `*`. |
| `ENABLE_DEMO`, `DEMO_WIDGET_KEY` | Activan la página `/demo`, con el widget instalado. Déjala desactivada en producción. |

`WIDGET_API_BASE` se aplica **al compilar el loader**: si cambia, hay que volver a compilar.

## Desarrollo

```bash
pnpm dev
```

Arranca la app, el loader en modo watch y el servidor simulado. Para probar contra el simulado, pon en
`apps/embed/.env.local` la URL del simulado en `WIDGET_API_BASE`, `ENABLE_DEMO=true` y cualquier valor `pk_...`
en `DEMO_WIDGET_KEY`, y abre `/demo`. El simulado se configura con variables de entorno
(ver la cabecera de [`tools/mock-server/server.mjs`](tools/mock-server/server.mjs)).

Contra el backend real, registra primero el origen desde el que sirves `/demo` y usa la clave `pk_...` que
se genere para él.

```bash
pnpm typecheck
pnpm test
```

## Despliegue

El build genera primero el loader y después la app Next:

```bash
pnpm build          # desde la raíz
pnpm --filter @widget/embed start
```

En un proveedor como Vercel: directorio raíz `apps/embed`, activar "incluir archivos fuera del directorio
raíz" (el monorepo comparte `packages/`), comando de build `pnpm build` y las variables de la tabla anterior.

Tras desplegar:

1. Los clientes instalan `https://<tu-dominio>/widget/v1/loader.js` con su `data-widget-key` (ver `/`).
2. El backend necesita `WIDGET_FRONTEND_ORIGIN` con el origen HTTPS de este despliegue; sin ella el iframe no
   puede usar el token de sesión que le pasa el loader.
3. Si el cliente define un `Permissions-Policy` restrictivo, debe permitir el micrófono para las notas de voz.
4. Cada web de cliente necesita su origen registrado en el backend, con su propia clave `pk_...`.

## Seguridad

- El token de sesión `ws_...` vive solo en memoria del iframe: nunca en `localStorage` ni en URLs.
- Los mensajes `postMessage` se validan por origen exacto y con esquema (Zod).
- La respuesta del asistente se renderiza como Markdown sin HTML crudo y sanitizado.
- Las grabaciones de voz se conservan solo en el navegador (URL `blob:`); el backend las borra tras transcribirlas.
