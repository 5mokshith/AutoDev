import { createAgent, createNetwork, gemini, openai, anthropic } from '@inngest/agent-kit';

import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { 
  CODING_AGENT_SYSTEM_PROMPT, 
  TITLE_GENERATOR_SYSTEM_PROMPT
} from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { createReadFilesTool } from './tools/read-files';
import { createListFilesTool } from './tools/list-files';
import { createUpdateFileTool } from './tools/update-file';
import { createCreateFilesTool, createCreatefilesFilesTool } from './tools/create-files';
import { createCreateFolderTool } from './tools/create-folder';
import { createRenameFileTool } from './tools/rename-file';
import { createDeleteFilesTool } from './tools/delete-files';
import { createScrapeUrlsTool } from './tools/scrape-urls';

import { normalizeAiSelection, type AiSelection } from "@/lib/ai-selection";
import { isMalformedFunctionCallError } from './utils/error-detection';
import { formatFallbackNotice } from './utils/user-feedback';

interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  message: string;
  ai?: AiSelection;
};

const CODING_MODEL = process.env.AUTODEV_GEMINI_CODING_MODEL ?? "gemini-2.5-flash";
const CODING_MAX_OUTPUT_TOKENS = Number.parseInt(
  process.env.AUTODEV_GEMINI_CODING_MAX_OUTPUT_TOKENS ?? "4096",
  10
);

// Anthropic model-specific max output tokens
const getAnthropicMaxTokens = (model: string): number => {
  // Claude 3 Haiku has a 4096 token limit
  if (model.includes("haiku")) {
    return 4096;
  }
  // Claude 3 Opus and Sonnet support 4096 tokens
  // Claude 3.5 Sonnet supports 8192 tokens
  if (model.includes("3-5-sonnet")) {
    return 8192;
  }
  // Default for other Claude models
  return 4096;
};

const getAgentKitModel = (
  selection: { provider: "google" | "groq" | "openai" | "anthropic"; model: string },
  params: {
    temperature: number;
    maxOutputTokens: number;
  }
) => {
  if (selection.provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new NonRetriableError("GROQ_API_KEY is not configured");
    }

    return openai({
      model: selection.model,
      apiKey,
      baseUrl: "https://api.groq.com/openai/v1/",
      defaultParameters: {
        temperature: params.temperature,
        max_completion_tokens: params.maxOutputTokens,
        tool_choice: "auto",
        parallel_tool_calls: false,
      },
    });
  }

  if (selection.provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new NonRetriableError("OPENAI_API_KEY is not configured");
    }

    return openai({
      model: selection.model,
      apiKey,
      defaultParameters: {
        temperature: params.temperature,
        max_completion_tokens: params.maxOutputTokens,
        tool_choice: "auto",
        parallel_tool_calls: false,
      },
    });
  }

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

  return gemini({
    model: selection.model,
    defaultParameters: {
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
      },
    },
  });
};

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.AutoDev_CONVEX_INTERNAL_KEY;

      // Update the message with error content
      if (internalKey) {
        await step.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content:
              "My apologies, I encountered an error while processing your request. Let me know if you need anything else!",
          });
        });
      }
    }
  },
  {
    event: "message/sent",
  },
  async ({ event, step }) => {
    const { 
      messageId, 
      conversationId,
      projectId,
      message,
      ai,
    } = event.data as MessageEvent;

    const modelSelection = normalizeAiSelection(ai, {
      defaultGoogleModel: CODING_MODEL,
    });

    const internalKey = process.env.AutoDev_CONVEX_INTERNAL_KEY; 

    if (!internalKey) {
      throw new NonRetriableError("AutoDev_CONVEX_INTERNAL_KEY is not configured");
    }

    // TODO: Check if this is needed
    await step.sleep("wait-for-db-sync", "1s");

    // Get conversation for title generation check
    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    // Fetch recent messages for conversation context
    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 10,
      });
    });

    // Build system prompt with conversation history (exclude the current processing message)
    const customSystemPrompt = process.env.AUTODEV_CUSTOM_SYSTEM_PROMPT;
    let systemPrompt = customSystemPrompt
      ? `${customSystemPrompt}\n\n${CODING_AGENT_SYSTEM_PROMPT}`
      : CODING_AGENT_SYSTEM_PROMPT;

    // Filter out the current processing message and empty messages
    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== ""
    );

    if (contextMessages.length > 0) {
      const MAX_CONTEXT_CHARS = 3000;
      const MAX_MESSAGE_CHARS = 700;
      const recentUserMessages = contextMessages
        .filter((m) => m.role === "user")
        .slice(-5);

      const recentAssistantMessages = contextMessages
        .filter((m) => m.role === "assistant")
        .slice(-2);

      const formatMsg = (label: string, content: string) => {
        const trimmed = content.trim();
        const clipped =
          trimmed.length > MAX_MESSAGE_CHARS
            ? `${trimmed.slice(0, MAX_MESSAGE_CHARS)}\n…(truncated)`
            : trimmed;
        return `${label}: ${clipped}`;
      };

      const blocks: string[] = [];
      for (const m of recentUserMessages) {
        blocks.push(formatMsg("USER", m.content));
      }
      for (const m of recentAssistantMessages) {
        blocks.push(formatMsg("ASSISTANT", m.content));
      }

      const combined = blocks.join("\n\n");
      const clippedContext =
        combined.length > MAX_CONTEXT_CHARS
          ? `${combined.slice(0, MAX_CONTEXT_CHARS)}\n…(truncated)`
          : combined;

      systemPrompt += `\n\n## Conversation Context (background only)\n${clippedContext}`;
    }

    const sanitizeTitle = (raw: string) => {
      const line = raw.split("\n")[0]?.trim() ?? "";
      if (!line) return "";
      // If the model leaked reasoning, fall back.
      if (/\b(let me|i will|i'll|the user wants|let's think|okay,)\b/i.test(line)) {
        return "";
      }

      // Remove surrounding quotes and trailing punctuation.
      return line
        .replace(/^"+|"+$/g, "")
        .replace(/[.!?]+$/g, "")
        .trim();
    };

    // Generate conversation title if it's still the default
    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
       const titleAgent = createAgent({
        name: "title-generator",
        system: TITLE_GENERATOR_SYSTEM_PROMPT,
        model: getAgentKitModel(modelSelection, {
          temperature: 0,
          maxOutputTokens: 50,
        }),
       });

       const { output } = await titleAgent.run(message, { step });

       const textMessage = output.find(
        (m) => m.type === "text" && m.role === "assistant"
      );

      if (textMessage?.type === "text") {
         const title = 
          typeof textMessage.content === "string"
            ? textMessage.content.trim()
            : textMessage.content
              .map((c) => c.text)
              .join("")
              .trim();

        const sanitizedTitle = sanitizeTitle(title);

        if (sanitizedTitle) {
          await step.run("update-conversation-title", async () => {
            await convex.mutation(api.system.updateConversationTitle, {
              internalKey,
              conversationId,
              title: sanitizedTitle,
            });
          });
        }
      }
    }

    // Create the coding agent with file tools
    const codingAgent = createAgent({
      name: "AutoDev",
      description: "An expert AI coding assistant",
      system: systemPrompt,
       model: getAgentKitModel(
        {
          provider: modelSelection.provider,
          model: modelSelection.model,
        },
        {
          temperature: 0.3,
          maxOutputTokens: modelSelection.provider === "anthropic"
            ? getAnthropicMaxTokens(modelSelection.model)
            : (Number.isFinite(CODING_MAX_OUTPUT_TOKENS) ? CODING_MAX_OUTPUT_TOKENS : 4096),
        }
       ),
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
    });

    // Create network with single agent
    const network = createNetwork({
      name: "AutoDev-network",
      agents: [codingAgent],
      maxIter: 20,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        const hasTextResponse = lastResult?.output.some(
          (m) => m.type === "text" && m.role === "assistant"
        );
        const hasToolCalls = lastResult?.output.some(
          (m) => m.type === "tool_call"
        );

        // Anthropic outputs text AND tool calls together
        // Only stop if there's text WITHOUT tool calls (final response)
        if (hasTextResponse && !hasToolCalls) {
          return undefined;
        }
        return codingAgent;
      }
    });

    const agentInput = message;

    // Run the agent
    let result: Awaited<ReturnType<typeof network.run>>;
    let didFallback = false;
    
    try {
      result = await network.run(agentInput);
    } catch (error) {
      // Debug logging to understand error structure
      console.log("[process-message] Error caught:", {
        errorType: typeof error,
        isError: error instanceof Error,
        errorString: String(error).substring(0, 200),
        messageId,
        model: modelSelection.model,
      });
      
      const malformedCheck = isMalformedFunctionCallError(error);
      
      console.log("[process-message] Malformed check result:", {
        isMalformed: malformedCheck.isMalformed,
        provider: modelSelection.provider,
        model: modelSelection.model,
        messageId,
      });
      
      // Only attempt fallback if:
      // 1. Error is malformed function call
      // 2. Provider is Google
      // 3. Model is one of the supported Gemini coding models
      const isSupportedGeminiModel =
        modelSelection.model === "gemini-2.5-pro" ||
        modelSelection.model === "gemini-2.5-flash";

      const shouldFallback =
        malformedCheck.isMalformed &&
        modelSelection.provider === "google" &&
        isSupportedGeminiModel;
      
      if (shouldFallback) {
        const fallbackModel =
          modelSelection.model === "gemini-2.5-pro"
            ? "gemini-2.5-flash"
            : "gemini-2.5-pro";

        // Log fallback attempt
        await step.run("log-fallback-attempt", async () => {
          console.warn("[process-message] Detected malformed function call, falling back to alternate Gemini model", {
            messageId,
            conversationId,
            originalModel: modelSelection.model,
            fallbackModel,
            errorMessage: malformedCheck.errorMessage,
          });
          
          try {
            await convex.mutation(api.system.createAgentEvent, {
              internalKey,
              projectId,
              conversationId,
              messageId,
              type: "listFiles",
              status: "warning",
              name: `Model fallback: ${modelSelection.model} → ${fallbackModel} (malformed function call)`,
            });
          } catch {}
        });
        
        // Recreate agent network with fallback model
        const fallbackTools = (() => {
          const tools: unknown[] = [
            createListFilesTool({ internalKey, projectId, conversationId, messageId }),
            createReadFilesTool({ internalKey, projectId, conversationId, messageId }),
            createUpdateFileTool({ internalKey, projectId, conversationId, messageId }),
            createCreateFilesTool({ projectId, internalKey, conversationId, messageId, provider: "google" }),
            createCreateFolderTool({ projectId, internalKey, conversationId, messageId, provider: "google" }),
            createRenameFileTool({ internalKey, projectId, conversationId, messageId }),
            createDeleteFilesTool({ internalKey, projectId, conversationId, messageId }),
            createScrapeUrlsTool(),
          ];

          tools.push(
            createCreatefilesFilesTool({
              projectId,
              internalKey,
              conversationId,
              messageId,
              provider: "google",
            })
          );

          return tools as never;
        })();
        
        const fallbackAgent = createAgent({
          name: "AutoDev",
          description: "An expert AI coding assistant",
          system: systemPrompt,
          model: getAgentKitModel(
            {
              provider: "google",
              model: fallbackModel,
            },
            {
              temperature: 0.3,
              maxOutputTokens: Number.isFinite(CODING_MAX_OUTPUT_TOKENS)
                ? CODING_MAX_OUTPUT_TOKENS
                : 4096,
            }
          ),
          tools: fallbackTools,
        });
        
        const fallbackNetwork = createNetwork({
          name: "AutoDev-network-fallback",
          agents: [fallbackAgent],
          maxIter: 20,
          router: ({ network }) => {
            const lastResult = network.state.results.at(-1);
            const hasTextResponse = lastResult?.output.some(
              (m) => m.type === "text" && m.role === "assistant"
            );
            const hasToolCalls = lastResult?.output.some(
              (m) => m.type === "tool_call"
            );
            if (hasTextResponse && !hasToolCalls) {
              return undefined;
            }
            return fallbackAgent;
          }
        });
        
        // Retry with fallback model
        try {
          result = await fallbackNetwork.run(agentInput);
          didFallback = true;
          
          // Log successful fallback
          await step.run("log-fallback-success", async () => {
            console.info("[process-message] Fallback succeeded", {
              messageId,
              conversationId,
              fallbackModel,
            });
          });
        } catch (fallbackError) {
          // Fallback also failed - handle as generic error
          await step.run("log-fallback-failure", async () => {
            const fallbackErrMsg = fallbackError instanceof Error 
              ? fallbackError.message 
              : String(fallbackError);
            
            console.error("[process-message] Fallback also failed", {
              messageId,
              conversationId,
              originalError: malformedCheck.errorMessage,
              fallbackError: fallbackErrMsg,
              fallbackModel,
            });
          });
          
          // Re-throw to be handled by existing error handling
          throw fallbackError;
        }
      } else {
        // Not a malformed function call or not a supported Gemini model - handle as before
        throw error;
      }
    }
    
    // Extract the assistant's text response from the last agent result
    const lastResult = result.state.results.at(-1);
    const textMessage = lastResult?.output.find(
      (m) => m.type === "text" && m.role === "assistant"
    );

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    if (textMessage?.type === "text") {
      assistantResponse =
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join("");
    }

    // Prepend fallback notice if we used fallback model
    if (didFallback) {
      assistantResponse = formatFallbackNotice() + "\n\n" + assistantResponse;
    }

    // Update the assistant message with the response (this also sets status to completed)
    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      })
    });

    return { success: true, messageId, conversationId };
  }
);

