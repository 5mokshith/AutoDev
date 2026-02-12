# Requirements Document

## Introduction

This feature adds Anthropic (Claude) AI model support to the application, enabling users to select and use Claude models alongside the existing Google (Gemini), OpenAI, and Groq providers. The implementation will integrate Anthropic models into the existing AI provider infrastructure, including the Inngest agent system, API routes, and UI selection components.

## Glossary

- **AI_Provider**: The AI service provider (Google, OpenAI, Groq, or Anthropic)
- **Model_Selection**: User's choice of AI provider and specific model
- **Language_Model**: The AI model instance used for text generation
- **Agent_Kit_Model**: The model configuration used by the Inngest agent system
- **Coding_Agent**: The AI agent that processes user messages and performs coding tasks
- **Title_Generator**: The AI agent that generates conversation titles
- **API_Route**: HTTP endpoint that accepts AI provider configuration
- **Validation_Schema**: Zod schema that validates API request parameters

## Requirements

### Requirement 1: Add Anthropic as AI Provider

**User Story:** As a developer, I want to use Anthropic's Claude models, so that I can leverage Claude's capabilities for coding tasks.

#### Acceptance Criteria

1. THE System SHALL include "anthropic" as a valid AI provider option in the AiProvider type definition
2. THE System SHALL support three Claude models: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, and claude-3-7-sonnet-20250219
3. THE System SHALL set claude-3-5-sonnet-20241022 as the default model for the Anthropic provider
4. WHEN a user selects the Anthropic provider, THE System SHALL display the available Claude models in the model selection interface

### Requirement 2: Initialize Anthropic Language Models

**User Story:** As a developer, I want the system to properly initialize Anthropic models, so that they can be used for AI-powered features.

#### Acceptance Criteria

1. WHEN the Anthropic provider is selected, THE getLanguageModel function SHALL initialize an Anthropic language model using the @ai-sdk/anthropic package
2. THE System SHALL use the ANTHROPIC_API_KEY environment variable for authentication
3. WHEN the ANTHROPIC_API_KEY is missing, THE System SHALL throw a descriptive error
4. THE Anthropic model initialization SHALL follow the same pattern as existing providers (Google, OpenAI, Groq)

### Requirement 3: Support Anthropic in Inngest Agent

**User Story:** As a user, I want to use Anthropic models in conversations, so that the coding agent can process my messages using Claude.

#### Acceptance Criteria

1. WHEN the Anthropic provider is selected, THE getAgentKitModel function SHALL create an Anthropic-compatible agent kit model
2. THE Anthropic agent kit model SHALL support temperature and maxOutputTokens parameters
3. THE Anthropic agent kit model SHALL support tool calling with tool_choice set to "auto"
4. THE Anthropic agent kit model SHALL disable parallel tool calls (parallel_tool_calls: false)
5. WHEN the ANTHROPIC_API_KEY is missing, THE System SHALL throw a NonRetriableError with a descriptive message

### Requirement 4: Update API Route Validation

**User Story:** As a developer, I want API routes to accept Anthropic as a valid provider, so that frontend requests with Anthropic selection are not rejected.

#### Acceptance Criteria

1. THE validation schema in src/app/api/messages/route.ts SHALL accept "anthropic" as a valid provider value
2. THE validation schema in src/app/api/projects/create-with-prompt/route.ts SHALL accept "anthropic" as a valid provider value
3. THE validation schema in src/features/editor/extensions/suggestion/fetcher.ts SHALL accept "anthropic" as a valid provider value
4. THE validation schema in src/features/editor/extensions/quick-edit/fetcher.ts SHALL accept "anthropic" as a valid provider value

### Requirement 5: Update Tool Provider Types

**User Story:** As a developer, I want Inngest tools to support Anthropic provider, so that tool creation functions work correctly with Claude models.

#### Acceptance Criteria

1. THE createCreateFilesTool function SHALL accept "anthropic" as a valid provider parameter
2. THE createCreateFolderTool function SHALL accept "anthropic" as a valid provider parameter
3. THE createCreatefilesFilesTool function SHALL handle Anthropic provider appropriately (if applicable)

### Requirement 6: Fix Environment Variable Typo

**User Story:** As a developer, I want the environment variable to be spelled correctly, so that the Anthropic API key is properly recognized.

#### Acceptance Criteria

1. THE .env.local file SHALL use ANTHROPIC_API_KEY instead of ANTHORPIC_API_KEY
2. THE System SHALL read the API key from the correctly spelled environment variable
3. WHEN the environment variable is renamed, THE existing API key value SHALL be preserved

### Requirement 7: Maintain Provider Selection Consistency

**User Story:** As a user, I want my Anthropic provider selection to persist, so that my preference is remembered across sessions.

#### Acceptance Criteria

1. WHEN a user selects the Anthropic provider, THE System SHALL store the selection in localStorage
2. WHEN a user selects an Anthropic model, THE System SHALL store the model choice in localStorage
3. WHEN the page reloads, THE System SHALL restore the user's Anthropic provider and model selection
4. THE normalizeAiSelection function SHALL handle Anthropic provider the same way as other providers

### Requirement 8: Support Anthropic in Model Selection Functions

**User Story:** As a developer, I want model selection functions to handle Anthropic, so that the correct model is used for different tasks.

#### Acceptance Criteria

1. THE getCodingModelSelection function SHALL return the appropriate Anthropic model when Anthropic provider is selected
2. THE getQuickEditModelSelection function SHALL return the appropriate Anthropic model when Anthropic provider is selected
3. WHEN no specific Anthropic model is provided, THE System SHALL use the default Anthropic model (claude-3-5-sonnet-20241022)
4. THE System SHALL support environment variable overrides for Anthropic models (if applicable)
