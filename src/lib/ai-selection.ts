export const AI_SELECTION_STORAGE_KEY = "autodev_ai_selection";

export type AiProvider = "google" | "groq" | "openai";

export type AiSelection = {
  provider?: AiProvider;
  model?: string;
};

export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  google: "gemini-2.5-flash",
  groq: "openai/gpt-oss-20b",
  openai: "gpt-4o-mini",
};

export const MODELS_BY_PROVIDER: Record<AiProvider, string[]> = {
  google: ["gemini-2.5-flash", "gemini-2.5-pro"],
  groq: [
    "qwen/qwen3-32b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "moonshotai/kimi-k2-instruct-0905",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "groq/compound-mini",
    "groq/compound",
  ],
  openai: [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-4.1",
    "o1-mini",
    "o1",
  ],
};

export const readAiSelection = (): AiSelection | undefined => {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(AI_SELECTION_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;

    const provider = (parsed as { provider?: unknown }).provider;
    const model = (parsed as { model?: unknown }).model;

    return {
      provider:
        provider === "google" || provider === "groq" || provider === "openai"
          ? provider
          : undefined,
      model: typeof model === "string" ? model : undefined,
    };
  } catch {
    return undefined;
  }
};

export const writeAiSelection = (selection: AiSelection) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    AI_SELECTION_STORAGE_KEY,
    JSON.stringify(selection)
  );
};

export const normalizeAiSelection = (
  selection?: AiSelection,
  overrides?: { defaultGoogleModel?: string }
): { provider: AiProvider; model: string } => {
  const provider: AiProvider = selection?.provider ?? "google";
  const model =
    selection?.model ??
    (provider === "google" && overrides?.defaultGoogleModel
      ? overrides.defaultGoogleModel
      : DEFAULT_MODEL_BY_PROVIDER[provider]);

  return { provider, model };
};
