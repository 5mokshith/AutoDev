import { convex } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface ParsedFile {
  path: string;
  content: string;
}

/**
 * Parse <autodev_file path="...">content</autodev_file> markers from agent text output.
 * Returns the extracted files and the cleaned text (markers replaced with creation notes).
 */
export function parseFileMarkers(text: string): {
  files: ParsedFile[];
  cleanedText: string;
} {
  const pattern =
    /<autodev_file\s+path="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/autodev_file>/g;
  const files: ParsedFile[] = [];

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const path = match[1].trim();
    const content = match[2];
    if (path && content != null) {
      files.push({ path, content });
    }
  }

  const cleanedText = text
    .replace(pattern, (_, filePath: string) => `[Created: ${filePath}]`)
    .trim();

  return { files, cleanedText };
}

interface CreateFromMarkersOptions {
  internalKey: string;
  projectId: Id<"projects">;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
}

/**
 * Create files in Convex from parsed file markers.
 * Auto-creates any missing parent folders.
 */
export async function createFilesFromMarkers(
  files: ParsedFile[],
  opts: CreateFromMarkersOptions
): Promise<{ created: string[]; failed: { path: string; error: string }[] }> {
  const { internalKey, projectId, conversationId, messageId } = opts;

  // Build a lookup of existing folders: "parentId:lowername" → fileId
  const allFiles = await convex.query(api.system.getProjectFiles, {
    internalKey,
    projectId,
  });

  const foldersByKey = new Map<
    string,
    { id: Id<"files">; type: "folder" | "file" }
  >();
  for (const f of allFiles) {
    foldersByKey.set(`${f.parentId ?? ""}:${f.name.toLowerCase()}`, {
      id: f._id as Id<"files">,
      type: f.type,
    });
  }

  const ensureFolder = async (
    parentId: Id<"files"> | undefined,
    name: string
  ): Promise<Id<"files">> => {
    const key = `${parentId ?? ""}:${name.toLowerCase()}`;
    const existing = foldersByKey.get(key);
    if (existing) {
      if (existing.type !== "folder") {
        throw new Error(`"${name}" exists as a file, cannot create folder`);
      }
      return existing.id;
    }
    const newId = (await convex.mutation(api.system.createFolder, {
      internalKey,
      projectId,
      name,
      parentId,
    })) as unknown as Id<"files">;
    foldersByKey.set(key, { id: newId, type: "folder" });
    return newId;
  };

  const created: string[] = [];
  const failed: { path: string; error: string }[] = [];

  for (const file of files) {
    try {
      const segments = file.path.split("/").filter(Boolean);
      if (segments.length === 0) {
        failed.push({ path: file.path, error: "Empty path" });
        continue;
      }

      const fileName = segments.pop()!;

      // Create parent folders
      let parentId: Id<"files"> | undefined;
      for (const segment of segments) {
        parentId = await ensureFolder(parentId, segment);
      }

      // Emit agent event (running)
      await convex.mutation(api.system.createAgentEvent, {
        internalKey,
        projectId,
        conversationId,
        messageId,
        type: "createFiles",
        status: "running",
        parentId,
        names: [fileName],
      });

      // Create the file
      const results = (await convex.mutation(api.system.createFiles, {
        internalKey,
        projectId,
        parentId,
        files: [{ name: fileName, content: file.content }],
      })) as { name: string; fileId: string; error?: string }[];

      const r = results[0];

      // Emit agent event (done/error)
      await convex.mutation(api.system.createAgentEvent, {
        internalKey,
        projectId,
        conversationId,
        messageId,
        type: "createFiles",
        status: r?.error ? "error" : "done",
        parentId,
        names: [fileName],
        fileIds: r?.fileId
          ? ([r.fileId] as unknown as Id<"files">[])
          : undefined,
      });

      if (r?.error) {
        failed.push({ path: file.path, error: r.error });
      } else {
        created.push(file.path);
      }
    } catch (err) {
      failed.push({
        path: file.path,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { created, failed };
}
