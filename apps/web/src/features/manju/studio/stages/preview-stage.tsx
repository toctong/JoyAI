"use client";

import { PreviewStep } from "../../steps/preview-step";
import { useManjuStore } from "../../manju-store";
import { ManjuExportDialog } from "../manju-export-dialog";

export function PreviewStage({
  projectId,
  episodeId = null,
}: {
  projectId: string;
  episodeId?: string | null;
}) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  if (!project) return null;
  return (
    <div className="manju-preview-stage">
      <div className="manju-preview-stage__toolbar">
        <ManjuExportDialog project={project} episodeId={episodeId} />
      </div>
      <PreviewStep project={project} episodeId={episodeId} />
    </div>
  );
}
