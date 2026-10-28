/** Mensajes `postMessage` entre el loader (página del cliente) y el iframe del chat. */
export type HostToFrame =
  | {
      type: 'widget:init';
      apiBase: string;
      token: string;
      conversationId: string;
      expiresAt: string;
      lang: string;
    }
  | { type: 'widget:open' }
  | { type: 'widget:close' };

export type FrameToHost =
  | { type: 'widget:ready' }
  | { type: 'widget:close' }
  | { type: 'widget:session-expired' };
