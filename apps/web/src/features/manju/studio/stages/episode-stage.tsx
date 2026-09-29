"use client";

import { EpisodeProduceWorkspace } from "../episode/episode-produce-workspace";

/** 制作视频新开页：携带 episodeId，高保真分镜制作台 */
export function EpisodeStage({
  projectId,
  episodeId,
}: {
  projectId: string;
  episodeId: string;
}) {
  return (
    <EpisodeProduceWorkspace projectId={projectId} episodeId={episodeId} />
  );
}
