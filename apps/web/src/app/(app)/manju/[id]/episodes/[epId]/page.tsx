"use client";

import { use } from "react";
import { EpisodeStage } from "@/features/manju/studio/stages/episode-stage";

export default function ManjuEpisodePage({
  params,
}: {
  params: Promise<{ id: string; epId: string }>;
}) {
  const { id, epId } = use(params);
  return <EpisodeStage projectId={id} episodeId={epId} />;
}
