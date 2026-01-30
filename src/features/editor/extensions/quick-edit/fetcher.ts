import ky from "ky";
import { z } from "zod";
import { toast } from "sonner";

const AI_SELECTION_STORAGE_KEY = "autodev_ai_selection";

const editRequestSchema = z.object({
  selectedCode: z.string(),
  fullCode: z.string(),
  instruction: z.string(),
  ai: z
    .object({
      provider: z.enum(["google", "groq", "openai"]).optional(),
      model: z.string().optional(),
    })
    .optional(),
});

const editResponseSchema = z.object({
  editedCode: z.string(),
});

type EditRequest = z.infer<typeof editRequestSchema>;
type EditResponse = z.infer<typeof editResponseSchema>;

export const fetcher = async (
  payload: EditRequest,
  signal: AbortSignal,
): Promise<string | null> => {
  try {
    const storedAi = (() => {
      if (typeof window === "undefined") return undefined;

      try {
        const raw = window.localStorage.getItem(AI_SELECTION_STORAGE_KEY);
        if (!raw) return undefined;
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    })();

    const validatedPayload = editRequestSchema.parse({
      ...payload,
      ai: storedAi,
    });

    const response = await ky
      .post("/api/quick-edit", {
        json: validatedPayload,
        signal,
        timeout: 30_000,
        retry: 0,
      })
      .json<EditResponse>();

    const validatedResponse = editResponseSchema.parse(response);

    return validatedResponse.editedCode || null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    toast.error("Failed to fetch AI quick edit");
    return null;
  }
};
