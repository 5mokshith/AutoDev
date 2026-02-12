# Implementation Plan: Anthropic Model Support

## Overview

This implementation adds Anthropic (Claude) as a fourth AI provider by extending type definitions, updating model initialization logic, configuring the Inngest agent, updating API validation schemas, and fixing the environment variable typo. The implementation follows the established patterns for existing providers (Google, OpenAI, Groq).

## Tasks

- [x] 1. Update AI provider type definitions and constants
  - Extend AiProvider type to include "anthropic"
  - Add Anthropic models to MODELS_BY_PROVIDER constant
  - Set default Anthropic model in DEFAULT_MODEL_BY_PROVIDER
  - Update readAiSelection validation to accept "anthropic"
  - _Requirements: 1.1, 1.2, 1.3, 7.4_

- [ ]* 1.1 Write unit tests for type definitions
  - Test that "anthropic" is accepted as valid provider
  - Test that Anthropic models array contains correct models
  - Test that default Anthropic model is correct
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Update language model initialization
  - [x] 2.1 Import anthropic from @ai-sdk/anthropic in ai-providers.ts
    - Add import statement for anthropic SDK
    - _Requirements: 2.1_

  - [x] 2.2 Add Anthropic case to getCodingModelSelection
    - Add conditional branch for "anthropic" provider
    - Return default model claude-3-5-sonnet-20241022
    - _Requirements: 8.1, 8.3_

  - [x] 2.3 Add Anthropic case to getQuickEditModelSelection
    - Add conditional branch for "anthropic" provider
    - Return default model claude-3-5-sonnet-20241022
    - _Requirements: 8.2, 8.3_

  - [x] 2.4 Add Anthropic case to getLanguageModel
    - Add conditional branch for "anthropic" provider
    - Initialize and return anthropic model instance
    - _Requirements: 2.1_

- [ ]* 2.5 Write unit tests for model initialization
  - Test getCodingModelSelection with Anthropic provider
  - Test getQuickEditModelSelection with Anthropic provider
  - Test getLanguageModel returns model instance for Anthropic
  - _Requirements: 2.1, 8.1, 8.2_

- [x] 3. Update Inngest agent configuration
  - [x] 3.1 Import anthropic from @inngest/agent-kit
    - Add anthropic to imports from agent-kit
    - _Requirements: 3.1_

  - [x] 3.2 Update getAgentKitModel function signature
    - Add "anthropic" to provider union type in function parameter
    - _Requirements: 3.1_

  - [x] 3.3 Add Anthropic case to getAgentKitModel
    - Check for ANTHROPIC_API_KEY environment variable
    - Throw NonRetriableError if missing
    - Initialize anthropic agent kit model with parameters
    - Configure temperature, max_tokens, and tool_choice
    - _Requirements: 3.1, 3.2, 3.5_

  - [x] 3.4 Update tool creation logic for Anthropic
    - Ensure createCreatefilesFilesTool is only added for Google provider
    - Verify other tools work with Anthropic provider
    - _Requirements: 5.1, 5.2_

- [ ]* 3.5 Write unit tests for agent configuration
  - Test getAgentKitModel with Anthropic provider and valid API key
  - Test getAgentKitModel throws error when ANTHROPIC_API_KEY missing
  - Test that parameters are correctly passed to Anthropic model
  - _Requirements: 3.1, 3.2, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update API validation schemas
  - [x] 5.1 Update messages route validation schema
    - Add "anthropic" to provider enum in aiSelectionSchema
    - File: src/app/api/messages/route.ts
    - _Requirements: 4.1_

  - [x] 5.2 Update create-with-prompt route validation schema
    - Add "anthropic" to provider enum in aiSelectionSchema
    - File: src/app/api/projects/create-with-prompt/route.ts
    - _Requirements: 4.2_

  - [x] 5.3 Update suggestion fetcher validation schema
    - Add "anthropic" to provider enum in ai object schema
    - File: src/features/editor/extensions/suggestion/fetcher.ts
    - _Requirements: 4.3_

  - [x] 5.4 Update quick-edit fetcher validation schema
    - Add "anthropic" to provider enum in ai object schema
    - File: src/features/editor/extensions/quick-edit/fetcher.ts
    - _Requirements: 4.4_

- [ ]* 5.5 Write property test for API validation schemas
  - **Property 7: API Validation Schema Acceptance**
  - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 6. Update tool provider type definitions
  - [x] 6.1 Update createCreateFilesTool parameter type
    - Add "anthropic" to provider union type
    - File: src/features/conversations/inngest/tools/create-files.ts
    - _Requirements: 5.1_

  - [x] 6.2 Update createCreateFolderTool parameter type
    - Add "anthropic" to provider union type
    - File: src/features/conversations/inngest/tools/create-folder.ts
    - _Requirements: 5.2_

- [x] 7. Fix environment variable typo
  - [x] 7.1 Rename ANTHORPIC_API_KEY to ANTHROPIC_API_KEY in .env.local
    - Update variable name while preserving the API key value
    - _Requirements: 6.1, 6.3_

- [ ]* 7.2 Write unit test for environment variable naming
  - Test that code references ANTHROPIC_API_KEY (not ANTHORPIC_API_KEY)
  - _Requirements: 6.1, 6.2_

- [ ]* 8. Write property tests for provider selection persistence
  - [ ]* 8.1 Write property test for localStorage round trip
    - **Property 9: Provider Selection Persistence (Round Trip)**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [ ]* 8.2 Write property test for selection normalization
    - **Property 10: Selection Normalization**
    - **Validates: Requirements 7.4**

  - [ ]* 8.3 Write property test for model selection functions
    - **Property 11: Model Selection Functions**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The @ai-sdk/anthropic package is already installed in package.json
- The ANTHROPIC_API_KEY is already in .env.local (with typo that needs fixing)
- Anthropic models support tool calling, so standard tools should work
- The createCreatefilesFilesTool is Google-specific and should not be used with Anthropic
- Property tests should run minimum 100 iterations for comprehensive coverage
