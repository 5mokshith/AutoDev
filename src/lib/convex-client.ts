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
  query: (...args: Parameters<ConvexHttpClient["query"]>) =>
    getClient().query(...args),
  mutation: (...args: Parameters<ConvexHttpClient["mutation"]>) =>
    getClient().mutation(...args),
  action: (...args: Parameters<ConvexHttpClient["action"]>) =>
    getClient().action(...args),
} as unknown as ConvexHttpClient;
