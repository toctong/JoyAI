"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { CanvasIconSearch } from "./icons/canvas-icons";
import { ProjectCover } from "./project-cover";

type ProjectRow = {
  id: string;
  title: string;
  coverUrl: string | null;
  updatedAt: string;
};

type Props = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function CanvasProjectSwitcher({
  projectId,
  open,
  onOpenChange,
  children,
}: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (!open) {
      setKeyword("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await api<ProjectRow[]>("/canvas/projects");
        if (!cancelled) setProjects(rows);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载画布失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((item) =>
      item.title.toLowerCase().includes(q),
    );
  }, [projects, keyword]);

  async function createProject() {
    if (creating) return;
    setCreating(true);
    try {
      const created = await api<{ id: string }>("/canvas/projects", {
        method: "POST",
        body: { title: "未命名项目" },
      });
      toast.success("已创建画布");
      onOpenChange(false);
      router.push(`/canvas/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  function selectProject(id: string) {
    if (id === projectId) {
      onOpenChange(false);
      return;
    }
    onOpenChange(false);
    router.push(`/canvas/${id}`);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="joy-canvas-chrome w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border p-0 shadow-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <label className="flex h-9 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <CanvasIconSearch className="size-3.5 shrink-0" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索画布"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </label>
        </div>

        <div className="max-h-[min(360px,50vh)] overflow-y-auto py-1.5">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {keyword.trim() ? "没有匹配的画布" : "还没有画布"}
            </p>
          ) : (
            filtered.map((item) => {
              const active = item.id === projectId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-muted/80",
                    active && "bg-muted/60",
                  )}
                  onClick={() => selectProject(item.id)}
                >
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                    <ProjectCover
                      url={item.coverUrl}
                      showVideoMark={false}
                      className="!size-full !rounded-full object-cover"
                      emptyClassName="flex size-full items-center justify-center rounded-full bg-muted [&>svg]:size-3.5 [&>svg]:opacity-50"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.title || "未命名项目"}
                  </span>
                  {active ? (
                    <Check
                      className="size-4 shrink-0 text-foreground"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <button
            type="button"
            disabled={creating}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            onClick={() => void createProject()}
          >
            <Plus className="size-4 opacity-70" />
            {creating ? "创建中…" : "新建画布"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
