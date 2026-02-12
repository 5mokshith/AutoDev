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
  provider?: "google" | "groq" | "openai" | "anthropic";
}

const coerceToolParams = (params: unknown) => {
  if (typeof params === "string") {
    try {
      return JSON.parse(params) as unknown;
    } catch {
      // Try to fix common Gemini JSON issues
      try {
        // Fix unquoted string values in object notation
        // Pattern: {key: value} -> {key: "value"}
        let fixed = params
          .replace(/\{(\w+):\s*([^",\{\}\[\]]+)/g, '{"$1": "$2"')
          .replace(/,\s*(\w+):\s*([^",\{\}\[\]]+)/g, ', "$1": "$2"');
        return JSON.parse(fixed) as unknown;
      } catch {
        return params;
      }
    }
  }

  return params;
};

const nullableString = () =>
  z.preprocess((v) => (v == null ? null : v), z.union([z.string(), z.null()]));

const nullableStringArray = () =>
  z.preprocess(
    (v) => (v == null ? null : v),
    z.union([z.array(z.string()), z.null()])
  );

const fileInputSchema = z
  .object({
    name: z.string().optional(),
    path: nullableString(),
    content: nullableString(),
    contentLines: nullableStringArray(),
  })
  .transform((val) => ({
    ...val,
    name: (val.name ?? (typeof val.path === "string" ? val.path : ""))
      .toString()
      .trim(),
  }))
  .superRefine((val, ctx) => {
    if (!val.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "File name cannot be empty",
      });
      return;
    }

    const hasContent = typeof val.content === "string" && val.content.length > 0;
    const hasLines = Array.isArray(val.contentLines) && val.contentLines.length > 0;
    if (!hasContent && !hasLines) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "File content is required",
      });
    }
  });

// Simplified schema for Google/Gemini models - use content string instead of contentLines
const fileInputSchemaSimple = z.object({
  name: z.string().min(1, "File name cannot be empty"),
  content: z.string().min(1, "File content is required"),
});

const paramsSchema = z.object({
  parentId: z.preprocess((v) => (v == null ? "" : v), z.string()),
  files: z
    .array(fileInputSchema)
    .min(1, "Provide at least one file to create"),
});

const paramsSchemaSimple = z.object({
  parentId: z.preprocess((v) => (v == null ? "" : v), z.string()),
  files: z
    .array(fileInputSchemaSimple)
    .min(1, "Provide at least one file to create"),
});

const createFilesAliasParamsSchema = z.object({
  parentId: z.preprocess((v) => (v == null ? "" : v), z.string()).optional(),
  name: z.string().min(1, "File name cannot be empty"),
  content: z.string().optional(),
  contentLines: z.array(z.string()).optional(),
});

export const createCreateFilesTool = ({
  projectId,
  internalKey,
  conversationId,
  messageId,
  provider,
}: CreateFilesToolOptions) => {
  const toolParameters =
    provider === "google" || provider === "anthropic"
      ? z.object({
          parentId: z
            .string()
            .default("")
            .describe(
              "Parent folder ID from listFiles output, or empty string for root level."
            ),
          files: z
            .array(
              z.object({
                name: z
                  .string()
                  .describe("File name with extension (e.g., 'App.tsx', 'package.json')"),
                content: z
                  .string()
                  .describe("Complete file content as a single properly escaped JSON string. Use \\n for line breaks. Escape all quotes with backslash."),
              })
            )
            .min(1)
            .describe("Array of files to create in the same folder"),
        })
      : z.object({
          parentId: z
            .preprocess((v) => (v == null ? "" : v), z.string())
            .describe(
              "The ID of the parent folder. Use empty string for root level. Must be a valid folder ID from listFiles."
            ),
          files: z
            .array(
              z.object({
                name: z.string().nullable().describe("The file name including extension"),
                path: z
                  .string()
                  .nullable()
                  .describe("Alternative to name: the file path or file name"),
                content: z
                  .string()
                  .nullable()
                  .describe("The file content as a single string"),
                contentLines: z
                  .array(z.string())
                  .nullable()
                  .describe("The file content as an array of lines"),
              })
            )
            .describe("Array of files to create"),
        });

  return createTool({
    name: "createFiles",
    description:
      "Create multiple files at once in the same folder. Use this to batch create files that share the same parent folder. More efficient than creating files one by one.",
    parameters: toolParameters,
    handler: async (params, { step: toolStep }) => {
      // Use simplified schema for Google and Anthropic providers
      const schemaToUse = (provider === "google" || provider === "anthropic") ? paramsSchemaSimple : paramsSchema;
      const parsed = schemaToUse.safeParse(coerceToolParams(params));
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { parentId, files } = parsed.data;

      const normalizeContent = (file: (typeof files)[number]) => {
        // For simplified Google schema, content is always a string
        if ('content' in file && typeof file.content === "string" && file.content.length > 0) {
          return file.content;
        }
        // Fallback for non-Google providers with contentLines
        if ('contentLines' in file && Array.isArray(file.contentLines) && file.contentLines.length > 0) {
          return file.contentLines.join("\n");
        }
        return "";
      };

      const isValidSegment = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (trimmed === "." || trimmed === "..") return false;
        if (trimmed.includes("/") || trimmed.includes("\\")) return false;
        if (trimmed.includes("\u0000")) return false;
        return true;
      };

      try {
        return await toolStep?.run("create-files", async () => {
          const allProjectFiles = await convex.query(api.system.getProjectFiles, {
            internalKey,
            projectId,
          });

          const folderKey = (pid: Id<"files"> | undefined, name: string) =>
            `${pid ?? ""}:${name.toLowerCase()}`;

          const foldersByKey = new Map<string, { id: Id<"files">; type: "folder" | "file" }>();
          for (const f of allProjectFiles) {
            foldersByKey.set(folderKey(f.parentId, f.name), {
              id: f._id as Id<"files">,
              type: f.type,
            });
          }

          const ensureFolder = async (
            baseParentId: Id<"files"> | undefined,
            name: string
          ): Promise<Id<"files"> | { error: string }> => {
            if (!isValidSegment(name)) {
              return { error: `Invalid folder segment: ${name}` };
            }
            const key = folderKey(baseParentId, name);
            const existing = foldersByKey.get(key);
            if (existing) {
              if (existing.type !== "folder") {
                return { error: `Path segment "${name}" already exists as a file` };
              }
              return existing.id;
            }

            try {
              const newId = await convex.mutation(api.system.createFolder, {
                internalKey,
                projectId,
                name,
                parentId: baseParentId,
              });
              const createdId = newId as unknown as Id<"files">;
              foldersByKey.set(key, { id: createdId, type: "folder" });
              return createdId;
            } catch (err) {
              return {
                error:
                  err instanceof Error ? err.message : "Failed to create folder",
              };
            }
          };

          const resolveParentId = async (): Promise<Id<"files"> | undefined | { error: string }> => {
            if (!parentId || parentId.trim() === "") return undefined;

            const raw = parentId.trim();

            try {
              const parentFolder = await convex.query(api.system.getFileById, {
                internalKey,
                fileId: raw as Id<"files">,
              });
              if (parentFolder) {
                if (parentFolder.type !== "folder") {
                  return {
                    error: `Error: The parentId "${parentId}" is a file, not a folder.`,
                  };
                }
                return parentFolder._id as Id<"files">;
              }
            } catch {}

            const segments = raw
              .split(/[\\/]+/)
              .map((s) => s.trim())
              .filter(Boolean);

            if (segments.length === 0) {
              return { error: `Error: Invalid parentId "${parentId}".` };
            }

            let current: Id<"files"> | undefined;
            for (const seg of segments) {
              const ensured = await ensureFolder(current, seg);
              if (ensured && typeof ensured === "object") {
                return { error: ensured.error };
              }
              current = ensured as Id<"files">;
            }
            return current;
          };

          const resolved = await resolveParentId();
          if (resolved && typeof resolved === "object") {
            return resolved.error;
          }
          const resolvedParentId = resolved;

          const grouped = new Map<
            string,
            { parentId: Id<"files"> | undefined; files: { name: string; content: string }[] }
          >();

          const failures: { name: string; error: string }[] = [];

          for (const f of files) {
            const rawName = f.name;
            const content = normalizeContent(f);
            const parts = rawName
              .split(/[\\/]+/)
              .map((p) => p.trim())
              .filter(Boolean);

            if (parts.length === 0) {
              failures.push({ name: rawName, error: "Invalid file name" });
              continue;
            }

            const fileName = parts.at(-1) ?? "";
            if (!isValidSegment(fileName)) {
              failures.push({ name: rawName, error: "Invalid file name" });
              continue;
            }

            let targetParentId = resolvedParentId;
            for (const segment of parts.slice(0, -1)) {
              const ensured = await ensureFolder(targetParentId, segment);
              if (typeof ensured === "object" && "error" in ensured) {
                failures.push({ name: rawName, error: ensured.error });
                targetParentId = undefined;
                break;
              }
              targetParentId = ensured as Id<"files">;
            }

            if (content.length === 0) {
              failures.push({ name: rawName, error: "File content is required" });
              continue;
            }

            const key = String(targetParentId ?? "");
            const entry = grouped.get(key) ?? {
              parentId: targetParentId,
              files: [],
            };
            entry.files.push({ name: fileName, content });
            grouped.set(key, entry);
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

          const created: { name: string; fileId: string }[] = [];
          const failed: { name: string; error?: string }[] = [...failures];

          for (const group of grouped.values()) {
            const results = await convex.mutation(api.system.createFiles, {
              internalKey,
              projectId,
              parentId: group.parentId,
              files: group.files,
            });
            for (const r of results as { name: string; fileId: string; error?: string }[]) {
              if (r.error) failed.push({ name: r.name, error: r.error });
              else created.push({ name: r.name, fileId: r.fileId });
            }
          }

          let response = `Created ${created.length} file(s)`;
          if (created.length > 0) {
            response += `: ${created.map((r) => r.name).join(", ")}`;
          }
          if (failed.length > 0) {
            response += `. Failed: ${failed.map((r) => `${r.name} (${r.error})`).join(", ")}`;
          }

          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "createFiles",
            status: failed.length > 0 ? "error" : "done",
            parentId: resolvedParentId,
            names: created.map((r) => r.name),
            fileIds: created
              .map((r) => r.fileId)
              .filter(Boolean) as unknown as Id<"files">[],
          });

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

export const createCreatefilesFilesTool = ({
  projectId,
  internalKey,
  conversationId,
  messageId,
  provider,
}: CreateFilesToolOptions) => {
  const toolParameters =
    provider === "google"
      ? z.object({
          parentId: z
            .string()
            .default("")
            .describe("Parent folder ID from listFiles, or empty string for root"),
          name: z.string().describe("File name with extension"),
          content: z.string().describe("Complete file content as a properly escaped JSON string. Escape all quotes with backslash."),
        })
      : z.object({
          parentId: z
            .string()
            .nullable()
            .describe("Parent folder ID from listFiles, or empty string for root"),
          name: z.string().describe("File name or path"),
          content: z.string().nullable().describe("File content"),
          contentLines: z.array(z.string()).nullable().describe("File content as lines"),
        });

  return createTool({
    name: "CreatefilesFiles",
    description: "Create a single file. (Compatibility alias for Gemini tool calls.)",
    parameters: toolParameters,
    handler: async (params, { step: toolStep }) => {
      const parsed = createFilesAliasParamsSchema.safeParse(coerceToolParams(params));
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { parentId, name, content, contentLines } = parsed.data;

      const mergedContent =
        typeof content === "string" && content.length > 0
          ? content
          : Array.isArray(contentLines) && contentLines.length > 0
            ? contentLines.join("\n")
            : "";

      if (!mergedContent) {
        return "Error: File content is required";
      }

      try {
        return await toolStep?.run("create-single-file", async () => {
          const allProjectFiles = await convex.query(api.system.getProjectFiles, {
            internalKey,
            projectId,
          });

          const folderKey = (pid: Id<"files"> | undefined, folderName: string) =>
            `${pid ?? ""}:${folderName.toLowerCase()}`;

          const foldersByKey = new Map<string, { id: Id<"files">; type: "folder" | "file" }>();
          for (const f of allProjectFiles) {
            foldersByKey.set(folderKey(f.parentId, f.name), {
              id: f._id as Id<"files">,
              type: f.type,
            });
          }

          const isValidSegment = (segment: string) => {
            const trimmed = segment.trim();
            if (!trimmed) return false;
            if (trimmed === "." || trimmed === "..") return false;
            if (trimmed.includes("/") || trimmed.includes("\\")) return false;
            if (trimmed.includes("\u0000")) return false;
            return true;
          };

          const ensureFolder = async (
            baseParentId: Id<"files"> | undefined,
            folderName: string
          ): Promise<Id<"files"> | { error: string }> => {
            if (!isValidSegment(folderName)) {
              return { error: `Invalid folder segment: ${folderName}` };
            }
            const key = folderKey(baseParentId, folderName);
            const existing = foldersByKey.get(key);
            if (existing) {
              if (existing.type !== "folder") {
                return { error: `Path segment "${folderName}" already exists as a file` };
              }
              return existing.id;
            }

            try {
              const newId = await convex.mutation(api.system.createFolder, {
                internalKey,
                projectId,
                name: folderName,
                parentId: baseParentId,
              });
              const createdId = newId as unknown as Id<"files">;
              foldersByKey.set(key, { id: createdId, type: "folder" });
              return createdId;
            } catch (err) {
              return {
                error: err instanceof Error ? err.message : "Failed to create folder",
              };
            }
          };

          const resolveParentId = async (): Promise<Id<"files"> | undefined | { error: string }> => {
            const raw = (parentId ?? "").trim();
            if (!raw) return undefined;

            try {
              const parentFolder = await convex.query(api.system.getFileById, {
                internalKey,
                fileId: raw as Id<"files">,
              });
              if (parentFolder) {
                if (parentFolder.type !== "folder") {
                  return { error: `Error: The parentId "${raw}" is a file, not a folder.` };
                }
                return parentFolder._id as Id<"files">;
              }
            } catch {}

            const segments = raw
              .split(/[\\/]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (segments.length === 0) return { error: `Error: Invalid parentId "${raw}".` };

            let current: Id<"files"> | undefined;
            for (const seg of segments) {
              const ensured = await ensureFolder(current, seg);
              if (ensured && typeof ensured === "object") {
                return { error: ensured.error };
              }
              current = ensured as Id<"files">;
            }
            return current;
          };

          const resolved = await resolveParentId();
          if (resolved && typeof resolved === "object") {
            return resolved.error;
          }
          let targetParentId = resolved;

          const parts = name
            .split(/[\\/]+/)
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length === 0) {
            return `Error: Invalid file name "${name}"`;
          }

          const fileName = parts.at(-1) ?? "";
          if (!isValidSegment(fileName)) {
            return `Error: Invalid file name "${fileName}"`;
          }

          for (const segment of parts.slice(0, -1)) {
            const ensured = await ensureFolder(targetParentId, segment);
            if (ensured && typeof ensured === "object") {
              return ensured.error;
            }
            targetParentId = ensured as Id<"files">;
          }

          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "createFiles",
            status: "running",
            parentId: targetParentId,
            names: [fileName],
          }).catch(() => {});

          const results = await convex.mutation(api.system.createFiles, {
            internalKey,
            projectId,
            parentId: targetParentId,
            files: [{ name: fileName, content: mergedContent }],
          });

          const r = (results as { name: string; fileId: string; error?: string }[])[0];

          await convex.mutation(api.system.createAgentEvent, {
            internalKey,
            projectId,
            conversationId,
            messageId,
            type: "createFiles",
            status: r?.error ? "error" : "done",
            parentId: targetParentId,
            names: [fileName],
            fileIds: r?.fileId ? ([r.fileId] as unknown as Id<"files">[]) : undefined,
          }).catch(() => {});

          if (!r) return `Error creating file "${fileName}": Unknown error`;
          if (r.error) return `Error creating file "${fileName}": ${r.error}`;
          return `Created file "${fileName}"`;
        });
      } catch (error) {
        return `Error creating file: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  });
};
