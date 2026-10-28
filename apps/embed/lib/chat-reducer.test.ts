import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, type ChatAction } from "./chat-reducer";

const run = (...actions: ChatAction[]) => actions.reduce(chatReducer, initialChatState);

describe("chatReducer", () => {
  it("reset vacía el borrador y evita texto duplicado tras reconectar", () => {
    const s = run(
      { type: "user-sent", key: "u", content: "hola" },
      { type: "assistant-start", key: "a" },
      { type: "delta", key: "a", text: "Ho" },
      { type: "reset", key: "a" },
      { type: "delta", key: "a", text: "Hola" },
    );
    expect(s.messages.at(-1)?.content).toBe("Hola");
    expect(s.phase).toBe("streaming");
  });

  it("complete cierra el borrador y guarda las fuentes", () => {
    const sources = [{ document_id: "d", filename: "x.txt", page: null, chunk: 0 }];
    const s = run(
      { type: "user-sent", key: "u", content: "hola" },
      { type: "assistant-start", key: "a" },
      { type: "delta", key: "a", text: "Hola [1]" },
      { type: "complete", key: "a", id: 9, sources },
    );
    expect(s.phase).toBe("idle");
    expect(s.messages.at(-1)).toMatchObject({ id: 9, status: "done", sources });
  });

  it("un fallo al guardar el mensaje lo retira y muestra un error", () => {
    const s = run({ type: "user-sent", key: "u", content: "hola" }, { type: "user-failed", key: "u", code: "rate_limited" });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toMatchObject({ status: "error", errorCode: "rate_limited" });
    expect(s.phase).toBe("idle");
  });
});

describe("chatReducer: notas de voz", () => {
  it("la burbuja pasa de transcribiendo a texto", () => {
    const s = run(
      { type: "voice-sent", key: "u", url: "blob:x" },
      { type: "user-saved", key: "u", id: 5 },
      { type: "transcribed", key: "u", content: "hola" },
    );
    expect(s.messages[0]).toMatchObject({ id: 5, content: "hola", voice: { transcribing: false, url: "blob:x" } });
  });

  it("si la transcripción falla, la burbuja deja de mostrar 'transcribiendo'", () => {
    const s = run({ type: "voice-sent", key: "u", url: "blob:x" }, { type: "transcription-failed", key: "u" });
    expect(s.messages[0]).toMatchObject({ content: "", voice: { transcribing: false } });
  });
});
