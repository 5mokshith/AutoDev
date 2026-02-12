import ky from "ky";
import { z } from "zod";
import { toast } from "sonner";

const AI_SELECTION_STORAGE_KEY = "autodev_ai_selection";

const suggestionRequestSchema = z.object({
  fileName: z.string(),
  code: z.string(),
  currentLine: z.string(),
  previousLines: z.string(),
  textBeforeCursor: z.string(),
  textAfterCursor: z.string(),
  nextLines: z.string(),
  lineNumber: z.number(),
  ai: z
    .object({
      provider: z.enum(["google", "groq", "openai", "anthropic"]).optional(),
      model: z.string().optional(),
    })
    .optional(),
});

const suggestionResponseSchema = z.object({
  suggestion: z.string(),
});

type SuggestionRequest = z.infer<typeof suggestionRequestSchema>;
type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;

export const fetcher = async (
  payload: SuggestionRequest,
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

    const validatedPayload = suggestionRequestSchema.parse({
      ...payload,
      ai: storedAi,
    });

    const response = await ky
      .post("/api/suggestion", {
        json: validatedPayload,
        signal,
        timeout: 10_000,
        retry: 0,
      })
      .json<SuggestionResponse>();

    const validatedResponse = suggestionResponseSchema.parse(response);

    return validatedResponse.suggestion || null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    toast.error("Failed to fetch AI completion");
    return null;
  }
};
