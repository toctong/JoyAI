"use client";

import { useEffect, useRef, type RefObject } from "react";
import { releaseHtmlMedia } from "./release-media";

/** Release media when the hosting component unmounts (route leave / dialog close). */
export function useReleaseMediaOnUnmount(
  ref: RefObject<HTMLMediaElement | null>,
) {
  const refStable = useRef(ref);
  refStable.current = ref;
  useEffect(() => {
    return () => releaseHtmlMedia(refStable.current.current);
  }, []);
}
