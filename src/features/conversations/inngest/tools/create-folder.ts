import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface CreateFolderToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  provider?: "google" | "groq" | "openai" | "anthropic";
}

const coerceToolParams = (params: unknown) => {
  if (typeof params === "string") {
    try {
      return JSON.parse(params) as unknown;
    } catch {
      return params;
    }
  }

  return params;
};

const paramsSchema = z.object({
  name: z.string().min(1, "Folder name is required"),
  parentId: z.preprocess((v) => (v == null ? "" : v), z.string()),
});

const splitSegments = (input: string) =>
  input
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

const isValidSegment = (segment: string) => {
  if (!segment) return false;
  const trimmed = segment.trim();
  if (!trimmed) return false;
  if (trimmed === "." || trimmed === "..") return false;
  if (trimmed.includes("/") || trimmed.includes("\\")) return false;
  if (trimmed.includes("\u0000")) return false;
  return true;
};

export const createCreateFolderTool = ({
  projectId,
  internalKey,
  conversationId,
  messageId,
  provider,
}: CreateFolderToolOptions) => {
  const toolParameters =
    provider === "google" || provider === "anthropic"
      ? z.object({
          name: z.string().describe("The name of the folder to create"),
          parentId: z
            .string()
            .optional()
            .describe(
              "The ID (not name!) of the parent folder from listFiles, or empty string for root level"
            ),
        })
      : z.object({
          name: z.string().describe("The name of the folder to create"),
          parentId: z
            .string()
            .nullable()
            .describe(
              "The ID (not name!) of the parent folder from listFiles, or empty string for root level"
            ),
        });

  return createTool({
    name: "createFolder",
    description: "Create a new folder in the project",
    parameters: toolParameters,
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(coerceToolParams(params));
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { name, parentId } = parsed.data;

      const segments = splitSegments(name);
      if (segments.length === 0) {
        return `Error: Invalid folder name "${name}"`;
      }
      const invalid = segments.find((s) => !isValidSegment(s));
      if (invalid) {
        return `Error: Invalid folder name segment "${invalid}"`;
      }

      try {
        return await toolStep?.run("create-folder", async () => {
          const allProjectFiles = await convex.query(api.system.getProjectFiles, {
            internalKey,
            projectId,
          });

          const folderKey = (pid: Id<"files"> | undefined, folderName: string) =>
            `${pid ?? ""}:${folderName.toLowerCase()}`;

          const foldersByKey = new Map<string, Id<"files">>();
          for (const f of allProjectFiles) {
            if (f.type !== "folder") continue;
            foldersByKey.set(folderKey(f.parentId, f.name), f._id as Id<"files">);
          }

          // Validate parentId if provided
          if (parentId) {
            try {
              const parentFolder = await convex.query(api.system.getFileById, {
                internalKey,
                fileId: parentId as Id<"files">,
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

          await convex
            .mutation(api.system.createAgentEvent, {
              internalKey,
              projectId,
              conversationId,
              messageId,
              type: "createFolder",
              status: "running",
              parentId: parentId ? (parentId as Id<"files">) : undefined,
              name,
            })
            .catch(() => {});

          let currentParentId: Id<"files"> | undefined = parentId
            ? (parentId as Id<"files">)
            : undefined;
          let folderId: Id<"files"> | null = null;

          for (const segment of segments) {
            const key = folderKey(currentParentId, segment);
            const existing = foldersByKey.get(key);
            if (existing) {
              folderId = existing;
              currentParentId = folderId;
              continue;
            }

            try {
              folderId = (await convex.mutation(api.system.createFolder, {
                internalKey,
                projectId,
                name: segment,
                parentId: currentParentId,
              })) as unknown as Id<"files">;
              foldersByKey.set(key, folderId);
            } catch (err) {
              const message = err instanceof Error ? err.message : "";
              if (message.includes("Folder already exists")) {
                const resolved = foldersByKey.get(key);
                if (resolved) {
                  folderId = resolved;
                } else {
                  const refresh = await convex.query(api.system.getProjectFiles, {
                    internalKey,
                    projectId,
                  });
                  const found = refresh.find(
                    (f) =>
                      f.type === "folder" &&
                      String(f.parentId ?? "") === String(currentParentId ?? "") &&
                      f.name.toLowerCase() === segment.toLowerCase()
                  );
                  if (!found) {
                    throw err;
                  }
                  folderId = found._id as Id<"files">;
                  foldersByKey.set(key, folderId);
                }
              } else {
                throw err;
              }
            }
            currentParentId = folderId;
          }

          await convex
            .mutation(api.system.createAgentEvent, {
              internalKey,
              projectId,
              conversationId,
              messageId,
              type: "createFolder",
              status: "done",
              parentId: parentId ? (parentId as Id<"files">) : undefined,
              fileId: folderId ?? undefined,
              name,
            })
            .catch(() => {});

          return folderId ? `Folder created with ID: ${folderId}` : "Error: Failed to create folder";
        });
      } catch (error) {
        try {
          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "createFolder",
            status: "error",
            parentId: parentId ? (parentId as Id<"files">) : undefined,
            name,
          });
        } catch {}
        return `Error creating folder: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
