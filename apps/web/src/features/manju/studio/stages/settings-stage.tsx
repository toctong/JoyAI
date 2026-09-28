"use client";

import { VideoSettingsStep } from "../../steps/video-settings-step";
import { useManjuStore } from "../../manju-store";

export function SettingsStage({ projectId }: { projectId: string }) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  if (!project) return null;
  return <VideoSettingsStep project={project} />;
}
