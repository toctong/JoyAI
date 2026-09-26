"use client";

import { Suspense } from "react";
import { InspireHome } from "@/features/inspire/inspire-home";
import { JoyBootLoading } from "@/shared/ui/joy-boot-loading";

export default function InspirePage() {
  return (
    <Suspense fallback={<JoyBootLoading fullScreen={false} label="加载中" />}>
      <InspireHome />
    </Suspense>
  );
}
