"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useManjuStore } from "../../manju-store";
import { manjuStudioHref } from "../manju-studio-routes";
import type { ManjuEpisodeDraft } from "../../manju-types";

function createEpisode(index: number): ManjuEpisodeDraft {
  return {
    id: crypto.randomUUID(),
    title: `第${index}集`,
    summary: "",
    hook: "",
    sourceText: "",
  };
}

export function EpisodesIndexStage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateProject = useManjuStore((s) => s.updateProject);

  useEffect(() => {
    if (!project) return;
    if (project.episodes.length === 1) {
      router.replace(
        manjuStudioHref(projectId, "episode", {
          epId: project.episodes[0]!.id,
        }),
      );
    }
  }, [project, projectId, router]);

  if (!project) return null;

  if (project.episodes.length === 0) {
    return (
      <div className="manju-episodes-index__empty">
        <p>还没有分集</p>
        <p className="text-sm">可先在剧本页规划分集，或手动创建第一集。</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              router.push(manjuStudioHref(projectId, "source"))
            }
          >
            去剧本
          </Button>
          <Button
            onClick={() => {
              const ep = createEpisode(1);
              updateProject(projectId, { episodes: [ep] });
              router.push(
                manjuStudioHref(projectId, "episode", { epId: ep.id }),
              );
            }}
          >
            创建第一集
          </Button>
        </div>
      </div>
    );
  }

  if (project.episodes.length === 1) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        正在进入分集…
      </div>
    );
  }

  return (
    <div className="manju-episodes-index">
      <h1 className="manju-overview__title">分集列表</h1>
      <ul className="manju-episodes-index__list">
        {project.episodes.map((ep, i) => {
          const shots = project.shots.filter((s) => s.episodeId === ep.id);
          return (
            <li key={ep.id}>
              <Link
                href={manjuStudioHref(projectId, "episode", { epId: ep.id })}
                className="manju-episodes-index__card"
              >
                <span className="manju-overview__card-label">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="manju-overview__card-value">
                  {ep.title || `第${i + 1}集`}
                </span>
                <span className="manju-overview__card-hint">
                  {shots.length} 个镜头 ·{" "}
                  {shots.filter((s) => s.videoUrl).length} 条视频
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Button
        variant="outline"
        className="w-fit"
        onClick={() => {
          const ep = createEpisode(project.episodes.length + 1);
          updateProject(projectId, {
            episodes: [...project.episodes, ep],
          });
          router.push(manjuStudioHref(projectId, "episode", { epId: ep.id }));
        }}
      >
        新建分集
      </Button>
    </div>
  );
}
