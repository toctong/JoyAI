"use client";

import { ScriptStep } from "../../steps/script-step";
import { useManjuProject } from "../../manju-store";

export function SourceStage({ projectId }: { projectId: string }) {
  const project = useManjuProject(projectId);
  if (!project) return null;
  return <ScriptStep project={project} />;
}
