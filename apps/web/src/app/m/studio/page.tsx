import { Suspense } from "react";
import { MobileStudioPage } from "@/features/mobile";
import { JoyBootLoading } from "@/shared/ui/joy-boot-loading";

export default function Page() {
  return (
    <Suspense fallback={<JoyBootLoading fullScreen={false} label="加载中" />}>
      <MobileStudioPage />
    </Suspense>
  );
}
