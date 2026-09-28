"use client";

import { use } from "react";
import { LoreStage } from "@/features/manju/studio/stages/lore-stage";

export default function ManjuCharactersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <LoreStage projectId={id} lockedKind="character" />;
}
