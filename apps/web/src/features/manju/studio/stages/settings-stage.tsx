"use client";

import { VideoSettingsStep } from "../../steps/video-settings-step";
import { useManjuProject } from "../../manju-store";

export function SettingsStage({ projectId }: { projectId: string }) {
  const project = useManjuProject(projectId);
  if (!project) return null;
  return <VideoSettingsStep project={project} />;
}
