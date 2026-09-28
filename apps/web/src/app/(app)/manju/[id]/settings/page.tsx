"use client";

import { use } from "react";
import { SettingsStage } from "@/features/manju/studio/stages/settings-stage";

export default function ManjuSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SettingsStage projectId={id} />;
}
