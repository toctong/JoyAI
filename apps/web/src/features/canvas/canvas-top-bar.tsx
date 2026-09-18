"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  HelpCircle,
  Home,
  Keyboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Undo2,
  Upload,
} from "lucide-react";
import { useCanvasStore } from "./store";
import {
  hydrateSidePanelPrefs,
  useCanvasSidePanelStore,
} from "./side-panel-store";
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
  const sideOpen = useCanvasSidePanelStore((s) => s.open);
  const toggleSide = useCanvasSidePanelStore((s) => s.toggle);
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hydrateSidePanelPrefs();
  }, []);

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
        <button
          type="button"
          title={sideOpen ? "收起侧栏" : "展开侧栏"}
          aria-label={sideOpen ? "收起侧栏" : "展开侧栏"}
          aria-pressed={sideOpen}
          onClick={toggleSide}
          className="grid size-8 place-items-center rounded-full text-foreground/80 transition hover:bg-muted"
        >
          {sideOpen ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeftOpen className="size-4" />
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="菜单"
              aria-label="菜单"
              className="grid size-8 place-items-center rounded-full text-foreground/80 transition hover:bg-muted"
            >
              <Menu className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>画布</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push("/")}>
              <Home className="size-4" />
              首页
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/canvas")}>
              <FolderOpen className="size-4" />
              项目列表
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onImport}>
              <Upload className="size-4" />
              导入素材
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenShortcuts}>
              <Keyboard className="size-4" />
              快捷键
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canUndo} onClick={onUndo}>
              <Undo2 className="size-4" />
              撤销
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canRedo} onClick={onRedo}>
              <Redo2 className="size-4" />
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
          <HelpCircle className="size-4" />
        </button>
      </div>
    </div>
  );
}
