import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { firecrawl } from "@/lib/firecrawl";

// TypeScript interfaces
interface SearchWebParams {
  query: string;
  url?: string;
  limit?: number;
}

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

interface SearchWebResponse {
  results: SearchResult[];
  query: string;
  searchedDomain?: string;
}

// Zod schema for parameter validation
const paramsSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  url: z.string().url("Invalid URL format"),
  limit: z.number().min(1).max(5).optional(),
});

// Helper function to truncate content while preserving markdown
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  
  const truncated = content.substring(0, maxLength);
  return truncated + "...[truncated]";
}

export const createSearchWebTool = () => {
  return createTool({
    name: "searchWeb",
    description:
      "Search within a specific website/domain for information by mapping the site and scraping relevant pages. Use this when you need current information from a particular website (e.g., documentation sites, GitHub repos, news sites). You MUST provide a target URL/domain to search within. Returns markdown content from relevant pages found on that domain. Note: If this tool returns no results, use the scrapeUrls tool with a specific URL instead (e.g., for Next.js latest version, try scraping 'https://nextjs.org/blog' or 'https://github.com/vercel/next.js/releases').",
    parameters: z.object({
      query: z.string().describe("Search query terms to find within the target website"),
      url: z.string().describe("Required: The website/domain URL to search within (e.g., 'https://docs.nextjs.org', 'https://github.com/vercel/next.js')"),
      limit: z.number().min(1).max(5).default(5).optional().describe("Maximum number of results to return (default: 5, max: 5)"),
    }),
    handler: async (params, { step: toolStep }) => {
      // Validate parameters
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { query, url: targetUrl, limit = 5 } = parsed.data;

      try {
        return await toolStep?.run("search-web", async () => {
          const results: SearchResult[] = [];

          // Domain-specific search using map endpoint
          try {
            // First try: map with search parameter
            console.log(`[searchWeb] Mapping ${targetUrl} with search: "${query}"`);
            let mapResult = await firecrawl.map(targetUrl, {
              search: query,
              limit: limit * 2, // Get more results to increase chances of finding relevant content
            });

            console.log(`[searchWeb] Map with search returned ${mapResult?.links?.length || 0} links`);

            // If no results with search, try without search parameter as fallback
            if (!mapResult || !mapResult.links || mapResult.links.length === 0) {
              console.log(`[searchWeb] Trying map without search parameter`);
              mapResult = await firecrawl.map(targetUrl, {
                limit: limit * 2,
              });
              console.log(`[searchWeb] Map without search returned ${mapResult?.links?.length || 0} links`);
            }

            if (mapResult && mapResult.links && mapResult.links.length > 0) {
              console.log(`[searchWeb] Scraping ${Math.min(mapResult.links.length, limit * 2)} URLs`);
              // Scrape each URL from map results
              for (const url of mapResult.links.slice(0, limit * 2)) {
                try {
                  const scrapeResult = await firecrawl.scrape(url, {
                    formats: ["markdown"],
                  });

                  if (scrapeResult && scrapeResult.markdown) {
                    results.push({
                      title: scrapeResult.metadata?.title || url,
                      url: url,
                      content: truncateContent(scrapeResult.markdown, 1000),
                    });
                    console.log(`[searchWeb] Successfully scraped: ${url}`);
                  }
                } catch (scrapeError) {
                  console.log(`[searchWeb] Failed to scrape ${url}:`, scrapeError);
                  // Skip failed scrapes, continue with others
                  continue;
                }

                if (results.length >= limit) {
                  break;
                }
              }
            }
          } catch (mapError) {
            console.error(`[searchWeb] Map error:`, mapError);
            return `Error searching domain ${targetUrl}: ${mapError instanceof Error ? mapError.message : "Unknown error"}`;
          }

          console.log(`[searchWeb] Final results count: ${results.length}`);

          if (results.length === 0) {
            return `No results found for query "${query}" on ${targetUrl}. The website may not have accessible content, or try using the scrapeUrls tool with a specific URL instead.`;
          }

          return JSON.stringify({
            results,
            query,
            searchedDomain: targetUrl,
          } as SearchWebResponse);
        });
      } catch (error) {
        console.error(`[searchWeb] Outer error:`, error);
        return `Error searching web: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
