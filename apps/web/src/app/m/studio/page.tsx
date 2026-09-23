import { Suspense } from "react";
import { MobileStudioPage } from "@/features/mobile";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="joy-m-page">
          <p className="joy-m-page-desc">加载中…</p>
        </div>
      }
    >
      <MobileStudioPage />
    </Suspense>
  );
}
