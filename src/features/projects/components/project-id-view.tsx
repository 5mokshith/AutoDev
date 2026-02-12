"use client";

import { useEffect, useState } from "react";
import { Allotment } from "allotment";
import { Maximize2Icon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EditorView } from "@/features/editor/components/editor-view";

import { FileExplorer } from "./file-explorer";
import { Id } from "../../../../convex/_generated/dataModel";
import { PreviewView } from "./preview-view";
import { ExportPopover } from "./export-popover";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 350;
const DEFAULT_MAIN_SIZE = 1000;

const Tab = ({
  label,
  isActive,
  onClick
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 h-full px-3 cursor-pointer text-muted-foreground border-r hover:bg-accent/30",
        isActive && "bg-background text-foreground"
      )}
    >
      <span className="text-sm">{label}</span>
    </div>
  );
};

export const ProjectIdView = ({ 
  projectId
}: { 
  projectId: Id<"projects">
}) => {
  const [activeView, setActiveView] = useState<"editor" | "preview">("editor");
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  useEffect(() => {
    if (!isPreviewFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPreviewFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewFullscreen]);

  useEffect(() => {
    if (!isPreviewFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPreviewFullscreen]);

  return (
    <div className="h-full flex flex-col">
      <nav className="h-8.75 flex items-center bg-sidebar border-b">
        <Tab
          label="Code"
          isActive={activeView === "editor"}
          onClick={() => setActiveView("editor")}
        />
        <Tab
          label="Preview"
          isActive={activeView === "preview"}
          onClick={() => setActiveView("preview")}
        />
        <div className="flex-1 flex justify-end items-center gap-2 h-full pr-2">
          <div
            onClick={() => {
              setActiveView("preview");
              setIsPreviewFullscreen(true);
            }}
            className="flex items-center gap-1.5 h-full px-3 cursor-pointer text-muted-foreground border-l hover:bg-accent/30"
            title="Open preview in full screen (Esc to close)"
          >
            <Maximize2Icon className="size-3.5" />
            <span className="text-sm">Preview</span>
          </div>
          <ExportPopover projectId={projectId} />
        </div>
      </nav>
      <div className="flex-1 relative">
        <div className={cn(
          "absolute inset-0",
          activeView === "editor" ? "visible" : "invisible"
        )}>
          <Allotment defaultSizes={[DEFAULT_SIDEBAR_WIDTH, DEFAULT_MAIN_SIZE]}>
            <Allotment.Pane
              snap
              minSize={MIN_SIDEBAR_WIDTH}
              maxSize={MAX_SIDEBAR_WIDTH}
              preferredSize={DEFAULT_SIDEBAR_WIDTH}
            >
              <FileExplorer projectId={projectId} />
            </Allotment.Pane>
            <Allotment.Pane>
              <EditorView projectId={projectId} />
            </Allotment.Pane>
          </Allotment>
        </div>
        <div className={cn(
          "absolute inset-0",
          (activeView === "preview" || isPreviewFullscreen) ? "visible" : "invisible",
          isPreviewFullscreen && "fixed inset-0 z-50 bg-background"
        )}>
          {isPreviewFullscreen && (
            <button
              type="button"
              onClick={() => setIsPreviewFullscreen(false)}
              className="absolute top-10 right-5 z-50 inline-flex items-center justify-center size-9 rounded-md border bg-background/80 text-foreground shadow-sm backdrop-blur hover:bg-background"
              title="Close (Esc)"
            >
              <XIcon className="size-4" />
            </button>
          )}
          <PreviewView projectId={projectId} />
        </div>
      </div>
    </div>
  );
};
