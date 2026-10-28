import { createSession, type FrameToHost, type HostToFrame, type Session } from '@widget/api-client';
import { css } from './styles';

const script = document.currentScript as HTMLScriptElement | null;
const key = script?.dataset.widgetKey;
if (!script || !key) {
  console.error('[widget] Falta data-widget-key en el <script>.');
} else {
  boot(script, key);
}

function boot(script: HTMLScriptElement, key: string) {
  // `__DEFAULT_API_BASE__` se fija al compilar (WIDGET_API_BASE); `data-api-base` lo sobrescribe.
  const apiBase = (script.dataset.apiBase || __DEFAULT_API_BASE__).replace(/\/$/, '');
  if (!apiBase) {
    console.error('[widget] Falta la URL de la API (data-api-base o WIDGET_API_BASE al compilar).');
    return;
  }
  const lang = script.dataset.lang ?? (document.documentElement.lang.slice(0, 2) || 'es');
  const embedOrigin = new URL(script.src, location.href).origin;
  const embedUrl = `${embedOrigin}/embed?parent=${encodeURIComponent(location.origin)}`;

  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>${css}</style>
    <button class="launcher" type="button" aria-label="Abrir chat" aria-expanded="false" aria-controls="panel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
    </button>
    <div class="panel" id="panel" hidden></div>`;
  const launcher = root.querySelector<HTMLButtonElement>('.launcher')!;
  const panel = root.querySelector<HTMLDivElement>('.panel')!;

  let iframe: HTMLIFrameElement | null = null;
  let session: Session | null = null;
  let isOpen = false;
  let starting: Promise<void> | null = null;

  const post = (msg: HostToFrame) => iframe?.contentWindow?.postMessage(msg, embedOrigin);

  async function newSession() {
    session = await createSession({ baseUrl: apiBase }, key);
  }

  function sendInit() {
    if (!session) return;
    post({
      type: 'widget:init',
      apiBase,
      token: session.accessToken,
      conversationId: session.conversationId,
      expiresAt: session.expiresAt,
      lang,
    });
  }

  function mountIframe() {
    iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.title = 'Chat de asistencia';
    iframe.setAttribute('allow', 'microphone');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    panel.appendChild(iframe);
  }

  async function start() {
    try {
      await newSession();
      mountIframe();
    } catch (err) {
      starting = null;
      setOpen(false);
      console.error('[widget] No se pudo crear la sesión', err instanceof Error ? err.message : err);
    }
  }

  function setOpen(next: boolean) {
    isOpen = next;
    panel.hidden = !next;
    launcher.setAttribute('aria-expanded', String(next));
    launcher.setAttribute('aria-label', next ? 'Cerrar chat' : 'Abrir chat');
    if (next) {
      starting ??= start();
      iframe?.focus();
    } else {
      launcher.focus();
    }
  }

  launcher.addEventListener('click', () => setOpen(!isOpen));
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && isOpen) setOpen(false);
  });

  window.addEventListener('message', (e) => {
    // Solo se confía en el iframe que creamos, con el origen exacto del embed.
    if (e.origin !== embedOrigin || !iframe || e.source !== iframe.contentWindow) return;
    const msg = e.data as FrameToHost | null;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'widget:ready':
        sendInit();
        break;
      case 'widget:close':
        setOpen(false);
        break;
      case 'widget:session-expired':
        // Sin renovación en el backend: otra sesión abre una conversación nueva.
        newSession().then(sendInit, () => console.error('[widget] No se pudo renovar la sesión'));
        break;
    }
  });

  document.body.appendChild(host);

  (window as unknown as { ChatWidget: unknown }).ChatWidget = {
    open: () => setOpen(true),
    close: () => setOpen(false),
  };
}
