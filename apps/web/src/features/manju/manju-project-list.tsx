"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { Upload } from "lucide-react";
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
} from "@/features/canvas/icons/canvas-icons";
import { FolderArt } from "@/features/canvas/folder-art";
import { ProjectCover } from "@/features/canvas/project-cover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/shared/lib/api";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import {
  createManjuProject,
  draftFromProject,
  projectFromDto,
  updateManjuProject,
} from "./manju-api";
import { useManjuStore } from "./manju-store";
import { normalizeProject } from "./manju-types";
import { WorkspaceModeTabs } from "@/features/shell/workspace-mode-tabs";
import { writeWorkspaceMode } from "@/features/shell/workspace-nav";
import "@/features/canvas/project-library.css";
import "./manju-chrome.css";

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

type MoveTarget =
  | { kind: "project"; ids: string[] }
  | { kind: "folder"; id: string };

function formatEditedAt(value: string) {
  const d = dayjs(value);
  if (dayjs().diff(d, "day") > 60) return d.format("YYYY/M/D");
  return d.fromNow();
}

export function ManjuProjectList() {
  const router = useRouter();
  const upsertProject = useManjuStore((s) => s.upsertProject);
  const fileRef = useRef<HTMLInputElement>(null);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderTitle, setFolderTitle] = useState<string | null>(null);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [allFolders, setAllFolders] = useState<FolderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [multiSelect, setMultiSelect] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameKind, setRenameKind] = useState<"project" | "folder">("project");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  useEffect(() => {
    writeWorkspaceMode("manju");
  }, []);

  const load = useCallback(async (currentFolderId: string | null) => {
    const query = currentFolderId
      ? `?folderId=${encodeURIComponent(currentFolderId)}`
      : "";
    const [library, folderList] = await Promise.all([
      api<{
        folderId: string | null;
        folders: LibraryFolder[];
        projects: LibraryProject[];
      }>(`/manju/library${query}`),
      api<FolderOption[]>("/manju/folders"),
    ]);
    setFolders(library.folders);
    setProjects(library.projects);
    setAllFolders(folderList);
    const current = folderList.find((f) => f.id === currentFolderId);
    setFolderTitle(current?.title ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load(folderId)
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载项目失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
      const dto = await createManjuProject(
        `漫剧 ${dayjs().format("MM-DD HH:mm")}`,
        folderId,
      );
      upsertProject(projectFromDto(dto));
      router.push(`/manju/${dto.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function createFolder() {
    try {
      await api("/manju/folders", {
        method: "POST",
        body: { title: "新建合集", parentId: folderId },
      });
      toast.success("已创建合集");
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建合集失败");
    }
  }

  async function deleteProjects(ids: string[]) {
    const ok = await confirmDialog({
      title: ids.length > 1 ? `删除 ${ids.length} 个漫剧？` : "删除漫剧项目？",
      description: "删除后不可恢复。",
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api("/manju/projects/batch-delete", {
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
      title: "删除合集？",
      description: "合集内的项目会回到上一级，不会被删除。",
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/manju/folders/${id}`, { method: "DELETE" });
      toast.success("已删除合集");
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除合集失败");
    }
  }

  async function moveProjectsTo(ids: string[], targetFolderId: string | null) {
    try {
      await api("/manju/projects/batch-move", {
        method: "POST",
        body: { ids, folderId: targetFolderId },
      });
      toast.success("已移动");
      setMoveOpen(false);
      setMoveTarget(null);
      clearSelection();
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动失败");
    }
  }

  async function moveFolderTo(id: string, parentId: string | null) {
    try {
      await api(`/manju/folders/${id}`, {
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
        await api(`/manju/projects/${renameId}`, {
          method: "PATCH",
          body: { title },
        });
      } else {
        await api(`/manju/folders/${renameId}`, {
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

  function onProjectDragStart(e: DragEvent, projectId: string) {
    const ids =
      multiSelect && selected.has(projectId)
        ? Array.from(selected)
        : [projectId];
    setDraggingIds(ids);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-joyai-projects", JSON.stringify(ids));
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

  async function onImport(file: File) {
    try {
      const text = await file.text();
      const local = normalizeProject(JSON.parse(text) as unknown);
      if (!local) {
        toast.error("无法识别的项目文件");
        return;
      }
      const created = await createManjuProject(local.title, folderId);
      const draft = draftFromProject({
        ...local,
        id: created.id,
        title: created.title,
      });
      const dto = await updateManjuProject(created.id, {
        title: created.title,
        draft,
      });
      upsertProject(projectFromDto(dto));
      toast.success("已导入");
      router.push(`/manju/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
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
    !loading && filteredFolders.length === 0 && filteredProjects.length === 0;

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
            {folderId ? (
              <h1 className="joy-projects-title">{folderTitle ?? "合集"}</h1>
            ) : (
              <WorkspaceModeTabs active="manju" />
            )}
          </div>
          <div className="joy-projects-toolbar">
            {showSelectChrome ? (
              <>
                <button
                  type="button"
                  className="joy-projects-pill"
                  disabled={!selectedCount}
                  onClick={() => {
                    setMoveTarget({
                      kind: "project",
                      ids: Array.from(selected),
                    });
                    setMoveOpen(true);
                  }}
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
              新建合集
            </button>
            <button
              type="button"
              className="joy-projects-pill joy-projects-pill-ghost"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              导入
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onImport(file);
              }}
            />
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

        <div className="joy-projects-body">
        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            加载项目…
          </p>
        ) : (
          <div className="joy-projects-grid">
            <div className="joy-projects-item is-create">
              <button
                type="button"
                className="joy-projects-media is-create"
                disabled={creating}
                onClick={() => void createProject()}
              >
                <span className="joy-projects-create-mark" aria-hidden>
                  <CanvasIconPlus />
                </span>
                <span>新建漫剧</span>
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
                    <DropdownMenuContent align="end" className="joy-projects-menu">
                      <DropdownMenuItem
                        onClick={() => {
                          setMoveTarget({ kind: "folder", id: folder.id });
                          setMoveOpen(true);
                        }}
                      >
                        <CanvasIconFolder className="h-4 w-4" />
                        移动合集
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
                      router.push(`/manju/${project.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      if (showSelectChrome) {
                        toggleSelect(project.id);
                        return;
                      }
                      router.push(`/manju/${project.id}`);
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
                            onClick={() => {
                              void (async () => {
                                try {
                                  const created = await createManjuProject(
                                    `${project.title} 副本`,
                                    folderId,
                                  );
                                  const src =
                                    useManjuStore.getState().getProject(
                                      project.id,
                                    ) ??
                                    (await useManjuStore
                                      .getState()
                                      .loadProject(project.id)
                                      .catch(() => null));
                                  if (src) {
                                    const draft = draftFromProject({
                                      ...src,
                                      id: created.id,
                                      title: created.title,
                                    });
                                    const dto = await updateManjuProject(
                                      created.id,
                                      {
                                        title: created.title,
                                        draft,
                                      },
                                    );
                                    upsertProject(projectFromDto(dto));
                                  } else {
                                    upsertProject(projectFromDto(created));
                                  }
                                  toast.success("已复制项目");
                                  await load(folderId);
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error
                                      ? e.message
                                      : "复制失败",
                                  );
                                }
                              })();
                            }}
                          >
                            复制
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setMoveTarget({
                                kind: "project",
                                ids: [project.id],
                              });
                              setMoveOpen(true);
                            }}
                          >
                            <CanvasIconFolder className="h-4 w-4" />
                            移动至合集
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
        )}

        {!loading && empty ? (
          <p className="joy-projects-end">
            {q.trim()
              ? "没有匹配的项目"
              : folderId
                ? "合集是空的"
                : "还没有漫剧项目"}
          </p>
        ) : null}
        </div>
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
            <DialogTitle>移动至合集</DialogTitle>
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
                漫剧工作台（根目录）
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
                  还没有其他合集
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
