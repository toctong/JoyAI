"use client";

import { use } from "react";
import { LoreStage } from "@/features/manju/studio/stages/lore-stage";

export default function ManjuScenesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <LoreStage projectId={id} lockedKind="scene" />;
}
