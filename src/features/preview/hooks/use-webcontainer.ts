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
    mountedProjectId: string | null;
    installedSignature: string | null;
  };
};

const store = (globalStore.__autodevWebcontainer ??= {
  instance: null,
  bootPromise: null,
  mountedProjectId: null,
  installedSignature: null,
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
  store.mountedProjectId = null;
  store.installedSignature = null;
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
  const cancelledRef = useRef(false);
  const serverReadyTokenRef = useRef(0);
  const lastSyncedRef = useRef<Map<string, number>>(new Map());
  const pendingSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);

  // Fetch files from Convex (auto-updates on changes)
  const files = useFiles(projectId);

  // Initial boot and mount
  useEffect(() => {
    if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    cancelledRef.current = false;
    const serverReadyToken = ++serverReadyTokenRef.current;

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

        try {
          installProcessRef.current?.kill?.();
        } catch {}
        try {
          devProcessRef.current?.kill?.();
        } catch {}

        installProcessRef.current = null;
        devProcessRef.current = null;

        if (store.mountedProjectId !== projectId) {
          const fileTree = buildFileTree(files);
          await container.mount(fileTree);
          store.mountedProjectId = projectId;
          store.installedSignature = null;
        }

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

        container.on("server-ready", (_port, url) => {
          if (cancelledRef.current) return;
          if (serverReadyTokenRef.current !== serverReadyToken) return;
          setPreviewUrl(url);
          setStatus("running");
        });

        const lockFile = files.find(
          (f) =>
            f.type === "file" &&
            !f.storageId &&
            typeof f.content === "string" &&
            ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(
              f.name
            ) &&
            getFilePath(f, filesMap as unknown as Map<Id<"files">, typeof f>) ===
              f.name
        );

        const installSignature = `${packageJsonFile?.content ?? ""}\n${
          typeof lockFile?.content === "string" ? lockFile.content : ""
        }`;

        let hasNodeModules = false;
        try {
          await container.fs.readdir("node_modules");
          hasNodeModules = true;
        } catch {}

        const shouldInstall =
          !hasNodeModules || store.installedSignature !== installSignature;

        if (shouldInstall) {
          setStatus("installing");

          // Parse install command (default: npm install)
          const installCmd = settings?.installCommand || "npm install";
          const [installBin, ...installArgs] = installCmd.split(" ");
          appendOutput(`$ ${installCmd}\n`);
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

          store.installedSignature = installSignature;
        } else {
          appendOutput(`$ npm install (cached)\n`);
        }

        // Parse dev command (default: npm run dev)
        let devCmd = settings?.devCommand || "npm run dev";
        if (isNextProject) {
          const hasWebpack = devCmd.includes("--webpack");
          if (!hasWebpack) {
            if (devCmd.includes("--turbo")) {
              devCmd = devCmd.replace("--turbo", "--webpack");
            } else if (devCmd === "npm run dev") {
              devCmd = "npm run dev -- --webpack";
            } else if (devCmd.startsWith("npm run dev ")) {
              devCmd = `${devCmd} -- --webpack`;
            } else if (devCmd.startsWith("next dev")) {
              devCmd = `${devCmd} --webpack`;
            }
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
        if (cancelledRef.current) return;
        setError(error instanceof Error ? error.message : "Unknown error");
        setStatus("error");
      }
    };

    start();

    return () => {
      cancelledRef.current = true;
      serverReadyTokenRef.current++;
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

    if (pendingSyncTimerRef.current) {
      clearTimeout(pendingSyncTimerRef.current);
      pendingSyncTimerRef.current = null;
    }

    const filesMap = new Map(files.map((f) => [f._id, f]));

    pendingSyncTimerRef.current = setTimeout(() => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;

      const run = async () => {
        try {
          const lastSynced = lastSyncedRef.current;
          const currentPaths = new Set<string>();

          for (const file of files) {
            if (file.type !== "file" || file.storageId || !file.content) continue;

            const filePath = getFilePath(file, filesMap);
            currentPaths.add(filePath);

            const lastUpdatedAt = lastSynced.get(filePath);
            if (lastUpdatedAt === file.updatedAt) continue;

            await container.fs.writeFile(filePath, file.content);
            lastSynced.set(filePath, file.updatedAt);
          }

          for (const [path] of lastSynced) {
            if (currentPaths.has(path)) continue;
            try {
              await container.fs.rm(path);
            } catch {}
            lastSynced.delete(path);
          }
        } finally {
          syncInFlightRef.current = false;
        }
      };

      void run();
    }, 250);

    return () => {
      if (pendingSyncTimerRef.current) {
        clearTimeout(pendingSyncTimerRef.current);
        pendingSyncTimerRef.current = null;
      }
    };
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
  const restart = useCallback((mode: "soft" | "hard" = "soft") => {
    try {
      installProcessRef.current?.kill?.();
    } catch {}
    try {
      devProcessRef.current?.kill?.();
    } catch {}

    cancelledRef.current = true;
    serverReadyTokenRef.current++;

    if (mode === "hard") {
      teardownWebContainer();
    }

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
