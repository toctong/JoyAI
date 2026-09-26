"use client";

/**
 * Studio image stage — pattern used by most GitHub mask editors
 * (image-masking, InvokeAI canvas): visible <img> under an overlay canvas.
 * Avoids Fabric/CORS blank-canvas failures.
 *
 * Display size fits the stage box (no viewport-vh scrollbar). Overlay canvas
 * pixel size follows the fitted CSS box.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/shared/lib/utils";

type Size = { width: number; height: number };

type Props = {
  url: string;
  /** Cap natural decode size before fitting into the stage. */
  maxEdge?: number;
  className?: string;
  /** Overlay drawn above the image (same CSS box as the img). */
  overlay?: (size: Size) => ReactNode;
  onReady?: (size: Size) => void;
  imgStyle?: CSSProperties;
};

function fitSize(
  natural: Size,
  box: Size,
  maxEdge: number,
): Size {
  const edgeScale = Math.min(1, maxEdge / Math.max(natural.width, natural.height));
  const baseW = Math.max(1, Math.round(natural.width * edgeScale));
  const baseH = Math.max(1, Math.round(natural.height * edgeScale));
  if (!box.width || !box.height) {
    return { width: baseW, height: baseH };
  }
  const fit = Math.min(box.width / baseW, box.height / baseH, 1);
  return {
    width: Math.max(1, Math.round(baseW * fit)),
    height: Math.max(1, Math.round(baseH * fit)),
  };
}

export function StudioImageStage({
  url,
  maxEdge = 1400,
  className,
  overlay,
  onReady,
  imgStyle,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const naturalRef = useRef<Size | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [failed, setFailed] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    setSize(null);
    setFailed(false);
    naturalRef.current = null;
  }, [url]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const publish = () => {
      const natural = naturalRef.current;
      if (!natural) return;
      const rect = box.getBoundingClientRect();
      const next = fitSize(
        natural,
        {
          width: Math.max(1, Math.floor(rect.width)),
          height: Math.max(1, Math.floor(rect.height)),
        },
        maxEdge,
      );
      setSize((prev) => {
        if (prev && prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        onReadyRef.current?.(next);
        return next;
      });
    };

    const ro = new ResizeObserver(() => publish());
    ro.observe(box);
    publish();
    return () => ro.disconnect();
  }, [url, maxEdge]);

  function onImageLoad(image: HTMLImageElement) {
    const nw = image.naturalWidth;
    const nh = image.naturalHeight;
    if (!nw || !nh) return;
    naturalRef.current = { width: nw, height: nh };
    const box = boxRef.current?.getBoundingClientRect();
    const next = fitSize(
      { width: nw, height: nh },
      {
        width: Math.max(1, Math.floor(box?.width ?? 0)),
        height: Math.max(1, Math.floor(box?.height ?? 0)),
      },
      maxEdge,
    );
    setSize(next);
    onReadyRef.current?.(next);
  }

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative flex h-full w-full min-h-0 min-w-0 items-center justify-center select-none",
        className,
      )}
    >
      <div
        className="relative max-h-full max-w-full"
        style={
          size
            ? { width: size.width, height: size.height }
            : { maxWidth: "100%", maxHeight: "100%" }
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt=""
          draggable={false}
          className="block h-full w-full object-contain"
          style={imgStyle}
          onLoad={(e) => onImageLoad(e.currentTarget)}
          onError={() => setFailed(true)}
        />
        {size && overlay ? (
          <div className="absolute inset-0">{overlay(size)}</div>
        ) : null}
        {!size && !failed ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/40">
            加载图片…
          </p>
        ) : null}
        {failed ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-red-400">
            图片加载失败
          </p>
        ) : null}
      </div>
    </div>
  );
}
