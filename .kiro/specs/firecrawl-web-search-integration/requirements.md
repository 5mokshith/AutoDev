# Requirements Document

## Introduction

This feature enhances the AI coding assistant with intelligent web search capabilities using Firecrawl. The system will allow the LLM to autonomously decide when to search specific websites for information, reducing hallucination by providing accurate, up-to-date web content. The integration must fit seamlessly into the existing Inngest-based message processing workflow without disrupting current functionality.

## Glossary

- **Firecrawl**: A web scraping service that converts web pages into clean markdown content
- **LLM**: Large Language Model - the AI assistant that processes user messages
- **Agent_Kit**: The Inngest agent framework used for tool-based AI interactions
- **Search_Tool**: A new tool that enables the LLM to search websites using Firecrawl
- **Scrape_Tool**: The existing tool that scrapes specific URLs provided by users
- **Message_Processor**: The Inngest function that handles AI message processing
- **Tool_Handler**: The function that executes tool calls made by the LLM

## Requirements

### Requirement 1: Web Search Tool Creation

**User Story:** As an AI assistant, I want to search websites for information, so that I can provide accurate answers based on current web content rather than potentially outdated training data.

#### Acceptance Criteria

1. WHEN the LLM needs information from a website, THE Search_Tool SHALL accept a search query and target URL as parameters
2. WHEN the Search_Tool is invoked, THE System SHALL use Firecrawl's search API to find relevant content
3. WHEN search results are returned, THE Search_Tool SHALL format them as markdown content for the LLM
4. WHEN Firecrawl returns multiple results, THE Search_Tool SHALL return up to 5 most relevant results
5. WHEN a search fails, THE Search_Tool SHALL return a descriptive error message without crashing

### Requirement 2: LLM Decision-Making Integration

**User Story:** As a system architect, I want the LLM to autonomously decide when to use web search, so that it can gather information only when necessary without requiring explicit user commands.

#### Acceptance Criteria

1. WHEN the Message_Processor initializes the coding agent, THE System SHALL include the Search_Tool in the available tools list
2. WHEN the LLM determines it needs external information, THE System SHALL allow the LLM to invoke the Search_Tool autonomously
3. WHEN the LLM receives search results, THE System SHALL allow the LLM to use that information in its response
4. WHEN the user asks a question that could benefit from web search, THE LLM SHALL have the capability to search without explicit user instruction

### Requirement 3: Firecrawl API Integration

**User Story:** As a developer, I want to use Firecrawl's search capabilities, so that I can find and extract relevant content from websites efficiently.

#### Acceptance Criteria

1. WHEN the Search_Tool needs to search a website, THE System SHALL use the existing Firecrawl client instance
2. WHEN making API calls, THE System SHALL use the FIRECRAWL_API_KEY from environment variables
3. WHEN Firecrawl API calls fail, THE System SHALL handle errors gracefully and return meaningful error messages
4. WHEN the API key is missing, THE System SHALL return an error indicating configuration issues

### Requirement 4: Distinction from Existing Scrape Tool

**User Story:** As a system architect, I want clear separation between searching websites and scraping specific URLs, so that each tool has a distinct purpose and the LLM can choose appropriately.

#### Acceptance Criteria

1. THE Search_Tool SHALL accept search queries and optionally target domains
2. THE Scrape_Tool SHALL continue to accept only specific URLs provided by users
3. WHEN the LLM needs to find information on a topic, THE System SHALL make the Search_Tool available
4. WHEN the user provides specific URLs, THE System SHALL continue using the existing Scrape_Tool
5. THE Search_Tool description SHALL clearly indicate it is for searching and discovering content
6. THE Scrape_Tool description SHALL clearly indicate it is for extracting content from known URLs

### Requirement 5: Tool Parameter Design

**User Story:** As an LLM, I want clear and flexible search parameters, so that I can effectively search for information across different websites.

#### Acceptance Criteria

1. THE Search_Tool SHALL accept a required "query" parameter containing the search terms
2. THE Search_Tool SHALL accept an optional "url" parameter to limit search to a specific domain
3. WHEN no URL is provided, THE Search_Tool SHALL perform a general web search
4. WHEN a URL is provided, THE Search_Tool SHALL limit search results to that domain
5. THE Search_Tool SHALL validate that the query parameter is not empty

### Requirement 6: Response Format and Content Handling

**User Story:** As an LLM, I want search results in a structured format, so that I can easily parse and use the information in my responses.

#### Acceptance Criteria

1. WHEN search results are returned, THE Search_Tool SHALL format each result with title, URL, and content
2. WHEN content is too long, THE Search_Tool SHALL truncate it to a reasonable length (approximately 1000 characters per result)
3. WHEN formatting results, THE Search_Tool SHALL use markdown format for consistency with other tools
4. WHEN multiple results are returned, THE Search_Tool SHALL separate them clearly with headers
5. WHEN no results are found, THE Search_Tool SHALL return a message indicating no content was found

### Requirement 7: Integration with Existing Workflow

**User Story:** As a system architect, I want the search tool to integrate seamlessly with the existing message processing workflow, so that it doesn't disrupt current functionality or require major refactoring.

#### Acceptance Criteria

1. WHEN the Message_Processor creates the coding agent, THE System SHALL add the Search_Tool to the tools array alongside existing tools
2. WHEN the Search_Tool is used, THE System SHALL log agent events to Convex for tracking
3. WHEN tool execution occurs, THE System SHALL use the existing Inngest step pattern for observability
4. WHEN the agent network runs, THE Search_Tool SHALL work within the existing router logic and iteration limits

### Requirement 8: Error Handling and Resilience

**User Story:** As a developer, I want robust error handling for search operations, so that failures don't crash the entire message processing workflow.

#### Acceptance Criteria

1. WHEN Firecrawl API calls timeout, THE Search_Tool SHALL return an error message and allow the LLM to continue
2. WHEN network errors occur, THE Search_Tool SHALL catch exceptions and return descriptive error messages
3. WHEN invalid parameters are provided, THE Search_Tool SHALL validate inputs and return clear validation errors
4. WHEN rate limits are hit, THE Search_Tool SHALL return an error indicating the service is temporarily unavailable
5. WHEN the Search_Tool encounters errors, THE Message_Processor SHALL continue processing without failing the entire message

### Requirement 9: Tool Description and Guidance

**User Story:** As an LLM, I want clear tool descriptions, so that I know when and how to use the search tool effectively.

#### Acceptance Criteria

1. THE Search_Tool description SHALL explain that it searches websites for information
2. THE Search_Tool description SHALL indicate it should be used when current information is needed
3. THE Search_Tool description SHALL mention it can search specific domains or the general web
4. THE Search_Tool description SHALL be concise and clear to help the LLM make good decisions
5. THE parameter descriptions SHALL clearly explain what each parameter does and when to use it

### Requirement 10: Performance and Resource Management

**User Story:** As a system administrator, I want search operations to be efficient, so that they don't significantly slow down message processing or consume excessive resources.

#### Acceptance Criteria

1. WHEN searching, THE Search_Tool SHALL limit results to a maximum of 5 items
2. WHEN processing results, THE Search_Tool SHALL truncate content to prevent excessive token usage
3. WHEN multiple searches are needed, THE System SHALL allow the LLM to make sequential searches within iteration limits
4. THE Search_Tool SHALL complete operations within reasonable timeframes (under 30 seconds per search)
5. WHEN content is truncated, THE Search_Tool SHALL indicate truncation to the LLM
