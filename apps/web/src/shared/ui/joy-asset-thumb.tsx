"use client";

import { useEffect, useState } from "react";
import { tosThumbUrl, type MediaThumbSize } from "@/shared/lib/media-url";
import { cn } from "@/shared/lib/utils";

type Props = {
  url: string;
  alt?: string;
  size?: MediaThumbSize;
  className?: string;
  loading?: "lazy" | "eager";
  draggable?: boolean;
};

/**
 * List/grid image: prefer TOS process thumb, fall back to original on error
 * (bucket may not have image processing enabled, or CDN strips the query).
 */
export function JoyAssetThumb({
  url,
  alt = "",
  size = "md",
  className,
  loading = "lazy",
  draggable = false,
}: Props) {
  const thumb = tosThumbUrl(url, size);
  const initial = thumb || url;
  const [src, setSrc] = useState(initial);
  const [triedOriginal, setTriedOriginal] = useState(!thumb || thumb === url);

  useEffect(() => {
    const nextThumb = tosThumbUrl(url, size);
    const next = nextThumb || url;
    setSrc(next);
    setTriedOriginal(!nextThumb || nextThumb === url);
  }, [url, size]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={loading}
      draggable={draggable}
      className={cn(className)}
      onError={() => {
        if (triedOriginal || src === url) return;
        setTriedOriginal(true);
        setSrc(url);
      }}
    />
  );
}
