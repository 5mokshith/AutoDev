"use client";

import { Poppins } from "next/font/google";
import { SparkleIcon } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { ProjectsList } from "./projects-list";
import { ProjectsCommandDialog } from "./projects-command-dialog";
import { ImportGithubDialog } from "./import-github-dialog";
import { NewProjectDialog } from "./new-project-dialog";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const ProjectsView = () => {
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "k") {
          e.preventDefault();
          setCommandDialogOpen(true);
        }
        if (e.key === "i") {
          e.preventDefault();
          setImportDialogOpen(true);
        }
        if (e.key === "j") {
          e.preventDefault();
          setNewProjectDialogOpen(true);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);


  return (
    <>
      <ProjectsCommandDialog
        open={commandDialogOpen}
        onOpenChange={setCommandDialogOpen}
      />
      <ImportGithubDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
      <NewProjectDialog
        open={newProjectDialogOpen}
        onOpenChange={setNewProjectDialogOpen}
      />
      <div className="min-h-screen bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="AutoDev" className="size-7" />
              <div className={cn("text-sm font-semibold tracking-tight", font.className)}>
                AutoDev
              </div>
            </div>
            <div className="flex items-center gap-2">
              <UserButton />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-xl">
              <div className="rounded-2xl border bg-card/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Your workspace
                    </div>
                    <div className="text-xl font-semibold tracking-tight">
                      Projects
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setNewProjectDialogOpen(true)}
                    className="h-full items-start justify-start p-4 bg-background/30 border flex flex-col gap-6 rounded-xl"
                  >
                    <div className="flex items-center justify-between w-full">
                      <SparkleIcon className="size-4" />
                      <Kbd className="bg-accent/40 border border-border">
                        ⌘J
                      </Kbd>
                    </div>
                    <div>
                      <span className="text-sm">New</span>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setImportDialogOpen(true)}
                    className="h-full items-start justify-start p-4 bg-background/30 border flex flex-col gap-6 rounded-xl"
                  >
                    <div className="flex items-center justify-between w-full">
                      <FaGithub className="size-4" />
                      <Kbd className="bg-accent/40 border border-border">
                        ⌘I
                      </Kbd>
                    </div>
                    <div>
                      <span className="text-sm">Import</span>
                    </div>
                  </Button>
                </div>

                <div className="mt-5">
                  <ProjectsList onViewAll={() => setCommandDialogOpen(true)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
