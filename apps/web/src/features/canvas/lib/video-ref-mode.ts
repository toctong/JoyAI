import type { ModelCapabilities } from "@joyai/shared";

/** Canvas video generation modes (Jimeng-like footer switcher). */
export type VideoGenModeId = "t2v" | "first" | "first_last" | "omni";

export type VideoGenModeOption = {
  id: VideoGenModeId;
  label: string;
  /** Lucide-ish hint for UI (optional). */
  hint: string;
};

export const VIDEO_GEN_MODES: VideoGenModeOption[] = [
  { id: "t2v", label: "文生视频", hint: "仅用文字描述生成" },
  { id: "first", label: "首帧生视频", hint: "以一张图作为首帧" },
  { id: "first_last", label: "首尾帧生视频", hint: "首帧 + 尾帧引导" },
  { id: "omni", label: "参考生视频", hint: "多模态参考素材" },
];

/** Pick a video reference mode. One ref is omni; two or more is first/last. */
export function videoRefMode(
  refCount: number,
): "omni" | "first_last" | undefined {
  if (refCount >= 2) return "first_last";
  if (refCount === 1) return "omni";
  return undefined;
}

/** Infer mode from current frame / ref wiring (fallback when unset). */
export function inferVideoGenMode(opts: {
  hasFirst: boolean;
  hasLast: boolean;
  refCount: number;
}): VideoGenModeId {
  if (opts.hasFirst && opts.hasLast) return "first_last";
  if (opts.hasFirst) return "first";
  if (opts.refCount >= 1) return "omni";
  return "t2v";
}

/** @deprecated Prefer videoGenModeLabelById / inferVideoGenMode */
export function videoGenModeLabel(opts: {
  hasFirst: boolean;
  hasLast: boolean;
  refCount: number;
}) {
  return (
    VIDEO_GEN_MODES.find((m) => m.id === inferVideoGenMode(opts))?.label ??
    "文生视频"
  );
}

export function videoGenModeLabelById(id: VideoGenModeId) {
  return VIDEO_GEN_MODES.find((m) => m.id === id)?.label ?? "文生视频";
}

function featureSet(caps?: ModelCapabilities | null): Set<string> {
  return new Set((caps?.features ?? []).map((f) => f.trim().toLowerCase()));
}

/**
 * Modes the selected video model supports.
 * - Empty / missing features → all modes (legacy catalogs).
 * - 全能（t2v + i2v/首尾帧 + omni/r2v）→ 全部开放.
 */
export function videoGenModesFromCapabilities(
  caps?: ModelCapabilities | null,
): VideoGenModeOption[] {
  const features = featureSet(caps);
  if (!features.size) return [...VIDEO_GEN_MODES];

  const hasT2v = features.has("t2v");
  const hasI2v = features.has("i2v");
  const hasFirstLast = features.has("first-last-frame");
  const hasOmni =
    features.has("omni-ref") ||
    features.has("r2v") ||
    features.has("reference-video");

  // 全能参考模型：文生 / 首帧 / 首尾帧 / 参考 都可用
  if (hasOmni && hasT2v && (hasI2v || hasFirstLast)) {
    return [...VIDEO_GEN_MODES];
  }

  const allowed = new Set<VideoGenModeId>();
  if (hasT2v) allowed.add("t2v");
  if (hasI2v || hasFirstLast || hasOmni) allowed.add("first");
  if (hasFirstLast || hasOmni) allowed.add("first_last");
  if (hasOmni) allowed.add("omni");

  if (!allowed.size) return [...VIDEO_GEN_MODES];
  return VIDEO_GEN_MODES.filter((m) => allowed.has(m.id));
}

/** Whether a model can run the given canvas video gen mode. */
export function modelSupportsVideoGenMode(
  caps: ModelCapabilities | null | undefined,
  mode: VideoGenModeId,
): boolean {
  return videoGenModesFromCapabilities(caps).some((m) => m.id === mode);
}

export function normalizeVideoGenMode(
  raw: unknown,
  allowed: VideoGenModeOption[],
): VideoGenModeId {
  const list = allowed.length ? allowed : VIDEO_GEN_MODES;
  const id = String(raw ?? "").trim() as VideoGenModeId;
  if (list.some((m) => m.id === id)) return id;
  return list[0]!.id;
}

/** Map UI gen mode → job input.refMode (undefined for pure t2v). */
export function jobRefModeForGenMode(
  mode: VideoGenModeId,
): "omni" | "first_last" | undefined {
  if (mode === "first_last") return "first_last";
  if (mode === "first" || mode === "omni") return "omni";
  return undefined;
}

export function genModeNeedsFirstFrame(mode: VideoGenModeId) {
  return mode === "first" || mode === "first_last";
}

export function genModeNeedsLastFrame(mode: VideoGenModeId) {
  return mode === "first_last";
}

export function genModeShowsFrameSlots(mode: VideoGenModeId) {
  return mode === "first" || mode === "first_last";
}
