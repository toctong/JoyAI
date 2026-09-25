/**
 * App-wide exclusive audible media — at most one unmuted playing source.
 * Muted hover previews stay separate; claiming audible clears them to save bandwidth.
 */

import { stopAllVideoHoverPreviews } from "./video-feed-preview";

type StopFn = () => void;

let activeStop: StopFn | null = null;

/** Register this source as the sole audible player; pause/mute any previous one. */
export function claimAudibleMedia(stop: StopFn) {
  stopAllVideoHoverPreviews();
  if (activeStop && activeStop !== stop) {
    try {
      activeStop();
    } catch {
      /* ignore */
    }
  }
  activeStop = stop;
}

export function releaseAudibleMedia(stop: StopFn) {
  if (activeStop === stop) activeStop = null;
}

export function stopAllAudibleMedia() {
  if (!activeStop) return;
  const stop = activeStop;
  activeStop = null;
  try {
    stop();
  } catch {
    /* ignore */
  }
}

/** True when this element is currently contributing audible output. */
export function isMediaAudible(el: HTMLMediaElement | null | undefined): boolean {
  if (!el) return false;
  return !el.paused && !el.muted && el.volume > 0;
}
