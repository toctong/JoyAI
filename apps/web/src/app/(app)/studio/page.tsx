import { Suspense } from "react";
import { StudioForm } from "@/features/studio/studio-form";

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-muted-foreground">
          加载创作台…
        </div>
      }
    >
      <StudioForm />
    </Suspense>
  );
}
