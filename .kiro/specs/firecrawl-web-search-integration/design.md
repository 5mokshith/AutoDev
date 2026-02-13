# Design Document: Firecrawl Web Search Integration

## Overview

This feature adds intelligent web search capabilities to the AI coding assistant by creating a new Agent Kit tool that leverages Firecrawl's search API. The LLM will be able to autonomously search websites for information when needed, reducing hallucination by providing access to current web content.

The design follows the existing tool pattern established in the codebase, integrating seamlessly with the Inngest-based message processing workflow. The new search tool will complement the existing scrape tool: the scrape tool handles specific URLs provided by users, while the search tool allows the LLM to discover and retrieve relevant content based on search queries.

### Key Design Decisions

1. **Separate Search Tool**: Create a distinct `searchWeb` tool rather than extending the existing `scrapeUrls` tool to maintain clear separation of concerns
2. **Firecrawl Search API**: Use Firecrawl's search endpoint (if available) or map endpoint for site-specific searches
3. **LLM Autonomy**: Allow the LLM to decide when to search without requiring explicit user commands
4. **Result Limiting**: Cap results at 5 items with content truncation to manage token usage
5. **Optional Domain Targeting**: Support both general web search and domain-specific search

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Message Processor                         │
│                  (process-message.ts)                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │           Coding Agent (Agent Kit)                  │    │
│  │                                                      │    │
│  │  Tools:                                             │    │
│  │  - listFiles                                        │    │
│  │  - readFiles                                        │    │
│  │  - updateFile                                       │    │
│  │  - createFiles                                      │    │
│  │  - scrapeUrls (existing)                           │    │
│  │  - searchWeb (NEW)  ◄─────────────────────────┐   │    │
│  │  - ...                                          │   │    │
│  └────────────────────────────────────────────────┘   │    │
│                                                         │    │
└─────────────────────────────────────────────────────────────┘
                                                          │
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │   Search Web Tool        │
                                            │  (search-web.ts)         │
                                            │                          │
                                            │  - Validate params       │
                                            │  - Call Firecrawl API    │
                                            │  - Format results        │
                                            │  - Handle errors         │
                                            └──────────────────────────┘
                                                          │
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │   Firecrawl Client       │
                                            │   (firecrawl.ts)         │
                                            │                          │
                                            │  - API authentication    │
                                            │  - Search/Map endpoint   │
                                            └──────────────────────────┘
```

### Integration Points

1. **Tool Registration**: The search tool is added to the coding agent's tools array in `process-message.ts`
2. **Firecrawl Client**: Reuses the existing Firecrawl client instance from `src/lib/firecrawl.ts`
3. **Agent Events**: Logs search operations to Convex for observability
4. **Inngest Steps**: Uses Inngest step pattern for proper error handling and retries

## Components and Interfaces

### Search Web Tool

**Location**: `src/features/conversations/inngest/tools/search-web.ts`

**Purpose**: Enables the LLM to search websites for information using Firecrawl's search capabilities.

**Interface**:

```typescript
interface SearchWebParams {
  query: string;        // Required: search terms
  url?: string;         // Optional: target domain to search within
  limit?: number;       // Optional: max results (default 5, max 5)
}

interface SearchResult {
  title: string;
  url: string;
  content: string;      // Markdown content, truncated if needed
}

interface SearchWebResponse {
  results: SearchResult[];
  query: string;
  searchedDomain?: string;
}
```

**Tool Definition**:

```typescript
export const createSearchWebTool = () => {
  return createTool({
    name: "searchWeb",
    description: "Search websites for information using web search. Use this when you need current information, documentation, or answers that may not be in your training data. You can search the general web or limit search to a specific domain. Returns markdown content from relevant pages.",
    parameters: z.object({
      query: z.string().min(1).describe("Search query terms"),
      url: z.string().url().optional().describe("Optional: specific domain to search within (e.g., 'https://docs.example.com')"),
      limit: z.number().min(1).max(5).default(5).optional().describe("Maximum number of results to return (default: 5, max: 5)"),
    }),
    handler: async (params, { step: toolStep }) => {
      // Implementation details below
    }
  });
};
```

### Tool Handler Implementation

The handler will follow this flow:

1. **Validate Parameters**: Use Zod schema to validate input
2. **Determine Search Strategy**: 
   - If `url` is provided: Use Firecrawl's map endpoint to search within that domain
   - If no `url`: Use Firecrawl's search endpoint for general web search
3. **Execute Search**: Call appropriate Firecrawl API endpoint
4. **Process Results**: 
   - Extract title, URL, and content from each result
   - Truncate content to ~1000 characters per result
   - Format as markdown
5. **Return Formatted Response**: Return JSON string with results array
6. **Error Handling**: Catch and return descriptive error messages

**Pseudocode**:

```
function handleSearchWeb(params, toolStep):
  // Validate
  parsed = validate(params)
  if not parsed.success:
    return error message
  
  query = parsed.data.query
  targetUrl = parsed.data.url
  limit = parsed.data.limit or 5
  
  try:
    results = []
    
    if targetUrl exists:
      // Domain-specific search using map endpoint
      mapResults = await firecrawl.map(targetUrl, {
        search: query,
        limit: limit
      })
      
      for each url in mapResults.links:
        scrapeResult = await firecrawl.scrape(url, {
          formats: ["markdown"]
        })
        results.push({
          title: scrapeResult.metadata.title or url,
          url: url,
          content: truncate(scrapeResult.markdown, 1000)
        })
        if results.length >= limit:
          break
    else:
      // General web search
      searchResults = await firecrawl.search(query, {
        limit: limit
      })
      
      for each result in searchResults:
        results.push({
          title: result.title,
          url: result.url,
          content: truncate(result.markdown or result.content, 1000)
        })
    
    if results is empty:
      return "No results found for query: {query}"
    
    return JSON.stringify({
      results: results,
      query: query,
      searchedDomain: targetUrl or "general web"
    })
    
  catch error:
    return "Error searching web: {error.message}"
```

### Firecrawl API Methods

Based on the Firecrawl JS SDK (v4.11.4), we'll use:

1. **Search Method** (for general web search):
   ```typescript
   firecrawl.search(query: string, options?: {
     limit?: number;
     lang?: string;
   })
   ```

2. **Map Method** (for domain-specific search):
   ```typescript
   firecrawl.map(url: string, options?: {
     search?: string;
     limit?: number;
   })
   ```

3. **Scrape Method** (to get content from mapped URLs):
   ```typescript
   firecrawl.scrape(url: string, options: {
     formats: ["markdown"];
   })
   ```

### Integration with Message Processor

**Location**: `src/features/conversations/inngest/process-message.ts`

**Changes Required**:

1. Import the new tool creator:
   ```typescript
   import { createSearchWebTool } from './tools/search-web';
   ```

2. Add to tools array in the coding agent configuration:
   ```typescript
   tools: (() => {
     const tools: unknown[] = [
       createListFilesTool({ ... }),
       createReadFilesTool({ ... }),
       createUpdateFileTool({ ... }),
       createCreateFilesTool({ ... }),
       createCreateFolderTool({ ... }),
       createRenameFileTool({ ... }),
       createDeleteFilesTool({ ... }),
       createScrapeUrlsTool(),
       createSearchWebTool(),  // NEW
     ];
     // ... rest of tool configuration
   })()
   ```

The tool will automatically be available to the LLM through the Agent Kit framework.

## Data Models

### Search Parameters

```typescript
interface SearchWebParams {
  query: string;        // Search terms (required, non-empty)
  url?: string;         // Target domain URL (optional, must be valid URL)
  limit?: number;       // Result limit (optional, 1-5, default 5)
}
```

### Search Result

```typescript
interface SearchResult {
  title: string;        // Page title or URL if title unavailable
  url: string;          // Full URL of the result
  content: string;      // Markdown content, truncated to ~1000 chars
}
```

### Tool Response

```typescript
interface SearchWebResponse {
  results: SearchResult[];     // Array of search results (0-5 items)
  query: string;               // Original search query
  searchedDomain?: string;     // Domain searched or "general web"
}
```

The response is serialized as JSON string for the LLM to parse.

### Error Response

When errors occur, the tool returns a string message:
```typescript
type ErrorResponse = string;  // Format: "Error: <description>"
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Parameter Validation

*For any* call to the Search_Tool, if a query parameter is provided that is non-empty and any optional url parameter is a valid URL, then the tool should accept the parameters without validation errors.

**Validates: Requirements 1.1, 4.1, 5.1, 5.2**

### Property 2: Empty Query Rejection

*For any* call to the Search_Tool with an empty or whitespace-only query string, the tool should return a validation error message.

**Validates: Requirements 5.5**

### Property 3: Result Count Limiting

*For any* search operation that returns results, the Search_Tool should return at most 5 results regardless of how many results Firecrawl provides.

**Validates: Requirements 1.4, 10.1**

### Property 4: Content Truncation

*For any* search result with content longer than 1000 characters, the Search_Tool should truncate the content and include a truncation indicator.

**Validates: Requirements 6.2, 10.5**

### Property 5: Result Structure Completeness

*For any* successful search that returns results, each result in the output should contain a title field, a url field, and a content field.

**Validates: Requirements 6.1**

### Property 6: Markdown Format Consistency

*For any* search result content returned by the Search_Tool, the content should be in markdown format consistent with other tools in the system.

**Validates: Requirements 1.3, 6.3**

### Property 7: Domain-Specific Search Behavior

*For any* search with a url parameter provided, the Search_Tool should use Firecrawl's map endpoint to limit results to that domain rather than performing a general web search.

**Validates: Requirements 5.3, 5.4**

### Property 8: Error Handling Without Crashes

*For any* error condition (API timeout, network failure, rate limit, invalid API key), the Search_Tool should return a descriptive error message string rather than throwing an uncaught exception.

**Validates: Requirements 1.5, 3.3, 8.1, 8.2, 8.3, 8.4, 8.5**

### Property 9: Firecrawl Client Usage

*For any* search operation, the Search_Tool should use the existing Firecrawl client instance from `src/lib/firecrawl.ts` rather than creating a new client.

**Validates: Requirements 3.1**

### Property 10: Inngest Step Pattern Usage

*For any* search operation, the Search_Tool should execute the Firecrawl API call within an Inngest step (using `toolStep.run()`) for proper observability and error handling.

**Validates: Requirements 7.3**

## Error Handling

### Error Categories

1. **Validation Errors**
   - Empty query string
   - Invalid URL format
   - Invalid limit parameter (< 1 or > 5)
   - Return format: `"Error: <validation message>"`

2. **API Errors**
   - Missing API key: `"Error: Firecrawl API key not configured"`
   - Rate limiting: `"Error: Search service temporarily unavailable (rate limit)"`
   - Timeout: `"Error: Search request timed out"`
   - Network failure: `"Error: Network error while searching: <details>"`
   - Return format: `"Error: <error description>"`

3. **No Results**
   - When search returns zero results
   - Return format: `"No results found for query: <query>"`
   - This is not an error condition, just an informational response

### Error Handling Strategy

All errors are caught and converted to string messages that the LLM can understand and potentially work around. The tool never throws exceptions that would crash the message processor.

**Error Handling Flow**:

```
try:
  validate parameters
  if validation fails:
    return validation error message
  
  execute search via Firecrawl
  process and format results
  return formatted results
  
catch ApiKeyError:
  return "Error: Firecrawl API key not configured"
  
catch RateLimitError:
  return "Error: Search service temporarily unavailable (rate limit)"
  
catch TimeoutError:
  return "Error: Search request timed out"
  
catch NetworkError as e:
  return "Error: Network error while searching: {e.message}"
  
catch UnknownError as e:
  return "Error searching web: {e.message}"
```

### Logging and Observability

The tool will log operations using Convex agent events:

- **Search initiated**: Log query and target domain
- **Search completed**: Log result count
- **Search failed**: Log error type and message

This provides visibility into search operations for debugging and monitoring.

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests to ensure comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Together, these approaches provide comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness.

### Property-Based Testing

We will use a property-based testing library appropriate for TypeScript (such as fast-check) to implement the correctness properties defined above. Each property test should:

- Run a minimum of 100 iterations to ensure thorough coverage
- Generate random inputs (queries, URLs, result sets, error conditions)
- Verify the property holds for all generated inputs
- Tag each test with a comment referencing the design property

**Example Property Test Structure**:

```typescript
// Feature: firecrawl-web-search-integration, Property 3: Result Count Limiting
test('search tool returns at most 5 results', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1 }),  // query
      fc.array(fc.record({           // mock results
        title: fc.string(),
        url: fc.webUrl(),
        content: fc.string()
      }), { minLength: 0, maxLength: 20 }),
      async (query, mockResults) => {
        // Mock Firecrawl to return mockResults
        // Call search tool
        // Verify result count <= 5
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing Focus Areas

Unit tests should focus on:

1. **Specific Examples**
   - Tool is registered in the tools array
   - Tool description contains expected keywords
   - Firecrawl client is imported from correct module
   - No results scenario returns appropriate message

2. **Edge Cases**
   - Empty query string
   - Whitespace-only query
   - Exactly 5 results returned
   - More than 5 results available
   - Content exactly at truncation boundary
   - Missing API key scenario

3. **Error Conditions**
   - API timeout simulation
   - Network error simulation
   - Rate limit error simulation
   - Invalid parameter combinations

4. **Integration Points**
   - Tool works with Agent Kit framework
   - Inngest step pattern is used correctly
   - Convex logging functions are called

### Test Configuration

- **Property tests**: Minimum 100 iterations per test
- **Test framework**: Jest or Vitest (matching existing project setup)
- **Mocking**: Mock Firecrawl API calls to avoid external dependencies
- **Coverage target**: 90%+ code coverage for the search tool module

### Testing Tools and Mocking

**Mocking Strategy**:
- Mock the Firecrawl client to simulate various API responses
- Mock Inngest step context for testing step pattern usage
- Mock Convex mutations for testing logging behavior

**Test Data Generation**:
- Use property-based testing library to generate random queries, URLs, and results
- Create fixtures for common scenarios (successful search, no results, errors)
- Generate edge cases programmatically (empty strings, very long content, etc.)

## Implementation Notes

### Firecrawl API Considerations

1. **Search vs Map**: The Firecrawl SDK may or may not have a dedicated `search()` method. If not available, we'll use the `map()` method with a search parameter for domain-specific searches, and potentially fall back to scraping search engine results for general web search.

2. **Rate Limiting**: Firecrawl has rate limits. The tool should handle 429 responses gracefully.

3. **API Response Format**: The exact response format from Firecrawl's search/map endpoints should be verified during implementation and the result processing logic adjusted accordingly.

### Performance Considerations

1. **Parallel Scraping**: When using map endpoint, consider scraping multiple URLs in parallel (with Promise.all) to reduce latency, but respect rate limits.

2. **Content Truncation**: Truncate content early in the processing pipeline to avoid unnecessary memory usage.

3. **Result Limiting**: Apply the 5-result limit as early as possible to avoid processing unnecessary results.

### Security Considerations

1. **API Key Protection**: The API key is stored in environment variables and never exposed to the client.

2. **URL Validation**: Validate URL parameters to prevent injection attacks or malformed requests.

3. **Content Sanitization**: Firecrawl returns markdown, which should be safe, but consider additional sanitization if needed.

### Future Enhancements

Potential future improvements (out of scope for this feature):

1. **Caching**: Cache search results to reduce API calls and improve response time
2. **Search History**: Track search queries for analytics and optimization
3. **Result Ranking**: Implement custom ranking logic beyond Firecrawl's default
4. **Multi-language Support**: Add language parameter for international searches
5. **Advanced Filters**: Add date ranges, content type filters, etc.
