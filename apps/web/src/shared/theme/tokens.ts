/**
 * JS-side mirrors of design tokens that cannot live in CSS alone
 * (canvas node geometry, text font clamp). Keep in sync with
 * `design-tokens.css` when bumping the visual scale.
 */

/** Shared blank-node frame (16:9). Panorama stays 2:1 for equirect. */
const CANVAS_BLANK_16x9 = { width: 480, height: 270 } as const;

/** Default canvas node box sizes. */
export const CANVAS_NODE_SIZE = {
  text: CANVAS_BLANK_16x9,
  image: CANVAS_BLANK_16x9,
  video: CANVAS_BLANK_16x9,
  prompt: CANVAS_BLANK_16x9,
  panorama: { width: 480, height: 240 },
  audio: CANVAS_BLANK_16x9,
  director: CANVAS_BLANK_16x9,
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
