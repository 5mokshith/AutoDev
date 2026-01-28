import { useCallback, useEffect, useRef, useState } from "react";
import { WebContainer } from "@webcontainer/api";

import { 
  buildFileTree,
  getFilePath
} from "@/features/preview/utils/file-tree";
import { useFiles } from "@/features/projects/hooks/use-files";
import { Id } from "../../../../convex/_generated/dataModel";

// Singleton WebContainer instance
const globalStore = globalThis as unknown as {
  __autodevWebcontainer?: {
    instance: WebContainer | null;
    bootPromise: Promise<WebContainer> | null;
  };
};

const store = (globalStore.__autodevWebcontainer ??= {
  instance: null,
  bootPromise: null,
});

const getWebContainer = async (): Promise<WebContainer> => {
  if (store.instance) {
    return store.instance;
  }

  if (!store.bootPromise) {
    store.bootPromise = WebContainer.boot({ coep: "credentialless" });
  }

  store.instance = await store.bootPromise;
  return store.instance;
};

const teardownWebContainer = () => {
  if (store.instance) {
    store.instance.teardown();
    store.instance = null;
  }
  store.bootPromise = null;
};

interface UseWebContainerProps {
  projectId: Id<"projects">;
  enabled: boolean;
  settings?: {
    installCommand?: string;
    devCommand?: string;
  };
};

export const useWebContainer = ({
  projectId,
  enabled,
  settings,
}: UseWebContainerProps) => {
  const [status, setStatus] = useState<
    "idle" | "booting" | "installing" | "running" | "error"
  >("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [terminalOutput, setTerminalOutput] = useState("");

  const containerRef = useRef<WebContainer | null>(null);
  const hasStartedRef = useRef(false);
  const devProcessRef = useRef<{ kill?: () => void } | null>(null);
  const installProcessRef = useRef<{ kill?: () => void } | null>(null);
  const serverReadyListenerAttachedRef = useRef(false);

  // Fetch files from Convex (auto-updates on changes)
  const files = useFiles(projectId);

  // Initial boot and mount
  useEffect(() => {
    if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    let cancelled = false;

    const start = async () => {
      try {
        setStatus("booting");
        setError(null);
        setTerminalOutput("");

        const appendOutput = (data: string) => {
          setTerminalOutput((prev) => prev + data);
        };

        const container = await getWebContainer();
        containerRef.current = container;

        const fileTree = buildFileTree(files);
        await container.mount(fileTree);

        const filesMap = new Map(files.map((f) => [f._id, f]));
        const packageJsonFile = files.find(
          (f) =>
            f.type === "file" &&
            f.name === "package.json" &&
            !f.storageId &&
            typeof f.content === "string" &&
            getFilePath(f, filesMap as unknown as Map<Id<"files">, typeof f>) ===
              "package.json"
        );

        let isNextProject = false;
        if (packageJsonFile?.content) {
          try {
            const pkg = JSON.parse(packageJsonFile.content) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            isNextProject = Boolean(
              pkg.dependencies?.next || pkg.devDependencies?.next
            );
          } catch {}
        }

        if (!serverReadyListenerAttachedRef.current) {
          serverReadyListenerAttachedRef.current = true;
          container.on("server-ready", (_port, url) => {
            if (cancelled) return;
            setPreviewUrl(url);
            setStatus("running");
          });
        }

        setStatus("installing");

        // Parse install command (default: npm install)
        const installCmd = settings?.installCommand || "npm install";
        const [installBin, ...installArgs] = installCmd.split(" ");
        appendOutput(`$ ${installCmd}\n`)
        const installProcess = await container.spawn(installBin, installArgs);
        installProcessRef.current = installProcess as unknown as {
          kill?: () => void;
        };
        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          })
        );
        const installExitCode = await installProcess.exit;

        if (installExitCode !== 0) {
          throw new Error(
            `${installCmd} failed with code ${installExitCode}`
          );
        }

        // Parse dev command (default: npm run dev)
        let devCmd = settings?.devCommand || "npm run dev";
        if (isNextProject && !devCmd.includes("--no-turbo")) {
          if (devCmd === "npm run dev") {
            devCmd = "npm run dev -- --no-turbo";
          } else if (devCmd.startsWith("npm run dev ")) {
            devCmd = `${devCmd} -- --no-turbo`;
          } else if (devCmd.startsWith("next dev")) {
            devCmd = `${devCmd} --no-turbo`;
          }
        }

        const [devBin, ...devArgs] = devCmd.split(" ");
        appendOutput(`\n$ ${devCmd}\n`);
        const devProcess = await container.spawn(devBin, devArgs);
        devProcessRef.current = devProcess as unknown as {
          kill?: () => void;
        };
        devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          })
        );
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : "Unknown error");
        setStatus("error");
      }
    };

    start();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    files,
    restartKey,
    settings?.devCommand,
    settings?.installCommand,
  ]);

  // Sync file changes (hot-reload)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !files || status !== "running") return;

    const filesMap = new Map(files.map((f) => [f._id, f]));

    for (const file of files) {
      if (file.type !== "file" || file.storageId || !file.content) continue;

      const filePath = getFilePath(file, filesMap);
      container.fs.writeFile(filePath, file.content);
    }
  }, [files, status]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      hasStartedRef.current = false;
      setStatus("idle");
      setPreviewUrl(null);
      setError(null);
    }
  }, [enabled]);

  // Restart the entire WebContainer process
  const restart = useCallback(() => {
    try {
      installProcessRef.current?.kill?.();
    } catch {}
    try {
      devProcessRef.current?.kill?.();
    } catch {}

    containerRef.current = null;
    hasStartedRef.current = false;
    installProcessRef.current = null;
    devProcessRef.current = null;
    setStatus("idle");
    setPreviewUrl(null);
    setError(null);
    setRestartKey((k) => k + 1);
  }, []);

  return {
    status,
    previewUrl,
    error,
    restart,
    terminalOutput,
  };
};
