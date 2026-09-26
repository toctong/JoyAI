"use client";

import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import "./joy-boot-loading.css";

type Props = {
  /** Accessible label (visible text stays minimal) */
  label?: string;
  /** Fill viewport (auth boot) vs parent height (in-page) */
  fullScreen?: boolean;
  className?: string;
};

/**
 * Quiet auth / shell boot — mark only, soft fade.
 * Prefer page skeletons when the layout is already known.
 */
export function JoyBootLoading({
  label = "加载中",
  fullScreen = true,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "joy-boot-loading",
        fullScreen ? "is-fullscreen" : "is-fill",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={JOYAI_BRAND.logo}
        alt=""
        className="joy-boot-loading-mark"
        draggable={false}
      />
    </div>
  );
}
