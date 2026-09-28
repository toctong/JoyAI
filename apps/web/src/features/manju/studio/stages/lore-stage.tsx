"use client";

import { AssetsStep } from "../../steps/assets-step";
import { useManjuStore } from "../../manju-store";
import type { ManjuAssetDraft } from "../../manju-types";

export function LoreStage({
  projectId,
  lockedKind,
}: {
  projectId: string;
  lockedKind: ManjuAssetDraft["kind"];
}) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  if (!project) return null;
  return <AssetsStep project={project} lockedKind={lockedKind} />;
}
