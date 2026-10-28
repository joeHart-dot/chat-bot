export type GenerationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unconfigured';

export interface Session {
  conversationId: string;
  accessToken: string;
  expiresAt: string;
}

export interface Source {
  document_id: string;
  filename: string;
  page: number | null;
  chunk: number;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  /** Solo aparece en los mensajes del usuario. */
  generation_status?: GenerationStatus;
  /** Solo en notas de voz: `true` hasta que el worker sustituye `content` por la transcripción. */
  awaiting_transcription?: boolean;
}

export interface MessagePage {
  messages: ChatMessage[];
  has_more: boolean;
  next_cursor: number | null;
}

/** Error HTTP del backend. `code` es el campo `error` del cuerpo, si lo hay. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    /** Segundos indicados por `Retry-After` (429), si vienen. */
    readonly retryAfter: number | null = null,
  ) {
    super(code ? `${status} ${code}` : `HTTP ${status}`);
    this.name = 'ApiError';
  }
}
