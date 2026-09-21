/**
 * JS-side mirrors of design tokens that cannot live in CSS alone
 * (canvas node geometry, text font clamp). Keep in sync with
 * `design-tokens.css` when bumping the visual scale.
 */

/** Default canvas node box sizes (~+15% vs early defaults). */
export const CANVAS_NODE_SIZE = {
  text: { width: 400, height: 184 },
  image: { width: 390, height: 276 },
  video: { width: 480, height: 270 },
  prompt: { width: 320, height: 208 },
  panorama: { width: 390, height: 196 },
  audio: { width: 436, height: 230 },
  director: { width: 320, height: 208 },
} as const;

export const CANVAS_TEXT_FONT = {
  default: 16,
  min: 12,
  max: 36,
} as const;

export const JOY_CONTROL = {
  hSm: 32,
  hMd: 36,
  hLg: 40,
  hXl: 44,
} as const;
