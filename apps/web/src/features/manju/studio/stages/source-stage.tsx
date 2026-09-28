"use client";

import { ScriptStep } from "../../steps/script-step";
import { useManjuStore } from "../../manju-store";

export function SourceStage({ projectId }: { projectId: string }) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  if (!project) return null;
  return <ScriptStep project={project} />;
}
