"use client";

import { useSyncExternalStore } from "react";

import {
  AI_SELECTION_STORAGE_KEY,
  DEFAULT_MODEL_BY_PROVIDER,
  normalizeAiSelection,
  readAiSelection,
  writeAiSelection,
  type AiProvider,
} from "@/lib/ai-selection";

type NormalizedAiSelection = { provider: AiProvider; model: string };

let initialized = false;
const listeners = new Set<() => void>();

const serverSnapshot: NormalizedAiSelection = {
  provider: "google",
  model: DEFAULT_MODEL_BY_PROVIDER.google,
};

let cachedSnapshot: NormalizedAiSelection | null = null;

const emit = () => {
  for (const listener of listeners) listener();
};

const init = () => {
  if (initialized) return;
  initialized = true;

  if (typeof window === "undefined") return;

  window.addEventListener("storage", (e) => {
    if (e.key === AI_SELECTION_STORAGE_KEY) {
      emit();
    }
  });
};

export const getAiSelection = (): NormalizedAiSelection => {
  const next = normalizeAiSelection(readAiSelection());

  if (
    cachedSnapshot &&
    cachedSnapshot.provider === next.provider &&
    cachedSnapshot.model === next.model
  ) {
    return cachedSnapshot;
  }

  cachedSnapshot = next;
  return cachedSnapshot;
};

export const setAiSelection = (selection: NormalizedAiSelection) => {
  const current = getAiSelection();
  if (current.provider === selection.provider && current.model === selection.model) {
    return;
  }

  cachedSnapshot = selection;
  writeAiSelection(selection);
  emit();
};

export const subscribeAiSelection = (listener: () => void) => {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useAiSelection = (): NormalizedAiSelection => {
  return useSyncExternalStore(
    subscribeAiSelection,
    getAiSelection,
    () => serverSnapshot
  );
};
