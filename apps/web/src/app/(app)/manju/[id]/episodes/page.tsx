"use client";

import { use } from "react";
import { EpisodesIndexStage } from "@/features/manju/studio/stages/episodes-index-stage";

export default function ManjuEpisodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EpisodesIndexStage projectId={id} />;
}
