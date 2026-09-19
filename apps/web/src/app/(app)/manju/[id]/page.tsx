"use client";

import { Suspense, use } from "react";
import { ManjuWorkbench } from "@/features/manju/manju-workbench";

export default function ManjuProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="relative h-full overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-[#09090b] text-sm text-zinc-500">
            加载漫剧工作台…
          </div>
        }
      >
        <ManjuWorkbench projectId={id} />
      </Suspense>
    </div>
  );
}
