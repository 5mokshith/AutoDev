import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { sanitizeGeminiParams } from "../utils/gemini-sanitizer";

interface UpdateFileToolOptions {
  internalKey: string;
  projectId: Id<"projects">;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  content: z.string(),
});

export const createUpdateFileTool = ({
  internalKey,
  projectId,
  conversationId,
  messageId,
}: UpdateFileToolOptions) => {
  return createTool({
    name: "updateFile",
    description: "Update the content of an existing file",
    parameters: z.object({
      fileId: z.string().describe("The ID of the file to update (from listFiles output)"),
      content: z.string().describe("Complete new file content as a properly escaped JSON string. Use \\n for line breaks. Escape all quotes with backslash (\\\" for double quotes)."),
    }),
    handler: async (params, { step: toolStep }) => {
      // Sanitize Gemini params
      const sanitized = sanitizeGeminiParams(params);
      const parsed = paramsSchema.safeParse(sanitized);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { fileId, content } = parsed.data;

      // Validate file exists before running the step
      const file = await convex.query(api.system.getFileById, {
        internalKey,
        fileId: fileId as Id<"files">,
      });


      if (!file) {
        return `Error: File with ID "${fileId}" not found. Use listFiles to get valid file IDs.`;
      }

      if (file.type === "folder") {
        return `Error: "${fileId}" is a folder, not a file. You can only update file contents.`;
      }

      try {
        return await toolStep?.run("update-file", async () => {
          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "updateFile",
            status: "running",
            fileId: fileId as Id<"files">,
            name: file.name,
          });

          await convex.mutation(api.system.updateFile, {
            internalKey,
            fileId: fileId as Id<"files">,
            content,
          });

          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "updateFile",
            status: "done",
            fileId: fileId as Id<"files">,
            name: file.name,
          });

          return `File "${file.name}" updated successfully`;
        })
      } catch (error) {
        try {
          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "updateFile",
            status: "error",
            fileId: fileId as Id<"files">,
            name: file.name,
          });
        } catch {}
        return `Error update file: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
