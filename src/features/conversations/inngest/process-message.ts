import { createAgent, createNetwork, gemini, openai } from '@inngest/agent-kit';

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
import { createCreateFilesTool } from './tools/create-files';
import { createCreateFolderTool } from './tools/create-folder';
import { createRenameFileTool } from './tools/rename-file';
import { createDeleteFilesTool } from './tools/delete-files';
import { createScrapeUrlsTool } from './tools/scrape-urls';

import { normalizeAiSelection, type AiSelection } from "@/lib/ai-selection";
import { truncateText } from "@/lib/prompt-utils";

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

const CODING_MAX_HISTORY_CHARS = Number.parseInt(
  process.env.AUTODEV_CODING_MAX_HISTORY_CHARS ?? "9000",
  10,
);

const CODING_AGENT_MAX_ITER = Number.parseInt(
  process.env.AUTODEV_CODING_AGENT_MAX_ITER ?? "12",
  10,
);

const getAgentKitModel = (
  selection: { provider: "google" | "groq" | "openai"; model: string },
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
      const historyText = contextMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");

      const maxHistoryChars = Number.isFinite(CODING_MAX_HISTORY_CHARS)
        ? CODING_MAX_HISTORY_CHARS
        : 9000;
      const clippedHistory = truncateText(historyText, maxHistoryChars);

      systemPrompt += `\n\n## Previous Conversation (for context only - do NOT repeat these responses):\n${clippedHistory}\n\n## Current Request:\nRespond ONLY to the user's new message below. Do not repeat or reference your previous responses.`;
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
          maxOutputTokens: Number.isFinite(CODING_MAX_OUTPUT_TOKENS)
            ? CODING_MAX_OUTPUT_TOKENS
            : 4096,
        }
       ),
       tools: [
        createListFilesTool({ internalKey, projectId }),
        createReadFilesTool({ internalKey }),
        createUpdateFileTool({ internalKey }),
        createCreateFilesTool({ projectId, internalKey }),
        createCreateFolderTool({ projectId, internalKey }),
        createRenameFileTool({ internalKey }),
        createDeleteFilesTool({ internalKey }),
        createScrapeUrlsTool(),
       ],
    });

    // Create network with single agent
    const network = createNetwork({
      name: "AutoDev-network",
      agents: [codingAgent],
      maxIter: Number.isFinite(CODING_AGENT_MAX_ITER) ? CODING_AGENT_MAX_ITER : 12,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        const hasTextResponse = lastResult?.output.some(
          (m) => m.type === "text" && m.role === "assistant"
        );
        const hasToolCalls = lastResult?.output.some(
          (m) => m.type === "tool_call"
        );

        const hadAnyToolCallsEver = network.state.results.some((r) =>
          r.output.some((m) => m.type === "tool_call")
        );

        // Anthropic outputs text AND tool calls together
        // Only stop if there's text WITHOUT tool calls AFTER at least one tool call has happened.
        // Otherwise, keep iterating so the agent gets a chance to use tools.
        if (hasTextResponse && !hasToolCalls && hadAnyToolCallsEver) {
          return undefined;
        }
        return codingAgent;
      }
    });

    // Run the agent
    let result: Awaited<ReturnType<typeof network.run>>;
    try {
      result = await network.run(message);
    } catch (err) {
      const providerLabel =
        modelSelection.provider === "groq"
          ? "Groq"
          : modelSelection.provider === "openai"
            ? "OpenAI"
            : "Gemini";
      const modelLabel = modelSelection.model;

      await step.run("update-assistant-message", async () => {
        await convex.mutation(api.system.updateMessageContent, {
          internalKey,
          messageId,
          content:
            `I hit an error while running the agent with ${providerLabel} (${modelLabel}). ` +
            `This usually happens when the model returns an invalid tool-call payload. ` +
            `Try switching the model to one of: gpt-4o-mini, gpt-4o, qwen/qwen3-32b, openai/gpt-oss-20b, groq/compound-mini.`,
        });
      });

      return { success: false, messageId, conversationId };
    }

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    for (let i = result.state.results.length - 1; i >= 0; i--) {
      const r = result.state.results[i];
      const textMessage = r.output.find(
        (m) => m.type === "text" && m.role === "assistant"
      );

      if (textMessage?.type === "text") {
        assistantResponse =
          typeof textMessage.content === "string"
            ? textMessage.content
            : textMessage.content.map((c) => c.text).join("");
        break;
      }
    }

    const hadAnyToolCalls = result.state.results.some((r) =>
      r.output.some((m) => m.type === "tool_call")
    );

    const projectFilesAfter = await step.run("check-project-files", async () => {
      return await convex.query(api.system.getProjectFiles, {
        internalKey,
        projectId,
      });
    });

    const createdAnyFiles = projectFilesAfter.length > 0;

    if (!hadAnyToolCalls || !createdAnyFiles) {
      assistantResponse =
        `No files were created for this project (projectId: ${projectId}). ` +
        `toolCalls=${hadAnyToolCalls ? "yes" : "no"}, fileCount=${projectFilesAfter.length}. ` +
        `This usually means the model did not call the file tools, or a tool call failed validation. ` +
        `Try switching the model to one of: gpt-4o-mini, gpt-4o, qwen/qwen3-32b, openai/gpt-oss-20b, groq/compound-mini, then re-run the prompt.`;
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

