# Design Document: Anthropic Model Support

## Overview

This design adds Anthropic (Claude) as a fourth AI provider to the application's existing multi-provider architecture. The implementation follows the established patterns used for Google, OpenAI, and Groq providers, ensuring consistency and maintainability.

The key integration points are:
1. Type definitions and constants in `src/lib/ai-selection.ts`
2. Model initialization in `src/lib/ai-providers.ts`
3. Inngest agent configuration in `src/features/conversations/inngest/process-message.ts`
4. API route validation schemas across multiple endpoints
5. Tool provider type definitions

## Architecture

The application uses a provider-agnostic architecture where AI provider selection is abstracted through:

- **AiProvider type**: Union type defining valid providers
- **AiSelection interface**: User's provider and model choice
- **Model selection functions**: Functions that return appropriate models based on selection
- **Language model factory**: Function that instantiates the correct SDK based on provider

This architecture allows adding new providers by:
1. Extending the AiProvider union type
2. Adding provider-specific configuration to constants
3. Adding initialization logic to factory functions
4. Updating validation schemas

## Components and Interfaces

### 1. Type Definitions (`src/lib/ai-selection.ts`)

**AiProvider Type Extension**:
```typescript
export type AiProvider = "google" | "groq" | "openai" | "anthropic";
```

**Default Model Configuration**:
```typescript
export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  google: "gemini-2.5-flash",
  groq: "openai/gpt-oss-20b",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20241022",
};
```

**Available Models Configuration**:
```typescript
export const MODELS_BY_PROVIDER: Record<AiProvider, string[]> = {
  google: ["gemini-2.5-flash", "gemini-2.5-pro"],
  groq: [/* existing models */],
  openai: [/* existing models */],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-7-sonnet-20250219",
  ],
};
```

**readAiSelection Function Update**:
The validation logic needs to include "anthropic" as a valid provider:
```typescript
return {
  provider:
    provider === "google" || provider === "groq" || provider === "openai" || provider === "anthropic"
      ? provider
      : undefined,
  model: typeof model === "string" ? model : undefined,
};
```

### 2. Language Model Initialization (`src/lib/ai-providers.ts`)

**Import Statement**:
```typescript
import { anthropic } from "@ai-sdk/anthropic";
```

**getCodingModelSelection Update**:
Add Anthropic case to the function:
```typescript
export const getCodingModelSelection = (
  selection?: AiSelection,
): { provider: AiProvider; model: string } => {
  const provider = selection?.provider ?? "google";

  if (provider === "groq") {
    return {
      provider,
      model: selection?.model ?? "openai/gpt-oss-20b",
    };
  }

  if (provider === "openai") {
    return {
      provider,
      model: selection?.model ?? process.env.AUTODEV_OPENAI_CODING_MODEL ?? "gpt-4o-mini",
    };
  }

  if (provider === "anthropic") {
    return {
      provider,
      model: selection?.model ?? "claude-3-5-sonnet-20241022",
    };
  }

  return {
    provider,
    model: selection?.model ?? process.env.AUTODEV_GEMINI_CODING_MODEL ?? "gemini-2.5-flash",
  };
};
```

**getQuickEditModelSelection Update**:
Similar pattern as getCodingModelSelection:
```typescript
export const getQuickEditModelSelection = (
  selection?: AiSelection,
): { provider: AiProvider; model: string } => {
  const provider = selection?.provider ?? "google";

  if (provider === "groq") {
    return {
      provider,
      model: selection?.model ?? "openai/gpt-oss-20b",
    };
  }

  if (provider === "openai") {
    return {
      provider,
      model: selection?.model ?? process.env.AUTODEV_OPENAI_QUICK_EDIT_MODEL ?? "gpt-4o-mini",
    };
  }

  if (provider === "anthropic") {
    return {
      provider,
      model: selection?.model ?? "claude-3-5-sonnet-20241022",
    };
  }

  return {
    provider,
    model: selection?.model ?? "gemini-2.5-pro",
  };
};
```

**getLanguageModel Update**:
Add Anthropic initialization:
```typescript
export const getLanguageModel = (selection: {
  provider: AiProvider;
  model: string;
}) => {
  if (selection.provider === "groq") {
    return groq(selection.model);
  }

  if (selection.provider === "openai") {
    return openai(selection.model);
  }

  if (selection.provider === "anthropic") {
    return anthropic(selection.model);
  }

  const googleGenAI = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  return googleGenAI(selection.model);
};
```

### 3. Inngest Agent Configuration (`src/features/conversations/inngest/process-message.ts`)

**Import Statement**:
```typescript
import { createAgent, createNetwork, gemini, openai, anthropic } from '@inngest/agent-kit';
```

**getAgentKitModel Function Update**:
The function signature needs to accept "anthropic":
```typescript
const getAgentKitModel = (
  selection: { provider: "google" | "groq" | "openai" | "anthropic"; model: string },
  params: {
    temperature: number;
    maxOutputTokens: number;
  }
) => {
  // Existing groq and openai cases...

  if (selection.provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new NonRetriableError("ANTHROPIC_API_KEY is not configured");
    }

    return anthropic({
      model: selection.model,
      apiKey,
      defaultParameters: {
        temperature: params.temperature,
        max_tokens: params.maxOutputTokens,
        tool_choice: { type: "auto" },
      },
    });
  }

  // Existing google case...
};
```

**Tool Creation Logic**:
The tools array construction needs to handle Anthropic provider. Since Anthropic supports tool calling, it should work with the standard tools. The `createCreatefilesFilesTool` is Google-specific, so it should not be added for Anthropic:

```typescript
tools: (() => {
  const tools: unknown[] = [
    createListFilesTool({ internalKey, projectId, conversationId, messageId }),
    createReadFilesTool({ internalKey, projectId, conversationId, messageId }),
    createUpdateFileTool({ internalKey, projectId, conversationId, messageId }),
    createCreateFilesTool({ projectId, internalKey, conversationId, messageId, provider: modelSelection.provider }),
    createCreateFolderTool({ projectId, internalKey, conversationId, messageId, provider: modelSelection.provider }),
    createRenameFileTool({ internalKey, projectId, conversationId, messageId }),
    createDeleteFilesTool({ internalKey, projectId, conversationId, messageId }),
    createScrapeUrlsTool(),
  ];

  // Only add Google-specific tool for Google provider
  if (modelSelection.provider === "google") {
    tools.push(
      createCreatefilesFilesTool({
        projectId,
        internalKey,
        conversationId,
        messageId,
        provider: modelSelection.provider,
      })
    );
  }

  return tools as never;
})(),
```

### 4. API Route Validation Schemas

**Messages API Route** (`src/app/api/messages/route.ts`):
```typescript
const aiSelectionSchema = z
  .object({
    provider: z.enum(["google", "groq", "openai", "anthropic"]).optional(),
    model: z.string().optional(),
  })
  .optional();
```

**Create with Prompt API Route** (`src/app/api/projects/create-with-prompt/route.ts`):
```typescript
const aiSelectionSchema = z
  .object({
    provider: z.enum(["google", "groq", "openai", "anthropic"]).optional(),
    model: z.string().optional(),
  })
  .optional();
```

**Editor Suggestion Fetcher** (`src/features/editor/extensions/suggestion/fetcher.ts`):
```typescript
ai: z
  .object({
    provider: z.enum(["google", "groq", "openai", "anthropic"]).optional(),
    model: z.string().optional(),
  })
  .optional(),
```

**Editor Quick Edit Fetcher** (`src/features/editor/extensions/quick-edit/fetcher.ts`):
```typescript
ai: z
  .object({
    provider: z.enum(["google", "groq", "openai", "anthropic"]).optional(),
    model: z.string().optional(),
  })
  .optional(),
```

### 5. Tool Provider Type Updates

**Create Files Tool** (`src/features/conversations/inngest/tools/create-files.ts`):
```typescript
interface CreateFilesToolParams {
  projectId: Id<"projects">;
  internalKey: string;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  provider?: "google" | "groq" | "openai" | "anthropic";
}
```

**Create Folder Tool** (`src/features/conversations/inngest/tools/create-folder.ts`):
```typescript
interface CreateFolderToolParams {
  projectId: Id<"projects">;
  internalKey: string;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  provider?: "google" | "groq" | "openai" | "anthropic";
}
```

### 6. Environment Variable Fix

**Current (incorrect)**:
```
ANTHORPIC_API_KEY=sk-ant-api03-...
```

**Corrected**:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Data Models

No new data models are required. The existing `AiSelection` interface and related types are sufficient:

```typescript
export type AiProvider = "google" | "groq" | "openai" | "anthropic";

export type AiSelection = {
  provider?: AiProvider;
  model?: string;
};
```

The localStorage storage format remains unchanged, as it already supports arbitrary provider strings.

## Error Handling

### Missing API Key

When the ANTHROPIC_API_KEY environment variable is not set:
- In `getAgentKitModel`: Throw `NonRetriableError` with message "ANTHROPIC_API_KEY is not configured"
- This follows the same pattern as OpenAI and Groq error handling

### Invalid Model Selection

The existing validation logic in `readAiSelection` will handle invalid provider values by returning `undefined`, which causes the system to fall back to the default provider (Google).

### API Route Validation

Zod schemas will reject requests with invalid provider values, returning appropriate HTTP error responses.

## Testing Strategy

### Unit Tests

1. **Type validation tests** (`src/lib/ai-selection.ts`):
   - Test that "anthropic" is accepted as a valid provider
   - Test that invalid providers are rejected
   - Test that Anthropic models are correctly mapped

2. **Model selection tests** (`src/lib/ai-providers.ts`):
   - Test getCodingModelSelection returns correct Anthropic model
   - Test getQuickEditModelSelection returns correct Anthropic model
   - Test getLanguageModel initializes Anthropic SDK correctly

3. **API validation tests**:
   - Test that API routes accept "anthropic" provider
   - Test that requests with Anthropic selection are processed correctly

### Integration Tests

1. **End-to-end conversation test**:
   - Create a conversation with Anthropic provider selected
   - Send a message
   - Verify the message is processed using Claude model
   - Verify the response is generated correctly

2. **Model switching test**:
   - Start with Google provider
   - Switch to Anthropic provider
   - Verify the switch persists across page reloads
   - Verify messages use the correct provider

3. **Tool calling test**:
   - Send a message that requires tool usage (e.g., "list files")
   - Verify Anthropic model correctly calls tools
   - Verify tool results are processed correctly

### Error Condition Tests

1. **Missing API key test**:
   - Remove ANTHROPIC_API_KEY from environment
   - Attempt to use Anthropic provider
   - Verify appropriate error is thrown

2. **Invalid model test**:
   - Select Anthropic provider with invalid model name
   - Verify system handles error gracefully


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Anthropic Provider Type Acceptance

*For any* function that accepts an AiProvider type parameter, passing "anthropic" as the provider value should be accepted without type errors or runtime filtering.

**Validates: Requirements 1.1**

### Property 2: Claude Models Configuration

*For any* lookup of available models for the Anthropic provider, the system should return exactly the three supported Claude models: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, and claude-3-7-sonnet-20250219.

**Validates: Requirements 1.2**

### Property 3: Anthropic Default Model

*For any* request for the default model of the Anthropic provider, the system should return "claude-3-5-sonnet-20241022".

**Validates: Requirements 1.3**

### Property 4: Language Model Initialization

*For any* call to getLanguageModel with provider set to "anthropic" and a valid Claude model, the function should return a language model instance without throwing errors.

**Validates: Requirements 2.1**

### Property 5: Missing API Key Error Handling

*For any* attempt to initialize an Anthropic model when ANTHROPIC_API_KEY is not set, the system should throw a descriptive error (NonRetriableError in Inngest context).

**Validates: Requirements 2.3, 3.5**

### Property 6: Agent Kit Model Creation

*For any* call to getAgentKitModel with provider "anthropic", valid model name, and valid parameters (temperature, maxOutputTokens), the function should return an agent kit model instance configured with those parameters.

**Validates: Requirements 3.1, 3.2**

### Property 7: API Validation Schema Acceptance

*For all* API validation schemas (messages route, create-with-prompt route, suggestion fetcher, quick-edit fetcher), parsing an object with provider set to "anthropic" should succeed without validation errors.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 8: Environment Variable Naming

*For any* code that reads the Anthropic API key, it should reference the environment variable "ANTHROPIC_API_KEY" (not "ANTHORPIC_API_KEY").

**Validates: Requirements 6.1, 6.2**

### Property 9: Provider Selection Persistence (Round Trip)

*For any* Anthropic provider and model selection, writing the selection to localStorage using writeAiSelection and then reading it back using readAiSelection should return an equivalent selection with provider "anthropic" and the same model.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 10: Selection Normalization

*For any* AiSelection with provider "anthropic" (with or without a specific model), calling normalizeAiSelection should return a normalized selection with provider "anthropic" and either the specified model or the default Anthropic model.

**Validates: Requirements 7.4**

### Property 11: Model Selection Functions

*For all* model selection functions (getCodingModelSelection, getQuickEditModelSelection), when given an AiSelection with provider "anthropic", the function should return a selection with provider "anthropic" and either the specified model or the default Anthropic model (claude-3-5-sonnet-20241022).

**Validates: Requirements 8.1, 8.2, 8.3**
