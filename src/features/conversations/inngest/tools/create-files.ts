import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface CreateFilesToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  parentId: z.string().optional().default(""),
  files: z
    .array(
      z.object({
        name: z.string().min(1, "File name cannot be empty"),
        content: z.string(),
      })
    )
    .min(1, "Provide at least one file to create"),
});

export const createCreateFilesTool = ({
  projectId,
  internalKey,
  conversationId,
  messageId,
}: CreateFilesToolOptions) => {
  return createTool({
    name: "createFiles",
    description:
      "Create multiple files at once in the same folder. Use this to batch create files that share the same parent folder. More efficient than creating files one by one.",
    parameters: z.object({
      parentId: z
        .string()
        .optional()
        .describe(
          "The ID of the parent folder. Use empty string for root level. Must be a valid folder ID from listFiles."
        ),
      files: z
        .array(
          z.object({
            name: z.string().describe("The file name including extension"),
            content: z.string().describe("The file content"),
          })
        )
        .describe("Array of files to create"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { parentId, files } = parsed.data;

      try {
        return await toolStep?.run("create-files", async () => {
          let resolvedParentId: Id<"files"> | undefined;

          if (parentId && parentId !== "") {
            try {
              resolvedParentId = parentId as Id<"files">;
              const parentFolder = await convex.query(api.system.getFileById, {
                internalKey,
                fileId: resolvedParentId,
              });
              if (!parentFolder) {
                return `Error: Parent folder with ID "${parentId}" not found. Use listFiles to get valid folder IDs.`;
              }
              if (parentFolder.type !== "folder") {
                return `Error: The ID "${parentId}" is a file, not a folder. Use a folder ID as parentId.`;
              }
            } catch {
              return `Error: Invalid parentId "${parentId}". Use listFiles to get valid folder IDs, or use empty string for root level.`;
            }
          }

          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "createFiles",
            status: "running",
            parentId: resolvedParentId,
            names: files.map((f) => f.name),
          });

          const projectFiles = await convex.query(api.system.getProjectFiles, {
            internalKey,
            projectId,
          });

          const folderKey = (pid: Id<"files"> | undefined, name: string) =>
            `${pid ?? "root"}::${name.toLowerCase()}`;

          const folderIdByKey = new Map<string, Id<"files">>();
          for (const item of projectFiles) {
            if (item.type !== "folder") continue;
            folderIdByKey.set(folderKey(item.parentId, item.name), item._id);
          }

          const groups = new Map<string, { parentId: Id<"files"> | undefined; files: { name: string; content: string }[] }>();

          for (const file of files) {
            const normalized = file.name
              .trim()
              .replace(/\\/g, "/")
              .replace(/^\/+/, "")
              .replace(/^\.\//, "");

            const parts = normalized
              .split("/")
              .map((p) => p.trim())
              .filter(Boolean);

            if (parts.length === 0) {
              continue;
            }

            const fileName = parts[parts.length - 1] ?? "";
            const dirParts = parts.slice(0, -1);

            let targetParentId: Id<"files"> | undefined = resolvedParentId;
            for (const segment of dirParts) {
              const key = folderKey(targetParentId, segment);
              const existingFolderId = folderIdByKey.get(key);
              if (existingFolderId) {
                targetParentId = existingFolderId;
                continue;
              }

              const createdFolderId = await convex.mutation(api.system.createFolder, {
                internalKey,
                projectId,
                name: segment,
                parentId: targetParentId,
              });
              folderIdByKey.set(key, createdFolderId as Id<"files">);
              targetParentId = createdFolderId as Id<"files">;
            }

            const groupKey = targetParentId ?? "root";
            const existingGroup = groups.get(groupKey);
            if (existingGroup) {
              existingGroup.files.push({ name: fileName, content: file.content });
            } else {
              groups.set(groupKey, {
                parentId: targetParentId,
                files: [{ name: fileName, content: file.content }],
              });
            }
          }

          const createdNames: string[] = [];
          const failedNames: string[] = [];

          for (const group of groups.values()) {
            const results = await convex.mutation(api.system.createFiles, {
              internalKey,
              projectId,
              parentId: group.parentId,
              files: group.files,
            });

            for (const r of results) {
              if (r.error) {
                failedNames.push(`${r.name} (${r.error})`);
              } else {
                createdNames.push(r.name);
              }
            }
          }

          let response = `Created ${createdNames.length} file(s)`;
          if (createdNames.length > 0) {
            response += `: ${createdNames.join(", ")}`;
          }
          if (failedNames.length > 0) {
            response += `. Failed: ${failedNames.join(", ")}`;
          }

          return response;
        });
      } catch (error) {
        try {
          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "createFiles",
            status: "error",
            names: files.map((f) => f.name),
          });
        } catch {}
        return `Error creating files: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
