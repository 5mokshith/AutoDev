# Implementation Plan: Firecrawl Web Search Integration

## Overview

This implementation plan breaks down the Firecrawl web search integration into discrete coding tasks. The approach follows the existing tool pattern in the codebase, creating a new search tool that integrates with the Inngest-based message processing workflow. Each task builds incrementally, with testing integrated throughout to catch issues early.

## Tasks

- [x] 1. Create the search web tool module
  - Create `src/features/conversations/inngest/tools/search-web.ts`
  - Define TypeScript interfaces for SearchWebParams, SearchResult, and SearchWebResponse
  - Set up the basic tool structure using `createTool` from Agent Kit
  - Define Zod schema for parameter validation (query, url, limit)
  - _Requirements: 1.1, 5.1, 5.2, 5.5_

- [ ]* 2. Write property test for parameter validation
  - **Property 1: Parameter Validation**
  - **Property 2: Empty Query Rejection**
  - **Validates: Requirements 1.1, 4.1, 5.1, 5.2, 5.5**

- [ ] 3. Implement search strategy logic
  - [x] 3.1 Implement parameter validation in the tool handler
    - Validate query is non-empty
    - Validate url format if provided
    - Validate limit is between 1 and 5
    - Return descriptive error messages for validation failures
    - _Requirements: 5.5, 8.3_
  
  - [x] 3.2 Implement domain-specific search using Firecrawl map endpoint
    - Import firecrawl client from `src/lib/firecrawl.ts`
    - Call `firecrawl.map()` with target URL and search query
    - Extract URLs from map results
    - Scrape each URL using `firecrawl.scrape()` with markdown format
    - Limit to specified number of results
    - _Requirements: 3.1, 5.4_
  
  - [x] 3.3 Implement general web search fallback
    - Check if Firecrawl SDK has `search()` method
    - If available, use `firecrawl.search()` for general queries
    - If not available, document limitation and use map with common search engines
    - _Requirements: 5.3_

- [ ]* 4. Write property tests for search behavior
  - **Property 7: Domain-Specific Search Behavior**
  - **Validates: Requirements 5.3, 5.4**

- [ ] 5. Implement result processing and formatting
  - [x] 5.1 Extract and structure search results
    - Extract title, URL, and content from Firecrawl responses
    - Handle missing titles by using URL as fallback
    - Create SearchResult objects for each result
    - _Requirements: 6.1_
  
  - [x] 5.2 Implement content truncation logic
    - Truncate content to 1000 characters if longer
    - Add truncation indicator (e.g., "...[truncated]") when content is cut
    - Preserve markdown formatting during truncation
    - _Requirements: 6.2, 10.5_
  
  - [x] 5.3 Format results as JSON response
    - Create SearchWebResponse object with results array, query, and searchedDomain
    - Serialize to JSON string for LLM consumption
    - Format with clear separation between multiple results
    - _Requirements: 6.3, 6.4_

- [ ]* 6. Write property tests for result processing
  - **Property 3: Result Count Limiting**
  - **Property 4: Content Truncation**
  - **Property 5: Result Structure Completeness**
  - **Property 6: Markdown Format Consistency**
  - **Validates: Requirements 1.4, 6.1, 6.2, 6.3, 10.1, 10.5**

- [ ] 7. Implement error handling
  - [x] 7.1 Add try-catch wrapper around all Firecrawl API calls
    - Catch and handle API key errors
    - Catch and handle rate limit errors (429 responses)
    - Catch and handle timeout errors
    - Catch and handle network errors
    - Return descriptive error messages for all error types
    - _Requirements: 3.3, 3.4, 8.1, 8.2, 8.3, 8.4_
  
  - [x] 7.2 Handle no results scenario
    - Check if results array is empty after processing
    - Return informative message: "No results found for query: {query}"
    - _Requirements: 6.5_
  
  - [x] 7.3 Ensure errors never crash the message processor
    - Verify all exceptions are caught and converted to string messages
    - Test that tool handler never throws uncaught exceptions
    - _Requirements: 1.5, 8.5_

- [ ]* 8. Write property tests for error handling
  - **Property 8: Error Handling Without Crashes**
  - **Validates: Requirements 1.5, 3.3, 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 9. Integrate Inngest step pattern
  - Wrap Firecrawl API calls in `toolStep.run()` for observability
  - Add step name: "search-web"
  - Ensure proper error propagation through step pattern
  - _Requirements: 7.3_

- [ ]* 10. Write unit test for Inngest step usage
  - **Property 10: Inngest Step Pattern Usage**
  - **Validates: Requirements 7.3**

- [ ] 11. Add tool to message processor
  - [x] 11.1 Import createSearchWebTool in process-message.ts
    - Add import statement: `import { createSearchWebTool } from './tools/search-web';`
    - _Requirements: 2.1, 7.1_
  
  - [x] 11.2 Add search tool to coding agent tools array
    - Add `createSearchWebTool()` to the tools array
    - Position it after `createScrapeUrlsTool()` for logical grouping
    - Ensure it's included for all AI providers (Google, OpenAI, Anthropic, Groq)
    - _Requirements: 2.1, 7.1_

- [ ]* 12. Write unit tests for tool registration
  - Verify search tool is in the tools array
  - Verify tool is available for all AI providers
  - Verify tool description contains expected keywords
  - **Validates: Requirements 2.1, 4.3, 7.1, 9.1, 9.2, 9.3**

- [x] 13. Add Convex logging for observability
  - Log search initiated event with query and target domain
  - Log search completed event with result count
  - Log search failed event with error type
  - Use existing `api.system.createAgentEvent` mutation
  - _Requirements: 7.2_

- [ ]* 14. Write unit tests for logging
  - Verify agent events are created for search operations
  - Verify correct event types and data are logged
  - **Validates: Requirements 7.2**

- [ ] 15. Checkpoint - Ensure all tests pass
  - Run all property-based tests (minimum 100 iterations each)
  - Run all unit tests
  - Verify no TypeScript compilation errors
  - Verify tool integrates correctly with Agent Kit
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 16. Write integration tests
  - Test complete flow: user message → search tool invocation → formatted response
  - Test search tool works with different AI providers
  - Test search tool interacts correctly with other tools in the agent
  - **Validates: Requirements 2.2, 2.3, 7.4**

- [x] 17. Verify existing scrape tool is unchanged
  - Run existing tests for scrape tool
  - Verify scrape tool description is unchanged
  - Verify scrape tool functionality is not affected
  - _Requirements: 4.2, 4.6_

- [x] 18. Final checkpoint - Complete verification
  - Run full test suite
  - Verify no regressions in existing functionality
  - Verify search tool is available to LLM
  - Test with sample queries to ensure end-to-end functionality
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and unit tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- The search tool follows the same pattern as existing tools (scrapeUrls, readFiles, etc.)
- Firecrawl API methods may need adjustment based on actual SDK capabilities discovered during implementation
