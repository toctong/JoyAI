"use client";

import { useEffect, useState } from "react";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";

type Props = {
  /** When false, plays leave transition then unmounts */
  visible: boolean;
  label?: string;
  className?: string;
};

const LEAVE_MS = 480;

/**
 * Canvas project boot veil — quiet mark + thin bar over the surface.
 * Prefer this over JoyBootLoading (auth) or LoadingAnimation (gen busy).
 */
export function CanvasBootOverlay({
  visible,
  label = "加载画布",
  className,
}: Props) {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const t = window.setTimeout(() => setMounted(false), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [visible, mounted]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "joy-canvas-boot",
        !visible && "is-leave",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy={visible}
      aria-label={label}
    >
      <div className="joy-canvas-boot-veil" aria-hidden />
      <div className="joy-canvas-boot-grid" aria-hidden />
      <div className="joy-canvas-boot-core">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={JOYAI_BRAND.logo}
          alt=""
          className="joy-canvas-boot-mark"
          draggable={false}
        />
        <span className="joy-canvas-boot-bar" aria-hidden />
      </div>
    </div>
  );
}
