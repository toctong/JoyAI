"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";

const SRC = "/loading/record-loading.mp4";

/** Looping mesh used by canvas node busy states and the studio generating thumb. */
export function LoadingAnimation({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (reduce.matches) {
        video.pause();
        return;
      }
      void video.play().catch(() => undefined);
    };
    sync();
    reduce.addEventListener("change", sync);
    return () => reduce.removeEventListener("change", sync);
  }, []);

  return (
    <video
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-0 size-full object-cover",
        className,
      )}
      src={SRC}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
    />
  );
}
