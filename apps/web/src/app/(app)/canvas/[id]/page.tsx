"use client";

import { Suspense, use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CanvasBoard } from "@/features/canvas/board";

function CanvasProjectInner({ id }: { id: string }) {
  const searchParams = useSearchParams();

  const focusQuery = useMemo(
    () => ({
      nodeId: searchParams.get("nodeId"),
      jobId: searchParams.get("jobId"),
      assetId: searchParams.get("assetId"),
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
    <div className="relative h-svh overflow-hidden">
      <Suspense
        fallback={
          <div className="grid h-full place-items-center text-sm text-white/40">
            加载画布…
          </div>
        }
      >
        <CanvasProjectInner id={id} />
      </Suspense>
    </div>
  );
}
