/**
 * Feed / gallery muted hover previews — shared policy for many videos.
 *
 * - Delay before play (skip flyovers)
 * - At most one active preview app-wide
 * - Respect reduced-motion + Save-Data
 * - Teardown via {@link releaseHtmlMedia}
 */

import { releaseHtmlMedia } from "./release-media";

/** Mainstream hover delay before mounting / playing a preview. */
export const VIDEO_HOVER_PREVIEW_DELAY_MS = 400;

type StopFn = () => void;

let activeStop: StopFn | null = null;

/** Stop any other hover preview, then register this one as the sole owner. */
export function claimVideoHoverPreview(stop: StopFn) {
  if (activeStop && activeStop !== stop) {
    try {
      activeStop();
    } catch {
      /* ignore */
    }
  }
  activeStop = stop;
}

/** Force-stop whichever hover preview is active (e.g. opening a detail dialog). */
export function stopAllVideoHoverPreviews() {
  if (!activeStop) return;
  const stop = activeStop;
  activeStop = null;
  try {
    stop();
  } catch {
    /* ignore */
  }
}

export function releaseVideoHoverPreview(stop: StopFn) {
  if (activeStop === stop) activeStop = null;
}

/** Skip auto hover previews under reduced motion or data-saver. */
export function shouldSkipVideoHoverPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const conn = (
      navigator as Navigator & {
        connection?: { saveData?: boolean };
      }
    ).connection;
    if (conn?.saveData) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Pause + abort download for a hover video element. */
export function stopHoverVideo(el: HTMLVideoElement | null | undefined) {
  releaseHtmlMedia(el);
}
