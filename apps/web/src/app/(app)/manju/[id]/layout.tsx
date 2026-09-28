"use client";

import { Suspense, use } from "react";
import { ManjuStudioLayout } from "@/features/manju/studio/manju-studio-layout";

export default function ManjuProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="relative h-full overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
            加载漫剧工作室…
          </div>
        }
      >
        <ManjuStudioLayout projectId={id}>{children}</ManjuStudioLayout>
      </Suspense>
    </div>
  );
}
