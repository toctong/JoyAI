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
import { Download, FileJson } from "lucide-react";
import { useCanvasStore } from "./store";
import { useCanvasRightPanelStore } from "./right-panel-store";
import { CanvasColorTagBar } from "./canvas-color-tag-bar";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import {
  buildProjectExport,
  downloadJson,
  parseCanvasImport,
  readJsonFile,
  safeFilename,
} from "./lib/canvas-project-io";
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
  onFocusNode: (id: string) => void;
};

/** Top chrome — layout aligned to infinite-canvas (FrameRally theme). */
export function CanvasTopBar({
  projectId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImport,
  onOpenShortcuts,
  onFocusNode,
}: Props) {
  const router = useRouter();
  const title = useCanvasStore((s) => s.title);
  const dirty = useCanvasStore((s) => s.dirty);
  const setTitle = useCanvasStore((s) => s.setTitle);
  const getSnapshot = useCanvasStore((s) => s.getSnapshot);
  const rightMode = useCanvasRightPanelStore((s) => s.mode);
  const toggleRight = useCanvasRightPanelStore((s) => s.toggle);
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

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

  function exportProject() {
    const file = buildProjectExport({
      title,
      snapshot: getSnapshot(),
    });
    downloadJson(`${safeFilename(title)}.json`, file);
    toast.success("已导出项目 JSON");
  }

  async function importProjects(file: File) {
    try {
      const items = parseCanvasImport(await readJsonFile(file));
      let firstId = "";
      for (const item of items) {
        const created = await api<{ id: string }>("/canvas/projects", {
          method: "POST",
          body: {
            title: item.title,
            snapshot: item.snapshot,
          },
        });
        if (!firstId) firstId = created.id;
      }
      toast.success(
        items.length > 1 ? `已导入 ${items.length} 个项目` : "已导入项目",
      );
      if (firstId) router.push(`/canvas/${firstId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
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
              className="grid size-[length:var(--joy-canvas-tool-btn)] place-items-center rounded-full text-foreground/80 transition hover:bg-muted"
            >
              <CanvasIconMenu className="joy-canvas-tool-icon" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>画布</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push("/")}>
              <CanvasIconHome className="joy-canvas-tool-icon" />
              首页
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/canvas")}>
              <CanvasIconFolder className="joy-canvas-tool-icon" />
              项目列表
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onImport}>
              <CanvasIconUpload className="joy-canvas-tool-icon" />
              导入素材
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportProject}>
              <Download className="joy-canvas-tool-icon" />
              导出项目 JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => jsonImportRef.current?.click()}>
              <FileJson className="joy-canvas-tool-icon" />
              导入项目 JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenShortcuts}>
              <CanvasIconKeyboard className="joy-canvas-tool-icon" />
              快捷键
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canUndo} onClick={onUndo}>
              <CanvasIconUndo className="joy-canvas-tool-icon" />
              撤销
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canRedo} onClick={onRedo}>
              <CanvasIconRedo className="joy-canvas-tool-icon" />
              重做
              <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={jsonImportRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importProjects(file);
          }}
        />

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
        <CanvasColorTagBar onFocusNode={onFocusNode} />
        <div className="joy-canvas-chrome flex items-center gap-0.5 rounded-xl p-1">
          <button
            type="button"
            data-canvas-right-toggle
            title="搜索节点"
            aria-label="搜索节点"
            aria-pressed={rightMode === "nodes"}
            onClick={() => toggleRight("nodes")}
            className={cn(
              "joy-canvas-chrome-btn grid size-[length:var(--joy-canvas-tool-btn)] place-items-center rounded-lg",
              rightMode === "nodes" && "is-active",
            )}
          >
            <CanvasIconSearch className="joy-canvas-tool-icon" />
          </button>
          <button
            type="button"
            data-canvas-right-toggle
            title="生成历史"
            aria-label="生成历史"
            aria-pressed={rightMode === "history"}
            onClick={() => toggleRight("history")}
            className={cn(
              "joy-canvas-chrome-btn grid size-[length:var(--joy-canvas-tool-btn)] place-items-center rounded-lg",
              rightMode === "history" && "is-active",
            )}
          >
            <CanvasIconHistory className="joy-canvas-tool-icon" />
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
          className="grid size-[length:var(--joy-canvas-tool-btn)] place-items-center rounded-full text-foreground/80 transition hover:bg-muted"
        >
          <CanvasIconShortcuts className="joy-canvas-tool-icon" />
        </button>
      </div>
    </div>
  );
}
