import type { Source } from "@widget/api-client";

export interface UiMessage {
  /** Clave local estable; el `id` del backend llega más tarde. */
  key: string;
  id?: number;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** Solo en el asistente: `streaming` mientras se genera, `error` si falló. */
  status: "done" | "streaming" | "error";
  errorCode?: string;
  /** Solo en el usuario: nota de voz. `transcribing` hasta que llega el texto. */
  voice?: { transcribing: boolean; /** URL local (blob:) de la grabación; el backend borra el audio tras transcribirlo. */ url?: string };
}

export interface ChatState {
  messages: UiMessage[];
  /** `waiting`: enviado, sin delta todavía; `streaming`: llegando texto. */
  phase: "idle" | "waiting" | "streaming";
}

export type ChatAction =
  | { type: "user-sent"; key: string; content: string }
  | { type: "voice-sent"; key: string; url: string }
  | { type: "user-saved"; key: string; id: number }
  | { type: "user-failed"; key: string; code: string }
  | { type: "transcribed"; key: string; content: string }
  | { type: "transcription-failed"; key: string }
  | { type: "assistant-start"; key: string }
  | { type: "reset"; key: string }
  | { type: "delta"; key: string; text: string }
  | { type: "complete"; key: string; id: number; sources: Source[]; content?: string }
  | { type: "assistant-failed"; key: string; code: string };

export const initialChatState: ChatState = { messages: [], phase: "idle" };

const patch = (state: ChatState, key: string, fn: (m: UiMessage) => UiMessage): UiMessage[] =>
  state.messages.map((m) => (m.key === key ? fn(m) : m));

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "user-sent":
      return {
        phase: "waiting",
        messages: [...state.messages, { key: action.key, role: "user", content: action.content, status: "done" }],
      };
    case "voice-sent":
      return {
        phase: "waiting",
        messages: [
          ...state.messages,
          { key: action.key, role: "user", content: "", status: "done", voice: { transcribing: true, url: action.url } },
        ],
      };
    case "user-saved":
      return { ...state, messages: patch(state, action.key, (m) => ({ ...m, id: action.id })) };
    case "user-failed":
      // El mensaje no se guardó: se retira y se avisa con una burbuja de error.
      return {
        phase: "idle",
        messages: [
          ...state.messages.filter((m) => m.key !== action.key),
          { key: `${action.key}-err`, role: "assistant", content: "", status: "error", errorCode: action.code },
        ],
      };
    case "transcribed":
      return {
        ...state,
        messages: patch(state, action.key, (m) => ({ ...m, content: action.content, voice: { ...m.voice, transcribing: false } })),
      };
    case "transcription-failed":
      return {
        ...state,
        messages: patch(state, action.key, (m) => ({ ...m, voice: { ...m.voice, transcribing: false } })),
      };
    case "assistant-start":
      return {
        phase: "waiting",
        messages: [...state.messages, { key: action.key, role: "assistant", content: "", status: "streaming" }],
      };
    case "reset":
      return { phase: "waiting", messages: patch(state, action.key, (m) => ({ ...m, content: "" })) };
    case "delta":
      return {
        phase: "streaming",
        messages: patch(state, action.key, (m) => ({ ...m, content: m.content + action.text })),
      };
    case "complete":
      return {
        phase: "idle",
        messages: patch(state, action.key, (m) => ({
          ...m,
          id: action.id,
          content: action.content ?? m.content,
          sources: action.sources,
          status: "done",
        })),
      };
    case "assistant-failed":
      return {
        phase: "idle",
        messages: patch(state, action.key, (m) => ({ ...m, status: "error", errorCode: action.code })),
      };
  }
}
