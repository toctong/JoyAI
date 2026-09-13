"use client";

import { Suspense } from "react";
import { InspireHome } from "@/features/inspire/inspire-home";

export default function InspirePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          加载中…
        </div>
      }
    >
      <InspireHome />
    </Suspense>
  );
}
