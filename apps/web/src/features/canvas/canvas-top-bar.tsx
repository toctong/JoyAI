"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCanvasStore } from "./store";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";

export function CanvasTopBar({ projectId }: { projectId: string }) {
  const title = useCanvasStore((s) => s.title);
  const dirty = useCanvasStore((s) => s.dirty);
  const setTitle = useCanvasStore((s) => s.setTitle);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  async function commitTitle() {
    const next = draft.trim() || "未命名项目";
    if (next === title) {
      setDraft(next);
      return;
    }
    setTitle(next);
    await api(`/canvas/projects/${projectId}`, {
      method: "PATCH",
      body: { title: next },
    });
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 top-2.5 z-30 flex items-center justify-between gap-3">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <Link
          href="/canvas"
          title="返回项目"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-md transition hover:bg-black/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="h-9 min-w-0 max-w-[240px] truncate rounded-xl bg-black/45 px-3 text-sm font-medium text-white/95 outline-none backdrop-blur-md placeholder:text-white/40 focus:bg-black/55"
          placeholder="未命名项目"
        />
        <span
          className={cn(
            "rounded-lg px-2 py-1 text-[11px] font-medium backdrop-blur-md",
            dirty
              ? "bg-amber-500/20 text-amber-200"
              : "bg-black/35 text-white/50",
          )}
        >
          {dirty ? "未保存" : "已保存"}
        </span>
      </div>
    </div>
  );
}
