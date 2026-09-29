"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { manjuStudioHref } from "@/features/manju/studio/manju-studio-routes";

/** Project root → 初始设定 (matches 绘梦工坊 IA). */
export default function ManjuOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(manjuStudioHref(id, "settings"));
  }, [id, router]);
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      正在进入初始设定…
    </div>
  );
}
