"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { useReleaseMediaOnUnmount } from "@/shared/lib/use-release-media-on-unmount";

type Props = ComponentPropsWithoutRef<"video">;

/** Native video that releases decoder / network on unmount. */
export function JoyReleasedVideo(props: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useReleaseMediaOnUnmount(ref);
  return <video ref={ref} {...props} />;
}
