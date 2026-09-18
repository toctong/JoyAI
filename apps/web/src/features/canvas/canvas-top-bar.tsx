"use client";

import {
  CanvasIconFolder,
  CanvasIconHistory,
  CanvasIconHome,
  CanvasIconKeyboard,
  CanvasIconMenu,
  CanvasIconRedo,
  CanvasIconSearch,
  CanvasIconShortcuts,
  CanvasIconUndo,
  CanvasIconUpload,
} from "./icons/canvas-icons";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCanvasStore } from "./store";
import { useCanvasRightPanelStore } from "./right-panel-store";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  projectId: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onOpenShortcuts: () => void;
};

/** Top chrome — layout aligned to infinite-canvas (JoyAI theme). */
export function CanvasTopBar({
  projectId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImport,
  onOpenShortcuts,
}: Props) {
  const router = useRouter();
  const title = useCanvasStore((s) => s.title);
  const dirty = useCanvasStore((s) => s.dirty);
  const setTitle = useCanvasStore((s) => s.setTitle);
  const rightMode = useCanvasRightPanelStore((s) => s.mode);
  const toggleRight = useCanvasRightPanelStore((s) => s.toggle);
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  useEffect(() => {
    if (!editing) return;
    const close = (e: PointerEvent) => {
      if (!titleWrapRef.current?.contains(e.target as Node)) {
        void commitTitle();
      }
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [editing, draft, title]);

  async function commitTitle() {
    setEditing(false);
    const next = draft.trim() || "未命名项目";
    setDraft(next);
    if (next === title) return;
    setTitle(next);
    await api(`/canvas/projects/${projectId}`, {
      method: "PATCH",
      body: { title: next },
    });
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between pl-2 pr-4"
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="菜单"
              aria-label="菜单"
              className="grid size-8 place-items-center rounded-full text-foreground/80 transition hover:bg-muted"
            >
              <CanvasIconMenu className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>画布</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push("/")}>
              <CanvasIconHome className="size-4" />
              首页
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/canvas")}>
              <CanvasIconFolder className="size-4" />
              项目列表
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onImport}>
              <CanvasIconUpload className="size-4" />
              导入素材
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenShortcuts}>
              <CanvasIconKeyboard className="size-4" />
              快捷键
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canUndo} onClick={onUndo}>
              <CanvasIconUndo className="size-4" />
              撤销
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canRedo} onClick={onRedo}>
              <CanvasIconRedo className="size-4" />
              重做
              <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div ref={titleWrapRef} className="flex min-w-0 items-center gap-2 pl-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitTitle();
                if (e.key === "Escape") {
                  setDraft(title);
                  setEditing(false);
                }
              }}
              className="max-w-[260px] bg-transparent p-0 text-left text-base font-semibold outline-none"
            />
          ) : (
            <button
              type="button"
              className="max-w-[260px] truncate border-b border-dashed border-transparent text-left text-base font-semibold transition hover:border-foreground/40"
              onDoubleClick={() => setEditing(true)}
              title="双击重命名"
            >
              {title || "未命名项目"}
            </button>
          )}
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              dirty
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-200"
                : "text-muted-foreground",
            )}
          >
            {dirty ? "未保存" : "已保存"}
          </span>
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-1.5">
        <div className="joy-canvas-chrome flex items-center gap-0.5 rounded-xl p-1">
          <button
            type="button"
            title="搜索节点"
            aria-label="搜索节点"
            aria-pressed={rightMode === "nodes"}
            onClick={() => toggleRight("nodes")}
            className={cn(
              "joy-canvas-chrome-btn grid size-8 place-items-center rounded-lg",
              rightMode === "nodes" && "is-active",
            )}
          >
            <CanvasIconSearch className="size-4" />
          </button>
          <button
            type="button"
            title="生成历史"
            aria-label="生成历史"
            aria-pressed={rightMode === "history"}
            onClick={() => toggleRight("history")}
            className={cn(
              "joy-canvas-chrome-btn grid size-8 place-items-center rounded-lg",
              rightMode === "history" && "is-active",
            )}
          >
            <CanvasIconHistory className="size-4" />
          </button>
        </div>
        <Link
          href="/assets"
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          生成资产
        </Link>
        <button
          type="button"
          title="快捷键"
          aria-label="快捷键"
          onClick={onOpenShortcuts}
          className="grid size-8 place-items-center rounded-full text-foreground/80 transition hover:bg-muted"
        >
          <CanvasIconShortcuts className="size-4" />
        </button>
      </div>
    </div>
  );
}
