"use client";

import {
  CanvasIconCheck,
  CanvasIconChevronLeft,
  CanvasIconFolder,
  CanvasIconFolderPlus,
  CanvasIconMore,
  CanvasIconMove,
  CanvasIconPlus,
  CanvasIconSearch,
  CanvasIconTrash,
} from "./icons/canvas-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { FolderArt } from "@/features/canvas/folder-art";
import { ProjectCover } from "@/features/canvas/project-cover";
import {
  buildBundleExport,
  buildProjectExport,
  downloadJson,
  parseCanvasImport,
  readJsonFile,
  safeFilename,
} from "@/features/canvas/lib/canvas-project-io";
import { normalizeCanvasSnapshot, type CanvasSnapshot } from "@joyai/shared";
import "./project-library.css";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

type LibraryFolder = {
  id: string;
  title: string;
  parentId: string | null;
  updatedAt: string;
  coverUrls: string[];
};

type LibraryProject = {
  id: string;
  title: string;
  coverUrl: string | null;
  folderId: string | null;
  updatedAt: string;
};

type FolderOption = {
  id: string;
  title: string;
  parentId: string | null;
};

type LibraryPayload = {
  folderId: string | null;
  folders: LibraryFolder[];
  projects: LibraryProject[];
};

type MoveTarget =
  | { kind: "project"; ids: string[] }
  | { kind: "folder"; id: string };

function formatEditedAt(value: string) {
  const d = dayjs(value);
  if (dayjs().diff(d, "day") > 60) return d.format("YYYY/M/D");
  return d.fromNow();
}

export function ProjectLibrary() {
  const router = useRouter();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderTitle, setFolderTitle] = useState<string | null>(null);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [allFolders, setAllFolders] = useState<FolderOption[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameKind, setRenameKind] = useState<"project" | "folder">("project");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  const load = useCallback(async (currentFolderId: string | null) => {
    setLoading(true);
    try {
      const query =
        currentFolderId != null
          ? `?folderId=${encodeURIComponent(currentFolderId)}`
          : "";
      const [library, folderList] = await Promise.all([
        api<LibraryPayload>(`/canvas/library${query}`),
        api<FolderOption[]>("/canvas/folders"),
      ]);
      setFolders(library.folders);
      setProjects(library.projects);
      setAllFolders(folderList);
      if (currentFolderId) {
        const current = folderList.find((f) => f.id === currentFolderId);
        setFolderTitle(current?.title ?? "文件夹");
      } else {
        setFolderTitle(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(folderId);
  }, [folderId, load]);

  const filteredFolders = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return folders;
    return folders.filter((f) => f.title.toLowerCase().includes(key));
  }, [folders, q]);

  const filteredProjects = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(key));
  }, [projects, q]);

  function clearSelection() {
    setSelected(new Set());
    setMultiSelect(false);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createProject() {
    setCreating(true);
    try {
      const project = await api<LibraryProject>("/canvas/projects", {
        method: "POST",
        body: { title: "未命名项目", folderId },
      });
      toast.success("已创建画布项目");
      router.push(`/canvas/${project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function createFolder() {
    try {
      await api("/canvas/folders", {
        method: "POST",
        body: { title: "新建文件夹", parentId: folderId },
      });
      toast.success("已创建文件夹");
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建文件夹失败");
    }
  }

  async function exportProjects(ids: string[]) {
    try {
      const payloads: Array<{
        title: string;
        folderId?: string | null;
        snapshot: CanvasSnapshot;
      }> = [];
      for (const id of ids) {
        const project = await api<{
          title: string;
          folderId: string | null;
          snapshot: unknown;
        }>(`/canvas/projects/${id}`);
        const snapshot = normalizeCanvasSnapshot(project.snapshot);
        if (!snapshot) continue;
        payloads.push({
          title: project.title,
          folderId: project.folderId,
          snapshot,
        });
      }
      if (!payloads.length) {
        toast.error("没有可导出的快照");
        return;
      }
      if (payloads.length === 1) {
        const only = payloads[0]!;
        downloadJson(
          `${safeFilename(only.title)}.json`,
          buildProjectExport(only),
        );
      } else {
        downloadJson(
          `framerally-canvas-bundle-${payloads.length}.json`,
          buildBundleExport(payloads),
        );
      }
      toast.success(
        payloads.length > 1 ? `已导出 ${payloads.length} 个项目` : "已导出项目",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    }
  }

  async function importFromFile(file: File) {
    try {
      const items = parseCanvasImport(await readJsonFile(file));
      let firstId = "";
      for (const item of items) {
        const created = await api<{ id: string }>("/canvas/projects", {
          method: "POST",
          body: {
            title: item.title,
            folderId,
            snapshot: item.snapshot,
          },
        });
        if (!firstId) firstId = created.id;
      }
      toast.success(
        items.length > 1 ? `已导入 ${items.length} 个项目` : "已导入项目",
      );
      await load(folderId);
      if (items.length === 1 && firstId) {
        router.push(`/canvas/${firstId}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
  }

  async function deleteProjects(ids: string[]) {
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: `删除 ${ids.length} 个项目？`,
      description: "此操作不可恢复。",
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api("/canvas/projects/batch-delete", {
        method: "POST",
        body: { ids },
      });
      toast.success("已删除");
      clearSelection();
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function deleteFolder(id: string) {
    const ok = await confirmDialog({
      title: "删除文件夹？",
      description: "删除后，其中的项目会移回上一级。",
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/canvas/folders/${id}`, { method: "DELETE" });
      toast.success("已删除文件夹");
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function moveProjectsTo(ids: string[], targetFolderId: string | null) {
    try {
      await api("/canvas/projects/batch-move", {
        method: "POST",
        body: { ids, folderId: targetFolderId },
      });
      toast.success("已移动");
      clearSelection();
      setMoveOpen(false);
      setMoveTarget(null);
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动失败");
    }
  }

  async function moveFolderTo(id: string, parentId: string | null) {
    try {
      await api(`/canvas/folders/${id}`, {
        method: "PATCH",
        body: { parentId },
      });
      toast.success("已移动");
      setMoveOpen(false);
      setMoveTarget(null);
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动失败");
    }
  }

  function openRename(kind: "project" | "folder", id: string, title: string) {
    setRenameKind(kind);
    setRenameId(id);
    setRenameValue(title);
    setRenameOpen(true);
  }

  async function submitRename() {
    if (!renameId) return;
    const title = renameValue.trim();
    if (!title) {
      toast.error("名称不能为空");
      return;
    }
    try {
      if (renameKind === "project") {
        await api(`/canvas/projects/${renameId}`, {
          method: "PATCH",
          body: { title },
        });
      } else {
        await api(`/canvas/folders/${renameId}`, {
          method: "PATCH",
          body: { title },
        });
      }
      setRenameOpen(false);
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
    }
  }

  function openMoveProjects(ids: string[]) {
    setMoveTarget({ kind: "project", ids });
    setMoveOpen(true);
  }

  function openMoveFolder(id: string) {
    setMoveTarget({ kind: "folder", id });
    setMoveOpen(true);
  }

  function onProjectDragStart(e: DragEvent, projectId: string) {
    const ids =
      multiSelect && selected.has(projectId)
        ? Array.from(selected)
        : [projectId];
    setDraggingIds(ids);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/x-joyai-projects",
      JSON.stringify(ids),
    );
    e.dataTransfer.setData("text/plain", ids.join(","));
  }

  function onProjectDragEnd() {
    setDraggingIds([]);
    setDropTargetId(null);
  }

  function onFolderDragOver(e: DragEvent, targetId: string) {
    if (!draggingIds.length) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
  }

  async function onFolderDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    setDropTargetId(null);
    let ids = draggingIds;
    try {
      const raw = e.dataTransfer.getData("application/x-joyai-projects");
      if (raw) ids = JSON.parse(raw) as string[];
    } catch {
      /* ignore */
    }
    setDraggingIds([]);
    if (!ids.length) return;
    await moveProjectsTo(ids, targetId);
  }

  const moveFolderOptions = useMemo(() => {
    if (!moveTarget) return [];
    if (moveTarget.kind === "folder") {
      return allFolders.filter((f) => f.id !== moveTarget.id);
    }
    return allFolders;
  }, [allFolders, moveTarget]);

  const selectedCount = selected.size;
  const showSelectChrome = multiSelect || selectedCount > 0;
  const empty =
    !loading &&
    filteredFolders.length === 0 &&
    filteredProjects.length === 0;

  return (
    <div className="joy-projects">
      <div className="joy-projects-inner">
        <header className="joy-projects-header">
          <div className="joy-projects-title-row">
            {folderId ? (
              <button
                type="button"
                className="joy-projects-back"
                aria-label="返回上级"
                onClick={() => {
                  clearSelection();
                  const current = allFolders.find((f) => f.id === folderId);
                  setFolderId(current?.parentId ?? null);
                }}
              >
                <CanvasIconChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            <h1 className="joy-projects-title">
              {folderTitle ?? "我的项目"}
            </h1>
          </div>

          <div className="joy-projects-toolbar">
            {showSelectChrome ? (
              <>
                <button
                  type="button"
                  className="joy-projects-pill"
                  disabled={!selectedCount}
                  onClick={() => openMoveProjects(Array.from(selected))}
                >
                  <CanvasIconMove className="h-3.5 w-3.5" />
                  移动至
                </button>
                <button
                  type="button"
                  className="joy-projects-pill"
                  disabled={!selectedCount}
                  onClick={() => void deleteProjects(Array.from(selected))}
                >
                  <CanvasIconTrash className="h-3.5 w-3.5" />
                  删除
                </button>
                <button
                  type="button"
                  className="joy-projects-pill joy-projects-pill-ghost"
                  onClick={clearSelection}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                className="joy-projects-pill"
                onClick={() => setMultiSelect(true)}
              >
                多选
              </button>
            )}

            <button
              type="button"
              className="joy-projects-pill"
              onClick={() => void createFolder()}
            >
              <CanvasIconFolderPlus className="h-3.5 w-3.5" />
              新建文件夹
            </button>

            <button
              type="button"
              className="joy-projects-pill"
              disabled={!selectedCount && !projects.length}
              onClick={() =>
                void exportProjects(
                  selectedCount
                    ? Array.from(selected)
                    : projects.map((p) => p.id),
                )
              }
              title={
                selectedCount
                  ? "导出选中项目 JSON"
                  : "导出当前文件夹全部项目 JSON"
              }
            >
              导出 JSON
            </button>

            <label className="joy-projects-pill cursor-pointer">
              导入 JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void importFromFile(file);
                }}
              />
            </label>

            <label className="joy-projects-search">
              <CanvasIconSearch />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索项目"
              />
            </label>
          </div>
        </header>

        <div className="joy-projects-grid">
          <div className="joy-projects-item is-create">
            <button
              type="button"
              className="joy-projects-media is-create"
              onClick={() => void createProject()}
              disabled={creating}
            >
              <span className="joy-projects-create-mark" aria-hidden>
                <CanvasIconPlus />
              </span>
              <span>新建项目</span>
            </button>
          </div>

          {filteredFolders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                "joy-projects-item",
                dropTargetId === folder.id && "is-drop",
              )}
              onDragOver={(e) => onFolderDragOver(e, folder.id)}
              onDragLeave={() =>
                setDropTargetId((id) => (id === folder.id ? null : id))
              }
              onDrop={(e) => void onFolderDrop(e, folder.id)}
            >
              <div className="joy-projects-media">
                <FolderArt covers={folder.coverUrls} />
              </div>
              <div
                role="button"
                tabIndex={0}
                className="joy-projects-hit"
                onClick={() => {
                  if (multiSelect) return;
                  clearSelection();
                  setFolderId(folder.id);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  if (multiSelect) return;
                  clearSelection();
                  setFolderId(folder.id);
                }}
              />
              <div className="joy-projects-meta">
                <div className="joy-projects-meta-text">
                  <p className="joy-projects-name">{folder.title}</p>
                  <p className="joy-projects-sub">
                    {formatEditedAt(folder.updatedAt)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="joy-projects-more"
                      aria-label="更多"
                    >
                      <CanvasIconMore className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="joy-projects-menu"
                  >
                    <DropdownMenuItem
                      onClick={() => openMoveFolder(folder.id)}
                    >
                      <CanvasIconFolder className="h-4 w-4" />
                      移动至文件夹
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        openRename("folder", folder.id, folder.title)
                      }
                    >
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => void deleteFolder(folder.id)}
                    >
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}

          {filteredProjects.map((project) => {
            const checked = selected.has(project.id);
            const dragging = draggingIds.includes(project.id);
            return (
              <div
                key={project.id}
                className={cn(
                  "joy-projects-item",
                  checked && "is-selected",
                  dragging && "is-dragging",
                )}
                draggable={!multiSelect || checked || !showSelectChrome}
                onDragStart={(e) => onProjectDragStart(e, project.id)}
                onDragEnd={onProjectDragEnd}
              >
                <div className="joy-projects-media">
                  <ProjectCover url={project.coverUrl} />
                  {showSelectChrome ? (
                    <span
                      className={cn(
                        "joy-projects-check",
                        checked && "is-on",
                      )}
                    >
                      <CanvasIconCheck className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  className="joy-projects-hit"
                  onClick={() => {
                    if (showSelectChrome) {
                      toggleSelect(project.id);
                      return;
                    }
                    router.push(`/canvas/${project.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    if (showSelectChrome) {
                      toggleSelect(project.id);
                      return;
                    }
                    router.push(`/canvas/${project.id}`);
                  }}
                />
                <div className="joy-projects-meta">
                  <div className="joy-projects-meta-text">
                    <p className="joy-projects-name">{project.title}</p>
                    <p className="joy-projects-sub">
                      {formatEditedAt(project.updatedAt)}
                    </p>
                  </div>
                  {!showSelectChrome ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="joy-projects-more"
                          aria-label="更多"
                        >
                          <CanvasIconMore className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="joy-projects-menu"
                      >
                        <DropdownMenuItem
                          onClick={() => openMoveProjects([project.id])}
                        >
                          <CanvasIconFolder className="h-4 w-4" />
                          移动至文件夹
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            openRename("project", project.id, project.title)
                          }
                        >
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => void deleteProjects([project.id])}
                        >
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <p className="joy-projects-end">
          {empty
            ? q.trim()
              ? "没有匹配的项目"
              : folderId
                ? "文件夹是空的，拖拽项目进来或新建"
                : "还没有画布项目，点击新建开始"
            : "没有更多项目了"}
        </p>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void submitRename()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>移动至文件夹</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-72" type="hover">
            <div className="space-y-1 pr-3">
            <button
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent"
              onClick={() => {
                if (!moveTarget) return;
                if (moveTarget.kind === "project") {
                  void moveProjectsTo(moveTarget.ids, null);
                } else {
                  void moveFolderTo(moveTarget.id, null);
                }
              }}
            >
              我的项目（根目录）
            </button>
            {moveFolderOptions.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent"
                onClick={() => {
                  if (!moveTarget) return;
                  if (moveTarget.kind === "project") {
                    void moveProjectsTo(moveTarget.ids, folder.id);
                  } else {
                    void moveFolderTo(moveTarget.id, folder.id);
                  }
                }}
              >
                {folder.title}
              </button>
            ))}
            {moveFolderOptions.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                还没有其他文件夹
              </p>
            ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
