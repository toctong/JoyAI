/**
 * Normalize prompt mention tokens before upstream APIs.
 * Canonical form: `@图片1` / `@视频1` / `@音频1`（即梦 / Seedance 惯例）.
 * Also upgrades legacy `{{Image 1}}` and short `@图1`.
 */
const WIRE_RE = /\{\{(Image|Video|Audio)\s+(\d+)\}\}/gi;
const SHORT_AT_RE = /@(图|图片|视频|音频)(\d+)/g;

export function rewritePromptMentionsForApi(prompt: string): string {
  const src = String(prompt ?? "");
  if (!src) return src;

  return src
    .replace(WIRE_RE, (_full, kind: string, index: string) => {
      const k = kind.toLowerCase();
      if (k === "video") return `@视频${index}`;
      if (k === "audio") return `@音频${index}`;
      return `@图片${index}`;
    })
    .replace(SHORT_AT_RE, (_full, kind: string, index: string) => {
      if (kind === "视频") return `@视频${index}`;
      if (kind === "音频") return `@音频${index}`;
      return `@图片${index}`;
    });
}
