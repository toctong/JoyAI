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

function formatUpdatedAt(value: string) {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(t).toLocaleDateString();
}

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
        sideOffset={10}
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className={cn(
          "joy-canvas-project-switcher w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl",
          "bg-popover/95 text-popover-foreground backdrop-blur-xl",
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border/60 px-3 pb-3 pt-3">
          <p className="mb-2 px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
            切换画布
          </p>
          <label className="flex h-9 items-center gap-2 rounded-xl border border-border/50 bg-muted/70 px-2.5 text-muted-foreground transition focus-within:border-border focus-within:bg-muted">
            <CanvasIconSearch className="size-3.5 shrink-0 opacity-70" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索画布名称…"
              className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/80"
              autoFocus
            />
          </label>
        </div>

        <div className="max-h-[min(340px,48vh)] overflow-y-auto px-1.5 py-1.5">
          {loading ? (
            <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              加载中…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              {keyword.trim() ? "没有匹配的画布" : "还没有画布"}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((item) => {
                const active = item.id === projectId;
                const updated = formatUpdatedAt(item.updatedAt);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition",
                        active
                          ? "bg-muted shadow-sm"
                          : "hover:bg-muted/70",
                      )}
                      onClick={() => selectProject(item.id)}
                    >
                      <span
                        className={cn(
                          "relative size-10 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/60",
                          active && "ring-foreground/20",
                        )}
                      >
                        <ProjectCover
                          url={item.coverUrl}
                          showVideoMark={false}
                          className="!size-full !rounded-xl object-cover"
                          emptyClassName="flex size-full items-center justify-center rounded-xl bg-muted [&>svg]:size-4 [&>svg]:opacity-45"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium leading-snug text-foreground">
                          {item.title || "未命名项目"}
                        </span>
                        {updated ? (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {updated}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
                          <Check className="size-3.5" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span className="size-6 shrink-0" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border/60 p-2">
          <button
            type="button"
            disabled={creating}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
              "bg-foreground text-background hover:opacity-90",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
            onClick={() => void createProject()}
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            {creating ? "创建中…" : "新建画布"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
