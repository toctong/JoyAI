"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Copy, Plus, Trash2, Upload } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { MANJU_STEPS } from "./config/manju-steps";
import { useManjuStore } from "./manju-store";
import {
  createManjuProject,
  draftFromProject,
  projectFromDto,
  updateManjuProject,
} from "./manju-api";
import { normalizeProject } from "./manju-types";
import "./manju-chrome.css";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

function resumeStep(p: {
  completedSteps: string[];
}): number {
  const done = new Set(p.completedSteps);
  const next = MANJU_STEPS.find((s) => !done.has(s.id));
  return next?.index ?? 6;
}

export function ManjuProjectList() {
  const router = useRouter();
  const listMeta = useManjuStore((s) => s.listMeta);
  const projects = useManjuStore((s) => s.projects);
  const loadList = useManjuStore((s) => s.loadList);
  const createProject = useManjuStore((s) => s.createProject);
  const deleteProject = useManjuStore((s) => s.deleteProject);
  const duplicateProject = useManjuStore((s) => s.duplicateProject);
  const upsertProject = useManjuStore((s) => s.upsertProject);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadList();
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载项目失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  const onCreate = async () => {
    try {
      const project = await createProject(
        `漫剧 ${dayjs().format("MM-DD HH:mm")}`,
      );
      router.push(`/manju/${project.id}?step=1`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
  };

  const onDelete = async (id: string, title: string) => {
    const ok = await confirmDialog({
      title: "删除漫剧项目？",
      description: `「${title}」将从服务器删除，不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteProject(id);
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const local = normalizeProject(raw);
      if (!local) {
        toast.error("无法识别的项目文件");
        return;
      }
      const created = await createManjuProject(local.title);
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
      await loadList();
      toast.success("已导入到服务器");
      router.push(`/manju/${created.id}?step=1`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
  };

  const cards = listMeta.map((meta) => {
    const full = projects.find((p) => p.id === meta.id);
    return {
      ...meta,
      shots: full?.shots.length ?? 0,
      completedSteps: full?.completedSteps ?? [],
      coverUrl:
        meta.coverUrl ??
        full?.shots.find((s) => s.storyboardImageUrl)?.storyboardImageUrl ??
        full?.assets.find((a) => a.imageUrl)?.imageUrl ??
        null,
    };
  });

  return (
    <div className="manju-list">
      <div className="manju-list__head">
        <div>
          <h1 className="manju-list__title">漫剧工作台</h1>
          <p className="manju-list__sub">
            从文本到角色，从分镜到视频 · 项目已同步服务器
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            导入
          </Button>
          <Button onClick={() => void onCreate()} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新建漫剧
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          加载项目…
        </div>
      ) : cards.length === 0 ? (
        <div className="manju-list__empty">
          <Clapperboard className="h-10 w-10 opacity-40" />
          <div>
            <p className="font-medium text-foreground">还没有漫剧项目</p>
            <p className="mt-1 text-sm">
              创建后进入六步流水线：剧本 → 设定 → 资产 → 分镜 → 视频 → 预览
            </p>
          </div>
          <Button
            onClick={() => void onCreate()}
            variant="secondary"
            className="mt-2"
          >
            <Plus className="h-4 w-4" />
            创建第一个项目
          </Button>
        </div>
      ) : (
        <div className="manju-list__grid">
          {cards.map((p) => {
            const step = resumeStep(p);
            return (
              <div key={p.id} className="manju-list__card group relative">
                <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="复制"
                    onClick={(e) => {
                      e.stopPropagation();
                      void duplicateProject(p.id)
                        .then((copy) => {
                          if (copy) toast.success("已复制项目");
                        })
                        .catch((err) =>
                          toast.error(
                            err instanceof Error ? err.message : "复制失败",
                          ),
                        );
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDelete(p.id, p.title);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  className="flex flex-col gap-3 text-left outline-none"
                  onClick={() =>
                    router.push(`/manju/${p.id}?step=${step}`)
                  }
                >
                  <div className="manju-list__card-cover overflow-hidden">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" />
                    ) : (
                      <Clapperboard className="h-8 w-8" />
                    )}
                  </div>
                  <div>
                    <div className="manju-list__card-title">{p.title}</div>
                    <div className="manju-list__card-meta mt-1">
                      {dayjs(p.updatedAt).fromNow()}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
