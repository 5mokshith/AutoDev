import { ConvexHttpClient } from "convex/browser";

let cachedClient: ConvexHttpClient | null = null;

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
    (getClient() as unknown as { query: (...args: unknown[]) => unknown }).query(
      ...args
    ),
  mutation: (...args: unknown[]) =>
    (
      getClient() as unknown as { mutation: (...args: unknown[]) => unknown }
    ).mutation(...args),
  action: (...args: unknown[]) =>
    (getClient() as unknown as { action: (...args: unknown[]) => unknown }).action(
      ...args
    ),
} as unknown as ConvexHttpClient;
