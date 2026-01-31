import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { firecrawl } from "@/lib/firecrawl";
import { AsyncTtlCache } from "@/lib/ai-cache";
import { truncateText, uniq } from "@/lib/prompt-utils";

const scrapeCache = new AsyncTtlCache<string>();

const SCRAPE_URLS_MAX_URLS = Number.parseInt(
  process.env.AUTODEV_SCRAPE_URLS_MAX_URLS ?? "3",
  10,
);
const SCRAPE_URLS_MAX_DOC_CHARS_PER_URL = Number.parseInt(
  process.env.AUTODEV_SCRAPE_URLS_MAX_DOC_CHARS_PER_URL ?? "8000",
  10,
);
const SCRAPE_URLS_MAX_DOC_CHARS_TOTAL = Number.parseInt(
  process.env.AUTODEV_SCRAPE_URLS_MAX_DOC_CHARS_TOTAL ?? "18000",
  10,
);

const paramsSchema = z.object({
  urls: z
    .array(z.url("Invalid URL format"))
    .min(1, "Provide at least one URL to scrape"),
});

export const createScrapeUrlsTool = () => {
  return createTool({
    name: "scrapeUrls",
    description:
      "Scrape content from URLs to get documentation or reference material. Use this when the user provides URLs or references external documentation. Returns markdown content from the scraped pages.",
    parameters: z.object({
      urls: z.array(z.string()).describe("Array of URLs to scrape for content"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { urls: rawUrls } = parsed.data;
      const urls = uniq(rawUrls).slice(
        0,
        Number.isFinite(SCRAPE_URLS_MAX_URLS) ? SCRAPE_URLS_MAX_URLS : 3,
      );

      try {
        return await toolStep?.run("scrape-urls", async () => {
          const results: { url: string; content: string }[] = [];

          const maxCharsPerUrl = Number.isFinite(SCRAPE_URLS_MAX_DOC_CHARS_PER_URL)
            ? SCRAPE_URLS_MAX_DOC_CHARS_PER_URL
            : 8000;
          const maxCharsTotal = Number.isFinite(SCRAPE_URLS_MAX_DOC_CHARS_TOTAL)
            ? SCRAPE_URLS_MAX_DOC_CHARS_TOTAL
            : 18000;
          let remaining = maxCharsTotal;

          for (const url of urls) {
            try {
              if (remaining <= 0) break;

              const cacheKey = `firecrawl:scrape:${url}`;
              const markdown = await scrapeCache.getOrSet(
                cacheKey,
                60 * 60 * 1000,
                async () => {
                  try {
                    const result = await firecrawl.scrape(url, {
                      formats: ["markdown"],
                    });

                    return result.markdown ?? "";
                  } catch {
                    return "";
                  }
                },
              );

              if (!markdown) {
                results.push({ url, content: `Failed to scrape URL: ${url}` });
                continue;
              }

              const clipped = truncateText(markdown, Math.min(maxCharsPerUrl, remaining));
              remaining -= clipped.length;

              results.push({ url, content: clipped });
            } catch {
              results.push({
                url,
                content: `Failed to scrape URL: ${url}`,
              });
            }
          }

          if (results.length === 0) {
            return "No content could be scraped from the provided URLs.";
          }

          return JSON.stringify(results);
        });
      } catch (error) {
        return `Error scraping URLs: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
