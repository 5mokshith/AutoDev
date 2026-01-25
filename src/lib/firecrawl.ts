import firecrawl from "@mendable/firecrawl-js";

export const firecrawlClient = new firecrawl({
    apiKey: process.env.FIRECRAWL_API_KEY,
}); 