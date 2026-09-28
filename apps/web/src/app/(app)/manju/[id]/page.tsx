"use client";

import { use } from "react";
import { OverviewStage } from "@/features/manju/studio/stages/overview-stage";

export default function ManjuOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <OverviewStage projectId={id} />;
}
