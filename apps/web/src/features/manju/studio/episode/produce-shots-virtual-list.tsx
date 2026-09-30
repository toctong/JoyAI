"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { cn } from "@/shared/lib/utils";
import type { ManjuShotDraft } from "../../manju-types";

/** Fixed row stride (item min-height + list gap) for window math. */
export const PRODUCE_SHOT_ROW = 62;
const VIRTUALIZE_AFTER = 24;
const OVERSCAN = 6;

type ShotLabel = { prefix: string; title: string; full: string };

type Props = {
  shots: ManjuShotDraft[];
  selectedId: string | null | undefined;
  epIndex: number;
  shotLabel: (shot: ManjuShotDraft, epIndex: number, localIndex: number) => ShotLabel;
  onSelect: (shotId: string) => void;
};

/**
 * Produce-side shot rail: windowed DOM when the episode has many shots.
 */
export function ProduceShotsVirtualList({
  shots,
  selectedId,
  epIndex,
  shotLabel,
  onSelect,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sync = () => {
      setViewportH(el.clientHeight || 480);
      setScrollTop(el.scrollTop);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shots.length]);

  useEffect(() => {
    if (!selectedId) return;
    const idx = shots.findIndex((s) => s.id === selectedId);
    if (idx < 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const top = idx * PRODUCE_SHOT_ROW;
    const bottom = top + PRODUCE_SHOT_ROW;
    if (top < el.scrollTop) {
      el.scrollTop = top;
      setScrollTop(top);
    } else if (bottom > el.scrollTop + el.clientHeight) {
      const next = bottom - el.clientHeight;
      el.scrollTop = next;
      setScrollTop(next);
    }
  }, [selectedId, shots]);

  const useVirtual = shots.length > VIRTUALIZE_AFTER;

  const windowed = useMemo(() => {
    if (!useVirtual) {
      return {
        start: 0,
        end: shots.length,
        padTop: 0,
        padBottom: 0,
      };
    }
    const start = Math.max(
      0,
      Math.floor(scrollTop / PRODUCE_SHOT_ROW) - OVERSCAN,
    );
    const visible = Math.ceil(viewportH / PRODUCE_SHOT_ROW) + OVERSCAN * 2;
    const end = Math.min(shots.length, start + visible);
    return {
      start,
      end,
      padTop: start * PRODUCE_SHOT_ROW,
      padBottom: Math.max(0, (shots.length - end) * PRODUCE_SHOT_ROW),
    };
  }, [useVirtual, scrollTop, viewportH, shots.length]);

  const slice = shots.slice(windowed.start, windowed.end);

  return (
    <div
      ref={scrollerRef}
      className="manju-produce__shots-list"
      onScroll={useVirtual ? onScroll : undefined}
    >
      {useVirtual ? <div style={{ height: windowed.padTop }} aria-hidden /> : null}
      {slice.map((shot, offset) => {
        const i = windowed.start + offset;
        const label = shotLabel(shot, epIndex, i + 1);
        const on = selectedId === shot.id;
        return (
          <button
            key={shot.id}
            type="button"
            className={cn("manju-produce__shot-item", on && "is-active")}
            onClick={() => onSelect(shot.id)}
          >
            <span className="manju-produce__shot-thumb" aria-hidden>
              {shot.storyboardImageUrl ? (
                <JoyAssetThumb
                  url={shot.storyboardImageUrl}
                  size="sm"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="size-4 opacity-40" />
              )}
            </span>
            <span className="manju-produce__shot-meta">
              <strong className="truncate">{label.full}</strong>
              <span className="truncate">
                {shot.visual.trim() || "暂无描述"}
              </span>
            </span>
          </button>
        );
      })}
      {useVirtual ? (
        <div style={{ height: windowed.padBottom }} aria-hidden />
      ) : null}
    </div>
  );
}
