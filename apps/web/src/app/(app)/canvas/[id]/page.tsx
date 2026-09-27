"use client";

import { Suspense, use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CanvasBoard } from "@/features/canvas/board";
import { CanvasBootOverlay } from "@/features/canvas/canvas-boot-overlay";
import "@/features/canvas/canvas-chrome.css";

function CanvasProjectInner({ id }: { id: string }) {
  const searchParams = useSearchParams();

  const focusQuery = useMemo(
    () => ({
      nodeId: searchParams.get("nodeId"),
      jobId: searchParams.get("jobId"),
      assetId: searchParams.get("assetId"),
      tool: searchParams.get("tool"),
    }),
    [searchParams],
  );

  return <CanvasBoard projectId={id} focusQuery={focusQuery} />;
}

export default function CanvasProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="joy-canvas-board relative h-full overflow-hidden">
      <Suspense
        fallback={
          <div className="relative h-full min-h-[480px]">
            <CanvasBootOverlay visible />
          </div>
        }
      >
        <CanvasProjectInner id={id} />
      </Suspense>
    </div>
  );
}
