"use client";

import { use } from "react";
import { PreviewStage } from "@/features/manju/studio/stages/preview-stage";

export default function ManjuPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <PreviewStage projectId={id} />;
}
