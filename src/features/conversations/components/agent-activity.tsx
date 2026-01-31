"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { FileIcon } from "@react-symbols/icons/utils";

import { useAgentEventsForMessage } from "@/features/conversations/hooks/use-conversations";
import { useEditor } from "@/features/editor/hooks/use-editor";
import { useFiles } from "@/features/projects/hooks/use-files";
import { getFilePath } from "@/features/preview/utils/file-tree";

import { Doc, Id } from "../../../../convex/_generated/dataModel";

type AgentEvent = {
  _id: string;
  type:
    | "createFiles"
    | "updateFile"
    | "createFolder"
    | "renameFile"
    | "deleteFiles"
    | "readFiles"
    | "listFiles";
  status?: "running" | "done" | "error";
  fileId?: Id<"files">;
  fileIds?: Id<"files">[];
  parentId?: Id<"files">;
  name?: string;
  names?: string[];
  createdAt: number;
};

type Chip = {
  key: string;
  eventType: AgentEvent["type"];
  text: string;
  title?: string;
  fileName?: string;
  fileId?: Id<"files">;
  status?: AgentEvent["status"];
  createdAt: number;
};

const joinPath = (base: string, name: string) => {
  if (!base) return name;
  return `${base.replace(/\/+$/g, "")}/${name.replace(/^\/+/, "")}`;
};

const getBasename = (p: string) => {
  const normalized = p.replace(/\\/g, "/").replace(/\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
};

const toPastTense = (s: string) => {
  const map: Record<string, string> = {
    Listing: "Listed",
    Reading: "Read",
    Editing: "Edited",
    Creating: "Created",
    Deleting: "Deleted",
    Renaming: "Renamed",
  };

  for (const [present, past] of Object.entries(map)) {
    if (s.startsWith(`${present} `)) {
      return `${past} ${s.slice(present.length + 1)}`;
    }
    if (s === present) {
      return past;
    }
  }

  return s;
};

export const AgentActivity = ({
  projectId,
  messageId,
  messageStatus,
  className,
}: {
  projectId: Id<"projects">;
  messageId: Id<"messages"> | null;
  messageStatus?: "processing" | "completed" | "cancelled";
  className?: string;
}) => {
  const { openFile } = useEditor(projectId);
  const eventsRaw = useAgentEventsForMessage(messageId);
  const files = useFiles(projectId);

  const chips = useMemo<Chip[]>(() => {
    const events = (eventsRaw ?? []) as unknown as AgentEvent[];
    if (events.length === 0) return [];

    const fileList = (files ?? []) as unknown as Doc<"files">[];
    const filesMap = new Map(fileList.map((f) => [f._id, f] as const));

    const getPathForFileId = (fileId: Id<"files"> | undefined) => {
      if (!fileId) return null;
      const file = filesMap.get(fileId);
      if (!file) return null;
      try {
        return getFilePath(file, filesMap);
      } catch {
        return null;
      }
    };

    const getPathForParentId = (parentId: Id<"files"> | undefined) => {
      if (!parentId) return "";
      return getPathForFileId(parentId) ?? "";
    };

    const out: Chip[] = [];

    for (const event of events) {
      if (event.type === "listFiles") {
        out.push({
          key: `${event._id}:listFiles`,
          eventType: "listFiles",
          text: "Listing files",
          title: "Listing files",
          status: event.status,
          createdAt: event.createdAt,
        });
        continue;
      }

      if (event.type === "createFiles") {
        const base = getPathForParentId(event.parentId);
        const names = event.names ?? [];
        const fileIds = event.fileIds ?? [];
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          const fullPath = joinPath(base, name);
          out.push({
            key: `${event._id}:create:${name}`,
            eventType: "createFiles",
            text: `Creating ${getBasename(fullPath)}`,
            title: `Creating ${fullPath}`,
            fileName: getBasename(fullPath),
            fileId: fileIds[i],
            status: event.status,
            createdAt: event.createdAt,
          });
        }
        continue;
      }

      if (event.type === "createFolder") {
        const base = getPathForParentId(event.parentId);
        const name = event.name ?? "";
        const fullPath = name ? joinPath(base, name) : "";
        out.push({
          key: `${event._id}:createFolder:${name}`,
          eventType: "createFolder",
          text: name ? `Creating ${getBasename(fullPath)}` : "Creating folder",
          title: name ? `Creating folder ${fullPath}` : "Creating folder",
          fileName: name ? getBasename(fullPath) : undefined,
          fileId: event.fileId,
          status: event.status,
          createdAt: event.createdAt,
        });
        continue;
      }

      if (event.type === "updateFile") {
        const path = getPathForFileId(event.fileId) ?? event.name ?? "";
        out.push({
          key: `${event._id}:updateFile:${path}`,
          eventType: "updateFile",
          text: path ? `Editing ${getBasename(path)}` : "Editing file",
          title: path ? `Editing ${path}` : "Editing file",
          fileName: path ? getBasename(path) : undefined,
          fileId: event.fileId,
          status: event.status,
          createdAt: event.createdAt,
        });
        continue;
      }

      if (event.type === "readFiles") {
        const fileIds = event.fileIds ?? [];
        const names = event.names ?? [];

        if (fileIds.length > 0) {
          for (const id of fileIds) {
            const path = getPathForFileId(id) ?? "";
            out.push({
              key: `${event._id}:read:${String(id)}`,
              eventType: "readFiles",
              text: path ? `Reading ${getBasename(path)}` : "Reading file",
              title: path ? `Reading ${path}` : "Reading file",
              fileName: path ? getBasename(path) : undefined,
              fileId: id,
              status: event.status,
              createdAt: event.createdAt,
            });
          }
        } else if (names.length > 0) {
          for (const name of names) {
            out.push({
              key: `${event._id}:read:${name}`,
              eventType: "readFiles",
              text: `Reading ${getBasename(name)}`,
              title: `Reading ${name}`,
              fileName: getBasename(name),
              status: event.status,
              createdAt: event.createdAt,
            });
          }
        } else {
          out.push({
            key: `${event._id}:readFiles`,
            eventType: "readFiles",
            text: "Reading files",
            title: "Reading files",
            status: event.status,
            createdAt: event.createdAt,
          });
        }
        continue;
      }

      if (event.type === "renameFile") {
        const oldName = event.names?.[0] ?? "";
        const newName = event.name ?? "";

        const file = event.fileId ? filesMap.get(event.fileId) : undefined;
        const parentPath = file?.parentId ? getPathForFileId(file.parentId) : null;

        if (parentPath && oldName && newName) {
          const oldFull = joinPath(parentPath, oldName);
          const newFull = joinPath(parentPath, newName);
          out.push({
            key: `${event._id}:rename:${oldName}->${newName}`,
            eventType: "renameFile",
            text: `Renaming ${getBasename(oldFull)} → ${getBasename(newFull)}`,
            title: `Renaming ${oldFull} → ${newFull}`,
            fileName: getBasename(newFull),
            fileId: event.fileId,
            status: event.status,
            createdAt: event.createdAt,
          });
        } else if (oldName && newName) {
          out.push({
            key: `${event._id}:rename:${oldName}->${newName}`,
            eventType: "renameFile",
            text: `Renaming ${getBasename(oldName)} → ${getBasename(newName)}`,
            title: `Renaming ${oldName} → ${newName}`,
            fileName: getBasename(newName),
            fileId: event.fileId,
            status: event.status,
            createdAt: event.createdAt,
          });
        } else {
          out.push({
            key: `${event._id}:rename`,
            eventType: "renameFile",
            text: "Renaming",
            title: "Renaming",
            fileId: event.fileId,
            status: event.status,
            createdAt: event.createdAt,
          });
        }
        continue;
      }

      if (event.type === "deleteFiles") {
        const names = event.names ?? [];
        if (names.length > 0) {
          for (const name of names) {
            out.push({
              key: `${event._id}:delete:${name}`,
              eventType: "deleteFiles",
              text: `Deleting ${getBasename(name)}`,
              title: `Deleting ${name}`,
              fileName: getBasename(name),
              fileId: event.fileId,
              status: event.status,
              createdAt: event.createdAt,
            });
          }
        } else {
          out.push({
            key: `${event._id}:deleteFiles`,
            eventType: "deleteFiles",
            text: "Deleting files",
            title: "Deleting files",
            status: event.status,
            createdAt: event.createdAt,
          });
        }
        continue;
      }
    }

    return out.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.key.localeCompare(b.key);
    });
  }, [eventsRaw, files]);

  const isFinal = messageStatus === "completed";

  const { visible, hiddenCount } = useMemo(() => {
    const MAX_PROCESSING = 6;
    const MAX_FINAL = 12;

    if (!isFinal) {
      const v = chips.slice(-MAX_PROCESSING);
      return { visible: v, hiddenCount: Math.max(0, chips.length - v.length) };
    }

    const keepTypes = new Set<Chip["eventType"]>([
      "createFiles",
      "updateFile",
      "renameFile",
    ]);

    const candidates = chips.filter(
      (c) => keepTypes.has(c.eventType) && Boolean(c.fileId)
    );

    const bestByFileId = new Map<string, Chip>();

    for (const chip of candidates) {
      const key = String(chip.fileId);
      const existing = bestByFileId.get(key);
      if (!existing || existing.createdAt <= chip.createdAt) {
        bestByFileId.set(key, chip);
      }
    }

    const deduped = [...bestByFileId.values()];
    deduped.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.key.localeCompare(b.key);
    });

    const v = deduped.slice(-MAX_FINAL);
    return { visible: v, hiddenCount: Math.max(0, deduped.length - v.length) };
  }, [chips, isFinal]);

  if (!messageId || visible.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 max-w-full",
        className
      )}
    >
      {visible.map((chip, index) => {
        const dim = index < Math.max(0, visible.length - 4);

        const effectiveStatus =
          isFinal && chip.status === "running" ? "done" : chip.status;
        const text =
          effectiveStatus === "done" || isFinal ? toPastTense(chip.text) : chip.text;
        const title =
          effectiveStatus === "done" || isFinal
            ? toPastTense(chip.title ?? chip.text)
            : (chip.title ?? chip.text);

        const content = (
          <span className="flex items-center gap-2 min-w-0">
            {chip.fileName && (
              <FileIcon
                fileName={chip.fileName}
                autoAssign
                className="size-4 shrink-0"
              />
            )}
            <span className="truncate">{text}</span>
          </span>
        );

        if (chip.fileId) {
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => openFile(chip.fileId!, { pinned: false })}
              title={title}
              className={cn(
                "w-full flex items-center rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground",
                "hover:bg-secondary/80",
                dim && "opacity-60",
                effectiveStatus === "running" && "animate-pulse",
                effectiveStatus === "error" && "border border-destructive text-destructive"
              )}
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={chip.key}
            className={cn(
              "w-full flex items-center rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground",
              dim && "opacity-60",
              effectiveStatus === "running" && "animate-pulse",
              effectiveStatus === "error" && "border border-destructive text-destructive"
            )}
            title={title}
          >
            {content}
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <div className="w-full flex items-center rounded-md border px-3 py-2 text-sm text-muted-foreground">
          +{hiddenCount} more
        </div>
      )}
    </div>
  );
};
