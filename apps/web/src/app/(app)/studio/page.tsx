import { Suspense } from "react";
import { StudioForm } from "@/features/studio/studio-form";

export default function StudioPage() {
  return (
    <div className="h-full min-h-0">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-muted-foreground">
            加载创作台…
          </div>
        }
      >
        <StudioForm />
      </Suspense>
    </div>
  );
}
