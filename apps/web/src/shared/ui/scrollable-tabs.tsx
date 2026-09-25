"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import "./scrollable-tabs.css";

type Props = {
  children: ReactNode;
  className?: string;
  listClassName?: string;
  /** When this changes, active tab scrolls into view. */
  scrollKey?: string | number;
  /** Scroll distance per click; default ~70% of viewport. */
  stepRatio?: number;
  role?: string;
  "aria-label"?: string;
};

/**
 * Single-row tab strip with Ant Design a-tabs-style overflow arrows.
 * Chevrons only appear when content overflows the viewport.
 */
export function ScrollableTabs({
  children,
  className,
  listClassName,
  scrollKey,
  stepRatio = 0.7,
  role = "tablist",
  "aria-label": ariaLabel,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = Math.max(0, scrollWidth - clientWidth);
    const overflow = max > 1;
    setCanPrev(overflow && scrollLeft > 1);
    setCanNext(overflow && scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    update();
    const onScroll = () => update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    const track = el.firstElementChild ?? el;
    if (track !== el) ro.observe(track);
    // Observe size of tab row content.
    for (const child of Array.from(el.children)) {
      ro.observe(child);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [update]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(
      '[aria-selected="true"], .is-active',
    );
    if (!active) {
      update();
      return;
    }
    active.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    const t = window.setTimeout(update, 320);
    return () => window.clearTimeout(t);
  }, [scrollKey, update]);

  function scrollByDir(dir: -1 | 1) {
    const el = viewportRef.current;
    if (!el) return;
    const delta = Math.max(120, Math.round(el.clientWidth * stepRatio)) * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }

  return (
    <div
      className={cn(
        "joy-scroll-tabs",
        (canPrev || canNext) && "is-overflow",
        canPrev && "has-prev",
        canNext && "has-next",
        className,
      )}
    >
      {canPrev ? (
        <button
          type="button"
          className="joy-scroll-tabs-btn is-prev"
          aria-label="向左滚动"
          onClick={() => scrollByDir(-1)}
        >
          <ChevronLeft className="size-[var(--joy-icon-md)]" strokeWidth={1.75} />
        </button>
      ) : null}

      <div
        ref={viewportRef}
        className={cn("joy-scroll-tabs-viewport", listClassName)}
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>

      {canNext ? (
        <button
          type="button"
          className="joy-scroll-tabs-btn is-next"
          aria-label="向右滚动"
          onClick={() => scrollByDir(1)}
        >
          <ChevronRight className="size-[var(--joy-icon-md)]" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
