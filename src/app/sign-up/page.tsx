"use client";

import Image from "next/image";
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-6 py-12 md:grid-cols-2">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="AutoDev" width={34} height={34} />
            <div className="text-lg font-semibold tracking-tight">AutoDev</div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Start building in minutes
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Create an account to manage projects and run AI-assisted workflows.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>Secure authentication powered by Clerk</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>

        <div className="flex w-full justify-center md:justify-end">
          <div className="w-full max-w-md rounded-xl border bg-card/60 p-2 shadow-2xl shadow-black/20 backdrop-blur">
            <SignUp routing="path" path="/sign-up" />
          </div>
        </div>
      </div>
    </div>
  );
}
