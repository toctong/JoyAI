"use client";

import { useEffect } from "react";
import { DEFAULT_APPEARANCE_KNOBS } from "./types";

/** Applies glass chrome tokens on inspire (`joy-appearance-active`). */
export function AppearanceTokens({ disabled = false }: { disabled?: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    /** Inspire always gets glass chrome; wallpaper is optional media behind it. */
    const active = !disabled;

    root.classList.toggle("joy-appearance-active", active);
    root.style.setProperty(
      "--joy-wp-blur",
      `${DEFAULT_APPEARANCE_KNOBS.wallpaperBlur}px`,
    );
    root.style.setProperty(
      "--joy-scrim",
      `${DEFAULT_APPEARANCE_KNOBS.scrim / 100}`,
    );
    root.style.setProperty(
      "--joy-border-boost",
      `${DEFAULT_APPEARANCE_KNOBS.border / 100}`,
    );
    root.style.setProperty(
      "--joy-glass-blur",
      `${DEFAULT_APPEARANCE_KNOBS.glass}px`,
    );

    return () => {
      root.classList.remove("joy-appearance-active");
    };
  }, [disabled]);

  return null;
}
