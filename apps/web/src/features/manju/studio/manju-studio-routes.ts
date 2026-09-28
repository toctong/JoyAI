/** Studio IA routes under `/manju/[id]/…` (ArcReel-style). */

export type ManjuStudioSection =
  | "overview"
  | "source"
  | "characters"
  | "scenes"
  | "props"
  | "settings"
  | "episode"
  | "preview";

export type ManjuPhase = "preparation" | "script" | "production" | "completed";

export const MANJU_PHASES: { id: ManjuPhase; label: string }[] = [
  { id: "preparation", label: "筹备" },
  { id: "script", label: "剧本" },
  { id: "production", label: "制作" },
  { id: "completed", label: "完成" },
];

export function manjuStudioHref(
  projectId: string,
  section: ManjuStudioSection,
  opts?: { epId?: string | null },
): string {
  const base = `/manju/${projectId}`;
  switch (section) {
    case "overview":
      return base;
    case "source":
      return `${base}/source`;
    case "characters":
      return `${base}/characters`;
    case "scenes":
      return `${base}/scenes`;
    case "props":
      return `${base}/props`;
    case "settings":
      return `${base}/settings`;
    case "preview":
      return `${base}/preview`;
    case "episode":
      return opts?.epId
        ? `${base}/episodes/${opts.epId}`
        : `${base}/episodes`;
    default:
      return base;
  }
}

/** Map legacy `?step=` / `?panel=` workbench URLs → studio paths. */
export function legacyQueryToStudioPath(
  projectId: string,
  search: URLSearchParams,
): string | null {
  const step = search.get("step");
  const panel = search.get("panel");
  const ep = search.get("ep");
  const kind = search.get("kind");
  const view = search.get("view");

  if (!step && !panel) return null;

  if (panel === "characters" || kind === "character") {
    return manjuStudioHref(projectId, "characters");
  }
  if (panel === "scenes" || kind === "scene") {
    return manjuStudioHref(projectId, "scenes");
  }
  if (panel === "props" || kind === "prop") {
    return manjuStudioHref(projectId, "props");
  }
  if (panel === "overview" || step === "script") {
    return manjuStudioHref(projectId, "source");
  }
  if (step === "video-settings") {
    return manjuStudioHref(projectId, "settings");
  }
  if (step === "assets") {
    return manjuStudioHref(projectId, "characters");
  }
  if (
    step === "storyboard-script" ||
    step === "storyboard-video" ||
    panel === "timeline" ||
    panel === "prompts" ||
    view === "prompts"
  ) {
    return ep
      ? manjuStudioHref(projectId, "episode", { epId: ep })
      : `${manjuStudioHref(projectId, "episode")}`;
  }
  if (step === "preview" || panel === "preview") {
    return manjuStudioHref(projectId, "preview");
  }
  return manjuStudioHref(projectId, "overview");
}

export function inferPhase(input: {
  scriptText: string;
  scriptConfirmed: boolean;
  assetsWithImage: number;
  shotsWithVideo: number;
  shotCount: number;
}): ManjuPhase {
  if (input.shotsWithVideo > 0 && input.shotsWithVideo >= input.shotCount && input.shotCount > 0) {
    return "completed";
  }
  if (input.scriptConfirmed || input.shotCount > 0) return "production";
  if (input.scriptText.trim().length >= 20 || input.assetsWithImage > 0) {
    return "script";
  }
  return "preparation";
}
