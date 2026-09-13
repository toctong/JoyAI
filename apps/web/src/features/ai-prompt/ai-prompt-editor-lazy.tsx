"use client";

import dynamic from "next/dynamic";
import { cn } from "@/shared/lib/utils";

function EditorSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "min-h-[72px] animate-pulse rounded-xl bg-muted/40",
        className,
      )}
      aria-hidden
    />
  );
}

export const AiPromptEditor = dynamic(
  () =>
    import("./ai-prompt-editor").then((m) => m.AiPromptEditor),
  {
    ssr: false,
    loading: () => <EditorSkeleton />,
  },
);
