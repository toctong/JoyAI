/**
 * Normalize prompt mention tokens before upstream APIs.
 * Canonical: `@图片1` / `@视频1` / `@音频1`.
 *
 * When `maxImages` is known, `@图片33个人` with 3 refs → `@图片3` + `3个人`.
 * Also inserts a space if a mention would otherwise glue to a following digit.
 */
const WIRE_RE = /\{\{(Image|Video|Audio)\s+(\d+)\}\}/gi;

function disambiguateIndex(
  digitRun: string,
  maxIndex: number,
): { index: number; len: number } {
  const digits = digitRun.replace(/\D/g, "");
  if (!digits) return { index: 0, len: 0 };
  if (maxIndex > 0) {
    for (
      let len = Math.min(digits.length, String(maxIndex).length);
      len >= 1;
      len--
    ) {
      const n = Number(digits.slice(0, len));
      if (n >= 1 && n <= maxIndex) return { index: n, len };
    }
    const n = Number(digits[0]);
    return { index: n >= 1 ? n : 0, len: n >= 1 ? 1 : 0 };
  }
  // Unknown pool: keep up to 2 digits (supports @图片10)
  const len = Math.min(digits.length, 2);
  return { index: Number(digits.slice(0, len)), len };
}

function tokenFor(
  kind: string,
  index: number,
): string {
  if (kind === "视频") return `@视频${index}`;
  if (kind === "音频") return `@音频${index}`;
  return `@图片${index}`;
}

export function rewritePromptMentionsForApi(
  prompt: string,
  opts?: { maxImages?: number; maxVideos?: number; maxAudios?: number },
): string {
  let out = String(prompt ?? "")
    .replace(/\u200B/g, "")
    // Kling Omni wire → FrameRally @ (providers convert again if needed)
    .replace(/<<<image_(\d+)>>>/gi, (_m, n: string) => `@图片${n}`)
    .replace(/<<<element_(\d+)>>>/gi, (_m, n: string) => `@图片${n}`)
    .replace(/<<<video_(\d+)>>>/gi, (_m, n: string) => `@视频${n}`);
  if (!out) return out;

  out = out.replace(WIRE_RE, (_full, kind: string, index: string) => {
    const k = kind.toLowerCase();
    if (k === "video") return `@视频${index}`;
    if (k === "audio") return `@音频${index}`;
    return `@图片${index}`;
  });

  const maxImages = opts?.maxImages ?? 0;
  const maxVideos = opts?.maxVideos ?? 0;
  const maxAudios = opts?.maxAudios ?? 0;

  let result = "";
  let i = 0;
  while (i < out.length) {
    if (out[i] === "@") {
      const m = out.slice(i).match(/^@(图片|视频|音频|图)(\d+)/);
      if (m) {
        const kind = m[1]!;
        const digitRun = m[2]!;
        const max =
          kind === "视频"
            ? maxVideos
            : kind === "音频"
              ? maxAudios
              : maxImages;
        const { index, len } = disambiguateIndex(digitRun, max);
        if (index > 0 && len > 0) {
          const token = tokenFor(kind === "图" ? "图片" : kind, index);
          result += token;
          const prefixLen = 1 + kind.length; // @ + kind
          i += prefixLen + len;
          // If next char is still a digit, separate for the model
          if (i < out.length && /\d/.test(out[i]!)) {
            result += " ";
          }
          continue;
        }
      }
    }
    result += out[i];
    i += 1;
  }
  return result;
}
