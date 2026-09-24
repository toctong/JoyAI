"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";

const SRC_WEBP = "/loading/record-loading.webp";
const SRC_GIF = "/loading/record-loading.gif";

/**
 * Looping mesh for canvas busy states and studio generating thumbs.
 * Uses animated image (webp/gif) so multi-tile grids all play — no video autoplay caps.
 */
export function LoadingAnimation({ className }: { className?: string }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (reduceMotion) return null;

  return (
    <picture
      className={cn(
        "pointer-events-none absolute inset-0 block size-full",
        className,
      )}
      aria-hidden
    >
      <source srcSet={SRC_WEBP} type="image/webp" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SRC_GIF}
        alt=""
        draggable={false}
        className="size-full object-cover"
      />
    </picture>
  );
}
