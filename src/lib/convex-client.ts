import { ConvexHttpClient } from "convex/browser";

let cachedClient: ConvexHttpClient | null = null;

const shouldRetry = (error: unknown) => {
  if (!error) return false;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error);

  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  const causeCode =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : undefined;

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;

  const combined = `${message} ${code ?? ""} ${causeCode ?? ""}`.toLowerCase();
  return (
    combined.includes("fetch failed") ||
    combined.includes("enotfound") ||
    combined.includes("connect_timeout") ||
    combined.includes("und_err_connect_timeout") ||
    combined.includes("econnreset") ||
    combined.includes("etimedout")
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(fn: () => Promise<T>) => {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      await sleep(300 * attempt);
    }
  }
  throw lastError;
};

const getClient = (): ConvexHttpClient => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;

  if (!url) {
    throw new Error("CONVEX_URL is not configured");
  }

  if (!cachedClient) {
    cachedClient = new ConvexHttpClient(url);
  }

  return cachedClient;
};

export const convex = {
  query: (...args: unknown[]) =>
    withRetry(() =>
      (getClient() as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query(
        ...args
      )
    ),
  mutation: (...args: unknown[]) =>
    withRetry(() =>
      (
        getClient() as unknown as {
          mutation: (...args: unknown[]) => Promise<unknown>;
        }
      ).mutation(...args)
    ),
  action: (...args: unknown[]) =>
    withRetry(() =>
      (getClient() as unknown as { action: (...args: unknown[]) => Promise<unknown> }).action(
        ...args
      )
    ),
} as unknown as ConvexHttpClient;
