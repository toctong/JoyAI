"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { runThemeReveal } from "@/shared/lib/theme-transition";

const LABELS = {
  light: "浅色",
  dark: "深色",
} as const;

type ThemeName = keyof typeof LABELS;

/** Keep app ScrollArea from jumping while html class / layout reflows. */
function freezeAppScroll(ms = 650) {
  const vp = document.querySelector(
    "[data-app-shell] main [data-radix-scroll-area-viewport]",
  ) as HTMLElement | null;
  if (!vp) return;
  const top = vp.scrollTop;
  const left = vp.scrollLeft;
  let active = true;
  const restore = () => {
    if (!active) return;
    if (vp.scrollTop !== top) vp.scrollTop = top;
    if (vp.scrollLeft !== left) vp.scrollLeft = left;
  };
  vp.addEventListener("scroll", restore, { passive: true });
  const obs = new MutationObserver(restore);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  const id = window.setInterval(restore, 16);
  window.setTimeout(() => {
    active = false;
    window.clearInterval(id);
    vp.removeEventListener("scroll", restore);
    obs.disconnect();
    restore();
  }, ms);
}

export function ThemeToggle({
  variant = "ghost",
  size = "icon",
  className,
}: {
  variant?: "ghost" | "outline" | "secondary";
  size?: "icon" | "sm" | "default";
  className?: string;
}) {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const busyRef = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    if (theme === "system") {
      setTheme(resolvedTheme === "dark" ? "dark" : "light");
    }
  }, [mounted, theme, resolvedTheme, setTheme]);

  const current: ThemeName =
    theme === "dark" || resolvedTheme === "dark" ? "dark" : "light";

  if (!mounted) {
    return (
      <Button variant={variant} size={size} className={className} aria-label="主题">
        <Sun className="h-[var(--joy-icon-md)] w-[var(--joy-icon-md)]" />
      </Button>
    );
  }

  const Icon = current === "dark" ? Moon : Sun;

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      aria-label={`主题：${LABELS[current]}，点击切换`}
      title={`主题：${LABELS[current]}（点击切换）`}
      onClick={(event) => {
        if (busyRef.current) return;
        const next = current === "light" ? "dark" : "light";
        const rect = event.currentTarget.getBoundingClientRect();
        const origin = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        busyRef.current = true;
        freezeAppScroll();
        void runThemeReveal({
          next,
          origin,
          apply: () => {
            flushSync(() => setTheme(next));
          },
        }).finally(() => {
          busyRef.current = false;
        });
      }}
    >
      <Icon className="h-[var(--joy-icon-md)] w-[var(--joy-icon-md)]" />
    </Button>
  );
}
