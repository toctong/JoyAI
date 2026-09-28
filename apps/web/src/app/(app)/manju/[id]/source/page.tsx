"use client";

import { use } from "react";
import { SourceStage } from "@/features/manju/studio/stages/source-stage";

export default function ManjuSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SourceStage projectId={id} />;
}
