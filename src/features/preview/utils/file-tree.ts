import { FileSystemTree } from "@webcontainer/api";

import { Doc, Id } from "../../../../convex/_generated/dataModel";

type FileDoc = Doc<"files">;

/**
 * Convert flat Convex files to nested FileSystemTree for WebContainer
 */
export const buildFileTree = (files: FileDoc[]): FileSystemTree => {
  const tree: FileSystemTree = {};
  const filesMap = new Map(files.map((f) => [f._id, f]));

  const shouldAutofixCvaImport = (pathParts: string[], content: string) => {
    const fileName = pathParts[pathParts.length - 1] ?? "";
    const extMatch = fileName.match(/\.(tsx?|jsx?)$/i);
    if (!extMatch) return false;
    if (!content.includes("cva(")) return false;
    if (content.includes("class-variance-authority")) return false;
    return true;
  };

  const injectCvaImport = (content: string) => {
    const importLine = 'import { cva } from "class-variance-authority";';
    const lines = content.split(/\r?\n/);

    let insertAt = 0;
    if (lines[0]?.trim() === '"use client";' || lines[0]?.trim() === "'use client';") {
      insertAt = 1;
      if (lines[1]?.trim() === "") {
        insertAt = 2;
      }
    }

    lines.splice(insertAt, 0, importLine);
    return lines.join("\n");
  };

  const splitSegments = (name: string): string[] =>
    name
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);

  const getPath = (file: FileDoc): string[] => {
    const parts: string[] = [...splitSegments(file.name)];
    let parentId = file.parentId;

    while (parentId) {
      const parent = filesMap.get(parentId);
      if (!parent) break;
      parts.unshift(...splitSegments(parent.name));
      parentId = parent.parentId;
    };

    return parts;
  };

  for (const file of files) {
    const pathParts = getPath(file);
    let current = tree;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLast = i === pathParts.length - 1;

      if (isLast) {
        if (file.type === "folder") {
          const existing = current[part];
          if (existing && "directory" in existing) {
            // Keep existing directory contents.
            current[part] = { directory: existing.directory };
          } else if (!existing) {
            current[part] = { directory: {} };
          }
        } else if (!file.storageId && file.content !== undefined) {
          const content =
            typeof file.content === "string" &&
            shouldAutofixCvaImport(pathParts, file.content)
              ? injectCvaImport(file.content)
              : file.content;

          current[part] = { file: { contents: content } };
        }
      } else {
        const existing = current[part];
        if (!existing || !("directory" in existing)) {
          current[part] = { directory: {} };
        }
        const node = current[part];
        if (node && "directory" in node) {
          current = node.directory;
        }
      }
    }
  }

  return tree;
};

/**
 * Get full path for a file by traversing parent chain
 */
export const getFilePath = (
  file: FileDoc,
  filesMap: Map<Id<"files">, FileDoc>
): string => {
  const normalize = (name: string) => name.replace(/\\/g, "/");
  const parts: string[] = [normalize(file.name)];
  let parentId = file.parentId;

  while (parentId) {
    const parent = filesMap.get(parentId);
    if (!parent) break;
    parts.unshift(normalize(parent.name));
    parentId = parent.parentId;
  }

  return parts
    .join("/")
    .split("/")
    .filter(Boolean)
    .join("/");
};
