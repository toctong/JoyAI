"use client";

import {
  CanvasIconCloudCheck,
  CanvasIconCloudUpload,
  CanvasIconFolder,
  CanvasIconHistory,
  CanvasIconHome,
  CanvasIconKeyboard,
  CanvasIconRedo,
  CanvasIconSearch,
  CanvasIconUndo,
  CanvasIconUpload,
} from "./icons/canvas-icons";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  FileJson,
} from "lucide-react";
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
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { CanvasProjectSwitcher } from "./canvas-project-switcher";

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

/** Top chrome — left/right capsules aligned to Jimeng-like canvas chrome. */
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
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const clickTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (clickTimerRef.current != null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

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

  function openSwitcher() {
    if (editing) return;
    setSwitcherOpen(true);
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-top pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 px-3"
    >
      <div className="pointer-events-auto joy-canvas-top-cluster">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="菜单"
              aria-label="菜单"
              className="joy-canvas-top-seg joy-canvas-top-brand"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={JOYAI_BRAND.logo}
                alt=""
                className="size-5 object-contain"
                draggable={false}
              />
              <ChevronDown className="size-3 opacity-55" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>画布</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push("/inspire")}>
              <CanvasIconHome className="joy-canvas-tool-icon" />
              返回工作空间
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

        <span className="joy-canvas-top-sep" aria-hidden />

        <div ref={titleWrapRef} className="joy-canvas-top-title">
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
              className="joy-canvas-top-title-input"
            />
          ) : (
            <CanvasProjectSwitcher
              projectId={projectId}
              open={switcherOpen}
              onOpenChange={setSwitcherOpen}
            >
              <button
                type="button"
                className="joy-canvas-top-title-btn"
                title="点击切换画布 · 双击重命名"
                aria-expanded={switcherOpen}
                onClick={() => {
                  if (clickTimerRef.current != null) {
                    window.clearTimeout(clickTimerRef.current);
                  }
                  clickTimerRef.current = window.setTimeout(() => {
                    clickTimerRef.current = null;
                    openSwitcher();
                  }, 220);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (clickTimerRef.current != null) {
                    window.clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = null;
                  }
                  setSwitcherOpen(false);
                  setEditing(true);
                }}
              >
                <span className="joy-canvas-top-title-text">
                  {title || "未命名项目"}
                </span>
                <ChevronDown
                  className={cn(
                    "size-3 shrink-0 opacity-55 transition-transform",
                    switcherOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </CanvasProjectSwitcher>
          )}
        </div>

        <span className="joy-canvas-top-sep" aria-hidden />

        <span
          className={cn(
            "joy-canvas-top-status",
            dirty ? "is-dirty" : "is-saved",
          )}
          title={dirty ? "有未保存更改" : "已保存到云端"}
          aria-label={dirty ? "有未保存更改" : "已保存到云端"}
        >
          {dirty ? (
            <CanvasIconCloudUpload className="joy-canvas-tool-icon" />
          ) : (
            <CanvasIconCloudCheck className="joy-canvas-tool-icon" />
          )}
        </span>

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
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <CanvasColorTagBar onFocusNode={onFocusNode} />

        <div className="joy-canvas-top-cluster">
          <button
            type="button"
            data-canvas-right-toggle
            title="搜索节点"
            aria-label="搜索节点"
            aria-pressed={rightMode === "nodes"}
            onClick={() => toggleRight("nodes")}
            className={cn(
              "joy-canvas-top-seg",
              rightMode === "nodes" && "is-on",
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
              "joy-canvas-top-seg",
              rightMode === "history" && "is-on",
            )}
          >
            <CanvasIconHistory className="joy-canvas-tool-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}
