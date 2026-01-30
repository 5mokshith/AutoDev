import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";

import type { AiSelection, AiProvider } from "@/lib/ai-selection";

export type { AiSelection, AiProvider };

export const getCodingModelSelection = (
  selection?: AiSelection,
): { provider: AiProvider; model: string } => {
  const provider = selection?.provider ?? "google";

  if (provider === "groq") {
    return {
      provider,
      model: selection?.model ?? "openai/gpt-oss-20b",
    };
  }

  if (provider === "openai") {
    return {
      provider,
      model: selection?.model ?? process.env.AUTODEV_OPENAI_CODING_MODEL ?? "gpt-4o-mini",
    };
  }

  return {
    provider,
    model: selection?.model ?? process.env.AUTODEV_GEMINI_CODING_MODEL ?? "gemini-2.5-flash",
  };
};

export const getQuickEditModelSelection = (
  selection?: AiSelection,
): { provider: AiProvider; model: string } => {
  const provider = selection?.provider ?? "google";

  if (provider === "groq") {
    return {
      provider,
      model: selection?.model ?? "openai/gpt-oss-20b",
    };
  }

  if (provider === "openai") {
    return {
      provider,
      model: selection?.model ?? process.env.AUTODEV_OPENAI_QUICK_EDIT_MODEL ?? "gpt-4o-mini",
    };
  }

  return {
    provider,
    model: selection?.model ?? "gemini-2.5-pro",
  };
};

export const getLanguageModel = (selection: {
  provider: AiProvider;
  model: string;
}) => {
  if (selection.provider === "groq") {
    return groq(selection.model);
  }

  if (selection.provider === "openai") {
    return openai(selection.model);
  }

  const googleGenAI = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  return googleGenAI(selection.model);
};
