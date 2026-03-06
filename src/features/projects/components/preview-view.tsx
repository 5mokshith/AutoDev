"use client";

import { useEffect, useState } from "react";
import { Allotment } from "allotment";
import {
  Loader2Icon,
  TerminalSquareIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from "lucide-react";

import { useWebContainer } from "@/features/preview/hooks/use-webcontainer";
import { PreviewSettingsPopover } from "@/features/preview/components/preview-settings-popover";
import { PreviewTerminal } from "@/features/preview/components/preview-terminal";

import { Button } from "@/components/ui/button";

import { useProject } from "../hooks/use-projects";

import { Id } from "../../../../convex/_generated/dataModel";

export const PreviewView = ({ projectId, enabled }: { projectId: Id<"projects">; enabled: boolean }) => {
  const project = useProject(projectId);
  const [showTerminal, setShowTerminal] = useState(true);
  const [iframeState, setIframeState] = useState<
    "idle" | "loading" | "loaded" | "error" | "timeout"
  >("idle");

  const {
    status, previewUrl, error, restart, terminalOutput
  } = useWebContainer({
    projectId,
    enabled,
    settings: project?.settings,
  });

  const handleRestart = () => {
    restart();
  };

  useEffect(() => {
    if (!previewUrl) {
      setIframeState("idle");
      return;
    }

    setIframeState("loading");
    const timeout = setTimeout(() => {
      setIframeState((current) => (current === "loaded" ? current : "timeout"));
    }, 10_000);

    return () => clearTimeout(timeout);
  }, [previewUrl]);

  const isLoading =
    status === "booting" ||
    status === "preparing" ||
    status === "installing" ||
    status === "starting";

  const loadingLabel =
    status === "booting"
      ? "Starting..."
      : status === "preparing"
        ? "Preparing preview..."
        : status === "installing"
          ? "Installing..."
          : status === "starting"
            ? "Starting server..."
            : "";

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-8.75 flex items-center border-b border-border/60 bg-sidebar/60 backdrop-blur shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-full rounded-none"
          disabled={isLoading}
          onClick={handleRestart}
          title="Restart container"
        >
          <RefreshCwIcon className="size-3" />
        </Button>

        <div className="flex-1 h-full flex items-center px-3 bg-background/20 border-x border-border/60 text-xs text-muted-foreground truncate font-mono">
          {isLoading && (
            <div className="flex items-center gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              {loadingLabel}
            </div>
          )}
          {previewUrl && <span className="truncate">{previewUrl}</span>}
          {!isLoading && !previewUrl && !error && <span>Ready to preview</span>}
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-full rounded-none"
          title="Toggle terminal"
          onClick={() => setShowTerminal((value) => !value)}
        >
          <TerminalSquareIcon className="size-3" />
        </Button>
        <PreviewSettingsPopover
          projectId={projectId}
          initialValues={project?.settings}
          onSave={handleRestart}
        />
      </div>

      <div className="flex-1 min-h-0">
        <Allotment vertical>
          <Allotment.Pane>
            {error && (
              <div className="size-full flex items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 max-w-md mx-auto text-center">
                  <AlertTriangleIcon className="size-6" />
                  <p className="text-sm font-medium">{error}</p>
                  <Button size="sm" variant="outline" onClick={handleRestart}>
                    <RefreshCwIcon className="size-4" />
                    Restart
                  </Button>
                </div>
              </div>
            )}

            {!error && previewUrl && (iframeState === "error" || iframeState === "timeout") && (
              <div className="size-full flex items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 max-w-md mx-auto text-center">
                  <AlertTriangleIcon className="size-6" />
                  <p className="text-sm font-medium">
                    {iframeState === "timeout"
                      ? "Preview is taking too long to load (blank screen)."
                      : "Preview failed to load."}
                  </p>
                  <p className="text-xs">
                    Check the terminal output below for runtime errors, or restart the container.
                  </p>
                  <Button size="sm" variant="outline" onClick={handleRestart}>
                    <RefreshCwIcon className="size-4" />
                    Restart
                  </Button>
                </div>
              </div>
            )}

            {isLoading && !error && !previewUrl && (
              <div className="size-full flex items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 max-w-md mx-auto text-center">
                  <Loader2Icon className="size-6 animate-spin" />
                  <p className="text-sm font-medium">{loadingLabel}</p>
                </div>
              </div>
            )}

            {previewUrl && (
              <iframe
                src={previewUrl}
                className="size-full border-0"
                title="Preview"
                onLoad={() => setIframeState("loaded")}
                onError={() => setIframeState("error")}
              />
            )}
          </Allotment.Pane>

          {showTerminal && (
            <Allotment.Pane minSize={100} maxSize={500} preferredSize={200}>
              <div className="h-full flex flex-col bg-background border-t border-border/60">
                <div className="h-7 flex items-center px-3 text-xs gap-1.5 text-muted-foreground border-b border-border/60 bg-sidebar/40 shrink-0">
                  <TerminalSquareIcon className="size-3" />
                  Terminal
                </div>
                <PreviewTerminal output={terminalOutput} />
              </div>
            </Allotment.Pane>
          )}
        </Allotment>
      </div>
    </div>
  );
};
