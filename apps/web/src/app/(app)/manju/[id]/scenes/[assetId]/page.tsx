"use client";

import { use } from "react";
import { AssetDetailStage } from "@/features/manju/studio/stages/asset-detail-stage";

export default function ManjuSceneDetailPage({
  params,
}: {
  params: Promise<{ id: string; assetId: string }>;
}) {
  const { id, assetId } = use(params);
  return (
    <AssetDetailStage projectId={id} assetId={assetId} lockedKind="scene" />
  );
}
