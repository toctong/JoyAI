"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetchBlob } from "@/shared/lib/api";
import { needsMediaProxy } from "@/shared/lib/needs-media-proxy";
import { cn } from "@/shared/lib/utils";

/** Resolve a browser-safe display URL; proxies flaky ToAPIs CDN via `/media/fetch`. */
export function useDisplayMediaUrl(src: string) {
  const proxy = needsMediaProxy(src);
  const [url, setUrl] = useState<string | null>(proxy ? null : src);
  const [loading, setLoading] = useState(proxy);
  const objectUrlRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }

    if (!needsMediaProxy(src)) {
      setUrl(src);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setUrl(null);
    setLoading(true);

    void (async () => {
      try {
        const blob = await apiFetchBlob("/media/fetch", {
          params: { url: src, kind: "image" },
          timeoutMs: 120_000,
        });
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setUrl(objectUrl);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setUrl(src);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = "";
      }
    };
  }, [src]);

  return { url, loading };
}

type Props = {
  src: string;
  alt?: string;
  className?: string;
  draggable?: boolean;
  placeholderClassName?: string;
  onDragStart?: (event: React.DragEvent<HTMLImageElement>) => void;
};

/**
 * `<img>` for remote generation results. Temporary ToAPIs links go through the
 * API proxy — Chrome hits `ERR_HTTP2_PROTOCOL_ERROR` on those CDNs for large
 * files; this is not a CORS issue (`Access-Control-Allow-Origin: *` is fine).
 */
export function JoyRemoteImg({
  src,
  alt = "",
  className,
  draggable = false,
  placeholderClassName,
  onDragStart,
}: Props) {
  const { url, loading } = useDisplayMediaUrl(src);

  if (loading || !url) {
    return (
      <span
        aria-busy
        aria-label="加载中"
        className={cn(
          "block size-full animate-pulse bg-muted/50",
          placeholderClassName,
          className,
        )}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      draggable={draggable}
      className={className}
      onDragStart={onDragStart}
    />
  );
}
