import { z } from "zod";

/** Mensajes que el iframe acepta del loader. Todo `postMessage` es entrada no confiable: se valida. */
export const hostMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("widget:init"),
    apiBase: z.string().url(),
    token: z.string().startsWith("ws_"),
    conversationId: z.string(),
    expiresAt: z.string(),
    lang: z.string(),
  }),
  z.object({ type: z.literal("widget:open") }),
  z.object({ type: z.literal("widget:close") }),
]);

export type HostSession = Extract<z.infer<typeof hostMessageSchema>, { type: "widget:init" }>;
