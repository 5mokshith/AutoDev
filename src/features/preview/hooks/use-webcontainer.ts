import { useCallback, useEffect, useRef, useState } from "react";
import { WebContainer } from "@webcontainer/api";

import { 
  buildFileTree,
  getFilePath
} from "@/features/preview/utils/file-tree";
import { useFiles } from "@/features/projects/hooks/use-files";
import { Id } from "../../../../convex/_generated/dataModel";

const splitCommand = (command: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (quote) {
      if (ch === "\\") {
        const next = command[i + 1];
        if (typeof next === "string") {
          current += next;
          i++;
        } else {
          current += ch;
        }
        continue;
      }
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "\\") {
      const next = command[i + 1];
      if (typeof next === "string") {
        current += next;
        i++;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === " ") {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
};

const getDirname = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
};

const getBasename = (path: string) => {
  const normalized = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return normalized[normalized.length - 1] ?? "";
};

const isValidPathSegment = (name: string) => {
  if (!name) return false;
  if (name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("\u0000")) return false;
  return true;
};

// Singleton WebContainer instance
const globalStore = globalThis as unknown as {
  __autodevWebcontainer?: {
    instance: WebContainer | null;
    bootPromise: Promise<WebContainer> | null;
    mountedProjectId: string | null;
    mountedMountPoint: string | null;
    installedSignature: string | null;
  };
};

const store = (globalStore.__autodevWebcontainer ??= {
  instance: null,
  bootPromise: null,
  mountedProjectId: null,
  mountedMountPoint: null,
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

const clearWorkdir = async (container: WebContainer) => {
  try {
    const entries = await container.fs.readdir(".");
    await Promise.all(
      entries.map(async (entry) => {
        try {
          await container.fs.rm(entry, { recursive: true, force: true });
        } catch {}
      })
    );
  } catch {}
};

const teardownWebContainer = () => {
  if (store.instance) {
    store.instance.teardown();
    store.instance = null;
  }
  store.bootPromise = null;
  store.mountedProjectId = null;
  store.mountedMountPoint = null;
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

type PackageManager = "npm" | "pnpm" | "yarn";

const detectPackageManager = (lockFileName?: string): PackageManager => {
  if (lockFileName === "pnpm-lock.yaml") return "pnpm";
  if (lockFileName === "yarn.lock") return "yarn";
  return "npm";
};

const getInstallCommandFor = (pm: PackageManager) => {
  if (pm === "pnpm") return "pnpm install";
  if (pm === "yarn") return "yarn";
  return "npm install";
};

const getRunScriptCommandFor = (
  pm: PackageManager,
  script: string,
  extraArgs: string[] = []
) => {
  if (pm === "yarn") {
    return ["yarn", [script, ...extraArgs]] as const;
  }
  if (pm === "pnpm") {
    return ["pnpm", [script, ...extraArgs]] as const;
  }
  return ["npm", ["run", script, ...(extraArgs.length ? ["--", ...extraArgs] : [])]] as const;
};

const fixNestedNodeScriptPath = (
  script: string,
  projectRoot: string,
  existingPathsLower: Set<string>
) => {
  if (projectRoot === ".") return script;

  const parts = splitCommand(script);
  if (parts.length < 2) return script;
  if (parts[0] !== "node") return script;

  const base = getBasename(projectRoot);
  if (!base) return script;

  const nodeArg = parts[1];
  if (!nodeArg.startsWith(`${base}/`)) return script;

  const rest = nodeArg.slice(base.length + 1);
  if (!rest) return script;

  const expectedPath = `${projectRoot}/${nodeArg}`.toLowerCase();
  const actualPath = `${projectRoot}/${rest}`.toLowerCase();

  if (existingPathsLower.has(actualPath) && !existingPathsLower.has(expectedPath)) {
    const next = [...parts];
    next[1] = rest;
    return next.join(" ");
  }

  return script;
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
  const lastSyncedByIdRef = useRef<
    Map<string, { path: string; updatedAt: number }>
  >(new Map());
  const pendingSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const serverReadyUnsubRef = useRef<null | (() => void)>(null);
  const projectRootRef = useRef<string>(".");

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
          serverReadyUnsubRef.current?.();
        } catch {}
        serverReadyUnsubRef.current = null;

        try {
          installProcessRef.current?.kill?.();
        } catch {}
        try {
          devProcessRef.current?.kill?.();
        } catch {}

        installProcessRef.current = null;
        devProcessRef.current = null;

        const filesMap = new Map(files.map((f) => [f._id, f]));

        {
          const invalidPaths: string[] = [];
          const collisions = new Map<string, string>();

          for (const file of files) {
            const relPath = getFilePath(file, filesMap as unknown as Map<Id<"files">, typeof file>);
            const segments = relPath.split("/");
            if (segments.some((s) => !isValidPathSegment(s))) {
              invalidPaths.push(relPath);
            }

            const key = relPath.toLowerCase();
            const existing = collisions.get(key);
            if (existing && existing !== relPath) {
              invalidPaths.push(`${existing} / ${relPath}`);
            } else {
              collisions.set(key, relPath);
            }
          }

          if (invalidPaths.length > 0) {
            throw new Error(
              `Invalid or conflicting file paths detected: ${invalidPaths
                .slice(0, 10)
                .join(", ")}${invalidPaths.length > 10 ? "..." : ""}`
            );
          }
        }

        if (store.mountedProjectId !== projectId) {
          await clearWorkdir(container);
          const fileTree = buildFileTree(files);
          await container.mount(fileTree);
          store.mountedProjectId = projectId;
          store.installedSignature = null;

          lastSyncedRef.current = new Map();
          lastSyncedByIdRef.current = new Map();
        }

        const packageJsonCandidates = files
          .filter(
            (f) =>
              f.type === "file" &&
              f.name === "package.json" &&
              !f.storageId &&
              typeof f.content === "string"
          )
          .map((f) => ({
            file: f,
            path: getFilePath(f, filesMap as unknown as Map<Id<"files">, typeof f>),
          }))
          .sort((a, b) => a.path.split("/").length - b.path.split("/").length);

        const packageJson = packageJsonCandidates[0] ?? null;
        const packageJsonFile = packageJson?.file;
        const packageJsonPath = packageJson?.path ?? null;

        const projectRoot = packageJsonPath ? getDirname(packageJsonPath) || "." : ".";
        projectRootRef.current = projectRoot;

        if (!packageJsonFile || !packageJsonPath) {
          throw new Error(
            "No package.json found. If the model created a nested folder project, ensure a package.json exists inside it."
          );
        }

        const packageJsonFsPath =
          projectRoot === "." ? "package.json" : `${projectRoot}/package.json`;

        try {
          await container.fs.readFile(packageJsonFsPath, "utf8");
        } catch {
          let rootEntries: string[] = [];
          let projectEntries: string[] = [];
          try {
            rootEntries = await container.fs.readdir(".");
          } catch {}
          if (projectRoot !== ".") {
            try {
              projectEntries = await container.fs.readdir(projectRoot);
            } catch {}
          }

          throw new Error(
            `Detected project root "${projectRoot}" (from "${packageJsonPath}"), but "${packageJsonFsPath}" is missing in WebContainer. Root entries: ${rootEntries
              .slice(0, 50)
              .join(", ")}. ${
              projectRoot !== "."
                ? `Entries in ${projectRoot}: ${projectEntries
                    .slice(0, 50)
                    .join(", ")}.`
                : ""
            }`
          );
        }

        let hasDevScript = false;
        let hasStartScript = false;
        let pkgManager: PackageManager = "npm";
        let isNextProject = false;
        let isViteProject = false;
        if (packageJsonFile?.content) {
          try {
            const pkg = JSON.parse(packageJsonFile.content) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
              scripts?: Record<string, string>;
            };
            hasDevScript = Boolean(pkg.scripts?.dev);
            hasStartScript = Boolean(pkg.scripts?.start);

            const deps = {
              ...(pkg.dependencies ?? {}),
              ...(pkg.devDependencies ?? {}),
            };
            isNextProject = Boolean(deps.next);
            isViteProject = Boolean(deps.vite);
          } catch {}
        }

        serverReadyUnsubRef.current = container.on("server-ready", (_port, url) => {
          if (cancelledRef.current) return;
          if (serverReadyTokenRef.current !== serverReadyToken) return;
          setPreviewUrl(url);
          setStatus("running");
        });

        const lockFile = files.find((f) => {
          if (
            f.type !== "file" ||
            f.storageId ||
            typeof f.content !== "string" ||
            !["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(f.name)
          ) {
            return false;
          }

          const lockPath = getFilePath(
            f,
            filesMap as unknown as Map<Id<"files">, typeof f>
          );
          return getDirname(lockPath) === projectRoot;
        });

        pkgManager = detectPackageManager(lockFile?.name);

        const installSignature = `${packageJsonFile?.content ?? ""}\n${
          typeof lockFile?.content === "string" ? lockFile.content : ""
        }`;

        let hasNodeModules = false;
        try {
          await container.fs.readdir(
            projectRoot === "." ? "node_modules" : `${projectRoot}/node_modules`
          );
          hasNodeModules = true;
        } catch {}

        const shouldInstall =
          !hasNodeModules || store.installedSignature !== installSignature;

        if (shouldInstall) {
          setStatus("installing");

          // Parse install command (default: based on lockfile)
          const installCmd = settings?.installCommand || getInstallCommandFor(pkgManager);
          const [installBin, ...installArgs] = splitCommand(installCmd);
          appendOutput(`$ ${installCmd}\n`);
          const installProcess = await container.spawn(installBin, installArgs, {
            cwd: projectRoot,
          });
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
          appendOutput(`$ ${getInstallCommandFor(pkgManager)} (cached)\n`);
        }

        // Parse dev command
        // If settings aren't provided, choose the best default based on package.json scripts.
        const devCmdFromSettings = (settings?.devCommand || "").trim();
        const normalizedLegacyDevCmd = devCmdFromSettings.replace(/\s+/g, " ");

        const isLegacyHardcodedWebpackCmd =
          normalizedLegacyDevCmd === "npm run dev -- --webpack";

        let devCmd = isLegacyHardcodedWebpackCmd ? "" : devCmdFromSettings;

        const projectFilesLower = new Set(
          files
            .filter((f) => f.type === "file")
            .map((f) =>
              getFilePath(
                f,
                filesMap as unknown as Map<Id<"files">, typeof f>
              ).toLowerCase()
            )
        );

        let devScript: string | null = null;
        if (packageJsonFile?.content) {
          try {
            const pkg = JSON.parse(packageJsonFile.content) as {
              scripts?: Record<string, string>;
            };
            devScript = pkg.scripts?.dev ?? null;
          } catch {}
        }

        if (!devCmd) {
          if (hasDevScript && devScript) {
            const fixedDevScript = fixNestedNodeScriptPath(
              devScript,
              projectRoot,
              projectFilesLower
            );

            if (fixedDevScript !== devScript) {
              devCmd = fixedDevScript;
            } else {
              const [bin, args] = getRunScriptCommandFor(pkgManager, "dev");
              devCmd = [bin, ...args].join(" ");
            }
          } else if (hasStartScript) {
            const [bin, args] = getRunScriptCommandFor(pkgManager, "start");
            devCmd = [bin, ...args].join(" ");
          } else {
            devCmd = "npm run dev";
          }
        }

        const ensureDevFlag = (cmd: string, flag: string) => {
          const parts = splitCommand(cmd);
          if (parts.includes(flag)) return cmd;

          const separatorIndex = parts.indexOf("--");
          if (separatorIndex !== -1) {
            if (!parts.slice(separatorIndex + 1).includes(flag)) {
              parts.push(flag);
            }
            return parts.join(" ");
          }

          const bin = parts[0] ?? "";
          const isNpmRun = bin === "npm" && parts[1] === "run";
          const isPnpmRun = bin === "pnpm" && parts[1] === "run";

          if (isNpmRun || isPnpmRun) {
            parts.push("--", flag);
            return parts.join(" ");
          }

          parts.push(flag);
          return parts.join(" ");
        };

        if (isNextProject) {
          devCmd = ensureDevFlag(devCmd, "--webpack");
        }
        if (isViteProject) {
          devCmd = ensureDevFlag(devCmd, "--host");
        }

        const [devBin, ...devArgs] = splitCommand(devCmd);
        appendOutput(`\n$ ${devCmd}\n`);
        const devProcess = await container.spawn(devBin, devArgs, {
          cwd: projectRoot,
          env: {
            HOST: "0.0.0.0",
            VITE_HOST: "0.0.0.0",
            PORT: "3000",
          },
        });
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

        void devProcess.exit.then((code) => {
          if (cancelledRef.current) return;
          if (serverReadyTokenRef.current !== serverReadyToken) return;
          if (code === 0) return;

          setError(`Dev process exited with code ${code}`);
          setStatus("error");
        });
      } catch (error) {
        if (cancelledRef.current) return;
        setError(
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : JSON.stringify(error)
        );
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
          const lastSyncedById = lastSyncedByIdRef.current;

          const desiredById = new Map<
            string,
            { path: string; content: string; updatedAt: number }
          >();

          for (const file of files) {
            if (file.type !== "file" || file.storageId || typeof file.content !== "string") {
              continue;
            }
            const relPath = getFilePath(file, filesMap);
            const segments = relPath.split("/");
            if (segments.some((s) => !isValidPathSegment(s))) {
              continue;
            }
            desiredById.set(String(file._id), {
              path: relPath,
              content: file.content,
              updatedAt: file.updatedAt,
            });
          }

          for (const [id, prev] of lastSyncedById) {
            if (desiredById.has(id)) continue;
            try {
              await container.fs.rm(prev.path, { force: true, recursive: true });
            } catch {}
            lastSynced.delete(prev.path);
            lastSyncedById.delete(id);
          }

          for (const [id, next] of desiredById) {
            const prev = lastSyncedById.get(id);
            const hasMoved = Boolean(prev && prev.path !== next.path);

            if (hasMoved && prev) {
              const tmpPath = `${next.path}.__case_tmp__${Date.now()}`;
              try {
                await container.fs.rename(prev.path, tmpPath);
                await container.fs.rename(tmpPath, next.path);
                lastSynced.delete(prev.path);
              } catch {
                try {
                  await container.fs.rm(prev.path, { force: true });
                } catch {}
                lastSynced.delete(prev.path);
              }
            }

            const lastUpdatedAt = lastSynced.get(next.path);
            if (!hasMoved && lastUpdatedAt === next.updatedAt) {
              continue;
            }

            const dir = getDirname(next.path);
            if (dir) {
              try {
                await container.fs.mkdir(dir, { recursive: true });
              } catch {}
            }

            await container.fs.writeFile(next.path, next.content);
            lastSynced.set(next.path, next.updatedAt);
            lastSyncedById.set(id, { path: next.path, updatedAt: next.updatedAt });
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

    try {
      serverReadyUnsubRef.current?.();
    } catch {}
    serverReadyUnsubRef.current = null;

    cancelledRef.current = true;
    serverReadyTokenRef.current++;

    if (mode === "hard") {
      teardownWebContainer();
    }

    containerRef.current = null;
    hasStartedRef.current = false;
    installProcessRef.current = null;
    devProcessRef.current = null;
    lastSyncedRef.current = new Map();
    lastSyncedByIdRef.current = new Map();
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
