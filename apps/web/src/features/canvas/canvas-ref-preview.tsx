"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CanvasRefThumb } from "./canvas-ref-thumb";
import { cn } from "@/shared/lib/utils";
import "./canvas-ref-preview.css";

type Props = {
  kind: string;
  url?: string;
  className?: string;
  thumbClassName?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** Disable hover preview (icons-only refs). */
  preview?: boolean;
};

function canPreview(kind: string, url?: string) {
  const src = String(url ?? "").trim();
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;
  return (
    kind === "image" ||
    kind === "panorama" ||
    kind === "video" ||
    kind === ""
  );
}

/**
 * Reference thumbnail with a floating large preview on hover
 * (infinite-canvas / studio style).
 */
export function CanvasRefHoverPreview({
  kind,
  url,
  className,
  thumbClassName,
  style,
  children,
  preview = true,
}: Props) {
  const enabled = preview && canPreview(kind, url);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portalId = useId();

  function clearLeave() {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function measure() {
    const el = anchorRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left + rect.width / 2,
      top: rect.top,
    };
  }

  function show() {
    if (!enabled) return;
    clearLeave();
    const next = measure();
    if (!next) return;
    setBox(next);
    setOpen(true);
  }

  function hide() {
    clearLeave();
    leaveTimer.current = setTimeout(() => setOpen(false), 80);
  }

  useEffect(() => {
    if (!open) return;
    const onScroll = () => {
      const next = measure();
      if (next) setBox(next);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  useEffect(() => () => clearLeave(), []);

  const src = String(url ?? "").trim();

  return (
    <>
      <div
        ref={anchorRef}
        className={cn("joy-ref-hover", className)}
        style={style}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <div className={cn("joy-ref-hover-thumb", thumbClassName)}>
          {children ?? <CanvasRefThumb kind={kind} url={url} />}
        </div>
      </div>
      {enabled && open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              id={portalId}
              className="joy-ref-hover-portal"
              style={{
                left: box.left,
                top: box.top,
              }}
              onPointerEnter={show}
              onPointerLeave={hide}
            >
              <div className="joy-ref-hover-card">
                {kind === "video" ? (
                  <video
                    src={src}
                    muted
                    playsInline
                    preload="metadata"
                    autoPlay
                    loop
                    className="joy-ref-hover-media"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="joy-ref-hover-media" />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
