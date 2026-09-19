import { Suspense } from "react";
import { ManjuProjectList } from "@/features/manju/manju-project-list";

export default function ManjuPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-muted-foreground">
          加载漫剧工作台…
        </div>
      }
    >
      <ManjuProjectList />
    </Suspense>
  );
}
