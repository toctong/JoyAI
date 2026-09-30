"use client";

import { useMemo, useState } from "react";
import { PreviewStep } from "../../steps/preview-step";
import { useManjuStore } from "../../manju-store";
import { ManjuExportDialog } from "../manju-export-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_EPISODES = "__all__";

export function PreviewStage({
  projectId,
  episodeId = null,
}: {
  projectId: string;
  episodeId?: string | null;
}) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const [filterEpId, setFilterEpId] = useState<string>(
    episodeId ?? ALL_EPISODES,
  );

  const videoCounts = useMemo(() => {
    if (!project) return { all: 0, byEp: new Map<string, number>() };
    const byEp = new Map<string, number>();
    let all = 0;
    for (const s of project.shots) {
      if (!s.videoUrl) continue;
      all += 1;
      if (s.episodeId) {
        byEp.set(s.episodeId, (byEp.get(s.episodeId) ?? 0) + 1);
      }
    }
    return { all, byEp };
  }, [project]);

  if (!project) return null;

  const activeEpisodeId =
    filterEpId === ALL_EPISODES ? null : filterEpId;

  return (
    <div className="manju-preview-stage">
      <div className="manju-preview-stage__toolbar">
        <div className="manju-preview-stage__filters">
          <Select
            value={filterEpId}
            onValueChange={(v) => setFilterEpId(v ?? ALL_EPISODES)}
          >
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder="选择分集" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_EPISODES}>
                全部已出片（{videoCounts.all}）
              </SelectItem>
              {project.episodes.map((ep, i) => {
                const n = videoCounts.byEp.get(ep.id) ?? 0;
                return (
                  <SelectItem key={ep.id} value={ep.id}>
                    第{i + 1}集 · {ep.title.trim() || "未命名"}（{n}）
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <ManjuExportDialog project={project} episodeId={activeEpisodeId} />
      </div>
      <PreviewStep project={project} episodeId={activeEpisodeId} />
    </div>
  );
}
