"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Editor } from "@tiptap/core";
import { useDropzone } from "react-dropzone";
import {
  ArrowUp,
  AtSign,
  Box,
  ChevronDown,
  Eraser,
  Loader2,
  Orbit,
  Plus,
  RectangleHorizontal,
  Music,
  WandSparkles,
  X,
} from "lucide-react";
import { ImageGenIcon, VideoGenIcon } from "./gen-kind-icons";
import { toast } from "@/shared/lib/toast";
import { ensureGenerationNotifyPermission } from "@/shared/lib/generation-notify";
import { watchStudioGeneration } from "@/shared/lib/studio-generation-notify-host";
import { api, apiUpload } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import type { ModelCapabilities } from "@joyai/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComposerModelMenu } from "./composer-model-menu";
import {
  AiPromptEditor,
  getGeneratePayload,
  mentionExpandText,
  normalizeOmniWireMentions,
  optimizePromptText,
  setEditorPlainText,
} from "@/features/ai-prompt";
import { cn } from "@/shared/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ComposerRipple } from "./composer-ripple";
import { AspectRatioGlyph } from "./aspect-ratio-glyph";
import { DurationSlider } from "./duration-slider";
import { consumeStudioRemixSeed } from "./studio-remix-seed";
import {
  durationsFromCapabilities,
  formatQualityLabel,
  i2vFollowsSourceAspect,
  layoutControlsFromCapabilities,
  modelSupportsVideoAudio,
  refModesFromCapabilities,
  resolveResolutionOption,
  showReferenceUpload,
  classifyRefFile,
  probeMediaDurationSec,
  probeImageSize,
  refDropAccept,
  refSlotLimitsFromCapabilities,
  refUploadHint,
  validateRefFileBytes,
  validateRefImageConstraints,
  type AspectOption,
  type RefMediaKind,
  type VideoRefModeId,
} from "./model-options";
import "./creation-composer.css";
import { CanvasRefHoverPreview } from "@/features/canvas/canvas-ref-preview";

type RefMode = VideoRefModeId;

type PublicModel = {
  id: string;
  name: string;
  kind: "image" | "video";
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: {
    platform?: string;
    name?: string;
  };
};

type PendingRef = {
  /** Client-only id for preview / @mention until upload. */
  localId: string;
  /** blob: or remote https preview URL */
  url: string;
  /** Absent when seeded from an existing job asset URL. */
  file?: File;
  /** Already-uploaded asset id (remix / 使用提示词). */
  remoteAssetId?: string;
  mediaKind: RefMediaKind;
  /** Seconds for video/audio; undefined for images. */
  durationSec?: number;
};

function refLabel(kind: RefMediaKind, index1: number) {
  if (kind === "video") return `视频${index1}`;
  if (kind === "audio") return `音频${index1}`;
  return `图片${index1}`;
}

function refMentionLabel(kind: RefMediaKind, index1: number) {
  if (kind === "video") return `@视频${index1}`;
  if (kind === "audio") return `@音频${index1}`;
  return `@图片${index1}`;
}

function revokeIfBlob(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function guessRefMediaKind(url: string): RefMediaKind {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)) return "audio";
  return "image";
}

function buildPendingRefs(
  urls: string[] | undefined,
  assetIds?: string[],
): PendingRef[] {
  if (!urls?.length) return [];
  return urls.flatMap((url, i) => {
    const u = String(url || "").trim();
    if (!u) return [];
    return [
      {
        localId: crypto.randomUUID(),
        url: u,
        remoteAssetId: assetIds?.[i],
        mediaKind: guessRefMediaKind(u),
      } satisfies PendingRef,
    ];
  });
}

type ComposerBoot = {
  prompt: string;
  refs: PendingRef[];
  type: "image" | "video" | null;
};

function readComposerBoot(opts: {
  promptSeed?: string;
  refSeed?: string[];
  refAssetIdSeed?: string[];
  kindSeed?: "image" | "video";
  initialPrompt?: string;
  searchType: string | null;
  searchPrompt: string | null;
}): ComposerBoot {
  const stored =
    typeof window !== "undefined" ? consumeStudioRemixSeed() : null;
  // Explicit `promptSeed` (including "") wins — 「用作参考图」seeds refs with empty prompt.
  const prompt = normalizeOmniWireMentions(
    opts.promptSeed !== undefined
      ? opts.promptSeed
      : stored?.prompt ||
        opts.searchPrompt ||
        opts.initialPrompt ||
        "",
  ).trim();
  const refUrls =
    opts.refSeed && opts.refSeed.length > 0
      ? opts.refSeed
      : (stored?.refs ?? []);
  const type: "image" | "video" | null =
    opts.kindSeed === "video" || opts.kindSeed === "image"
      ? opts.kindSeed
      : opts.searchType === "video" || opts.searchType === "image"
        ? opts.searchType
        : stored?.type === "video" || stored?.type === "image"
          ? stored.type
          : null;
  return {
    prompt,
    refs: buildPendingRefs(refUrls, opts.refAssetIdSeed),
    type,
  };
}

type Props = {
  variant?: "hero" | "dock";
  className?: string;
  /** Dock only: slim bar while the feed is scrolled away from bottom. */
  compact?: boolean;
  initialPrompt?: string;
  onSubmitted?: () => void;
  promptSeed?: string;
  /** Remote reference URLs to seed (e.g. 使用提示词). */
  refSeed?: string[];
  refAssetIdSeed?: string[];
  kindSeed?: "image" | "video";
  /** Lock image/video (AI tools detail). */
  lockedKind?: "image" | "video";
  /** Wrap / replace the editor text before POST /jobs. */
  buildPrompt?: (userText: string) => string;
  placeholder?: string;
  /** Require at least this many image refs before send. */
  minImageRefs?: number;
  preferredAspect?: string;
  /** Fired after the job is queued (for tool result panes). */
  onJobCreated?: (jobId: string) => void;
};

const COMPOSER_PREFS_KEY = "joyai.studio.composer.prefs";
/** @deprecated migrated into prefs.kind */
const COMPOSER_KIND_KEY_LEGACY = "joyai.studio.composer.kind";

type KindPrefs = {
  modelId?: string;
  aspect?: string;
  imageQuality?: string;
  videoQuality?: string;
  pixelSize?: string;
  n?: number;
  duration?: number;
  refMode?: RefMode;
  generateAudio?: boolean;
};

type ComposerPrefs = {
  kind?: "image" | "video";
  image?: KindPrefs;
  video?: KindPrefs;
};

function readPrefs(): ComposerPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COMPOSER_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ComposerPrefs;
      if (parsed && typeof parsed === "object") return parsed;
    }
    const legacy = window.localStorage.getItem(COMPOSER_KIND_KEY_LEGACY);
    if (legacy === "image" || legacy === "video") return { kind: legacy };
  } catch {
    /* ignore */
  }
  return {};
}

function writePrefs(next: ComposerPrefs) {
  try {
    window.localStorage.setItem(COMPOSER_PREFS_KEY, JSON.stringify(next));
    if (next.kind) {
      window.localStorage.setItem(COMPOSER_KIND_KEY_LEGACY, next.kind);
    }
  } catch {
    /* ignore */
  }
}

function patchPrefs(patch: {
  kind?: "image" | "video";
  image?: KindPrefs;
  video?: KindPrefs;
}) {
  const cur = readPrefs();
  writePrefs({
    kind: patch.kind ?? cur.kind,
    image: patch.image ? { ...cur.image, ...patch.image } : cur.image,
    video: patch.video ? { ...cur.video, ...patch.video } : cur.video,
  });
}

function isRefMode(v: string | undefined): v is RefMode {
  return v === "omni" || v === "first_last";
}

/** Migrate legacy prefs ids → current VideoRefModeId. */
function normalizeRefModePref(v: string | undefined): RefMode | undefined {
  if (isRefMode(v)) return v;
  if (v === "first" || v === "subject") return v === "first" ? "first_last" : "omni";
  return undefined;
}

function pickAspect(
  options: AspectOption[],
  preferred: string | undefined,
  kind: "image" | "video",
) {
  if (preferred && options.some((a) => a.id === preferred)) return preferred;
  const flexible = options.find((a) => a.flexible);
  if (flexible) return flexible.id;
  const prefer =
    kind === "video"
      ? options.find((a) => a.id === "16:9")
      : options.find((a) => a.id === "1:1");
  return prefer?.id ?? options[0]?.id ?? (kind === "video" ? "16:9" : "1:1");
}

function pickResolution(
  options: { id: string }[],
  preferred: string | undefined,
  kind: "image" | "video",
) {
  if (preferred && options.some((r) => r.id === preferred)) return preferred;
  const prefer =
    kind === "image"
      ? options.find((r) => /2k/i.test(r.id)) ??
        options.find((r) => /2/i.test(r.id))
      : options.find((r) => /720p/i.test(r.id));
  return prefer?.id ?? options[0]?.id ?? (kind === "image" ? "2K" : "720p");
}

function pickDuration(options: number[], preferred: number | undefined) {
  if (!options.length) return preferred ?? 5;
  if (preferred != null && options.includes(preferred)) return preferred;
  if (preferred != null && Number.isFinite(preferred)) {
    let best = options[0]!;
    let bestDist = Math.abs(preferred - best);
    for (const o of options) {
      const d = Math.abs(preferred - o);
      if (d < bestDist) {
        best = o;
        bestDist = d;
      }
    }
    return best;
  }
  return options.includes(5) ? 5 : (options[0] ?? 4);
}

function initialComposerKind(searchType: string | null): "image" | "video" {
  if (searchType === "video" || searchType === "image") return searchType;
  return "image";
}

function firstModelId(models: PublicModel[], kind: "image" | "video") {
  return models.find((m) => m.kind === kind)?.id ?? "";
}

function resolveModelId(
  models: PublicModel[],
  kind: "image" | "video",
  preferred?: string | null,
) {
  if (preferred && models.some((m) => m.id === preferred && m.kind === kind)) {
    return preferred;
  }
  return firstModelId(models, kind);
}

/** 括号内展示渠道名（非模型原厂） */
function modelChannelLabel(m: PublicModel) {
  return m.channel?.name?.trim() || null;
}

function modelBrandMeta(m: PublicModel) {
  return {
    icon: modelIconSrc({ remoteId: m.remoteId, name: m.name }),
    channel: modelChannelLabel(m),
  };
}

export function CreationComposer({
  variant = "hero",
  className,
  compact = false,
  initialPrompt = "",
  onSubmitted,
  promptSeed,
  refSeed,
  refAssetIdSeed,
  kindSeed,
  lockedKind,
  buildPrompt,
  placeholder: placeholderProp,
  minImageRefs = 0,
  preferredAspect,
  onJobCreated,
}: Props) {
  const search = useSearchParams();
  const bootRef = useRef<ComposerBoot | null>(null);
  if (bootRef.current == null) {
    bootRef.current = readComposerBoot({
      promptSeed,
      refSeed,
      refAssetIdSeed,
      kindSeed,
      initialPrompt,
      searchType: search.get("type"),
      searchPrompt: search.get("prompt"),
    });
  }
  const boot = bootRef.current;

  const [refs, setRefs] = useState<PendingRef[]>(() => boot.refs);
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const [prompt, setPrompt] = useState(() => boot.prompt);
  const [kind, setKind] = useState<"image" | "video">(() =>
    lockedKind ??
    (boot.type === "video" || boot.type === "image"
      ? boot.type
      : initialComposerKind(search.get("type"))),
  );
  const [aspect, setAspect] = useState(() =>
    preferredAspect ||
    ((boot.type ?? lockedKind ?? initialComposerKind(search.get("type"))) ===
    "video"
      ? "16:9"
      : "1:1"),
  );
  const [n, setN] = useState(() =>
    (boot.type ?? initialComposerKind(search.get("type"))) === "video" ? 1 : 2,
  );
  const [imageQuality, setImageQuality] = useState("2K");
  const [videoQuality, setVideoQuality] = useState("720p");
  const [pixelSize, setPixelSize] = useState("");
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [refMode, setRefMode] = useState<RefMode>("omni");
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [composerHovered, setComposerHovered] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const seeded = useRef(Boolean(boot.prompt || boot.refs.length));
  const [refsExpanded, setRefsExpanded] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  /** After file picker, keep stacked until pointer leaves the ref area. */
  const suppressExpandRef = useRef(false);

  const kindModels = useMemo(
    () => models.filter((m) => m.kind === kind),
    [models, kind],
  );

  const selectedModel = kindModels.find((m) => m.id === modelId);
  const caps = selectedModel?.capabilities ?? null;

  const layout = useMemo(
    () => layoutControlsFromCapabilities(caps, kind),
    [caps, kind],
  );
  const ratioLockedToRef =
    kind === "video" &&
    refs.some((r) => r.mediaKind === "image") &&
    (i2vFollowsSourceAspect(caps) ||
      /kling-3\.0-turbo|kling-v3-turbo/i.test(
        selectedModel?.remoteId ?? "",
      ));
  const showRatio = layout.showRatio && !ratioLockedToRef;
  const aspectOptions = layout.aspects;
  const resolutionOptions = layout.resolutions;
  const sizeOptions = layout.sizes;
  const durationOptions = useMemo(
    () => durationsFromCapabilities(caps),
    [caps],
  );
  const showVideoAudioToggle =
    kind === "video" && modelSupportsVideoAudio(caps);
  const refModes = useMemo(
    () => (kind === "video" ? refModesFromCapabilities(caps) : []),
    [caps, kind],
  );
  const refLimits = useMemo(
    () =>
      refSlotLimitsFromCapabilities(caps, {
        kind,
        refMode: kind === "video" ? refMode : undefined,
      }),
    [caps, kind, refMode],
  );
  const canUploadRef = useMemo(
    () => showReferenceUpload(caps, kind),
    [caps, kind],
  );

  const selectedAspect =
    aspectOptions.find((a) => a.id === aspect) ?? aspectOptions[0];
  const selectedResolution =
    resolutionOptions.find((r) =>
      kind === "image" ? r.id === imageQuality : r.id === videoQuality,
    ) ?? resolutionOptions[0];
  const selectedSize =
    sizeOptions.find((s) => s.id === pixelSize) ?? sizeOptions[0];

  const selectedBrand = selectedModel
    ? modelBrandMeta(selectedModel)
    : { icon: null as string | null, channel: null as string | null };
  const refModeLabel =
    refModes.find((m) => m.id === refMode)?.label ??
    refModes[0]?.label ??
    "全能参考";
  const qualityLabel = selectedResolution
    ? formatQualityLabel(selectedResolution, kind)
    : kind === "image"
      ? "2K"
      : "720P";
  const layoutChipLabel = showRatio
    ? (selectedAspect?.label ?? aspect)
    : layout.showSizePicker
      ? (selectedSize?.label ?? (pixelSize || "尺寸"))
      : ratioLockedToRef
        ? "跟首帧"
        : qualityLabel;

  // Clamp params when model / catalog options change
  useEffect(() => {
    if (!showRatio || !aspectOptions.length) return;
    setAspect((prev) =>
      pickAspect(aspectOptions, preferredAspect ?? prev, kind),
    );
  }, [showRatio, aspectOptions, kind, preferredAspect]);

  useEffect(() => {
    if (!layout.showResolution || !resolutionOptions.length) return;
    if (kind === "image") {
      setImageQuality((prev) =>
        pickResolution(resolutionOptions, prev, "image"),
      );
    } else {
      setVideoQuality((prev) =>
        pickResolution(resolutionOptions, prev, "video"),
      );
    }
  }, [layout.showResolution, resolutionOptions, kind]);

  useEffect(() => {
    if (!layout.showSizePicker || !sizeOptions.length) return;
    setPixelSize((prev) =>
      prev && sizeOptions.some((s) => s.id === prev)
        ? prev
        : (sizeOptions[0]?.id ?? ""),
    );
  }, [layout.showSizePicker, sizeOptions]);

  useEffect(() => {
    if (kind !== "video" || !durationOptions.length) return;
    setDuration((prev) => pickDuration(durationOptions, prev));
  }, [durationOptions, kind]);

  useEffect(() => {
    if (kind !== "video") return;
    if (!refModes.length) return;
    setRefMode((prev) =>
      refModes.some((m) => m.id === prev) ? prev : refModes[0]!.id,
    );
  }, [kind, refModes]);

  useEffect(() => {
    if (canUploadRef) return;
    setRefs((prev) => {
      for (const r of prev) revokeIfBlob(r.url);
      return [];
    });
  }, [canUploadRef]);

  useEffect(() => {
    if (kind === "video") return;
    setRefs((prev) => {
      const keep = prev.filter((r) => r.mediaKind === "image");
      if (keep.length === prev.length) return prev;
      for (const r of prev) {
        if (r.mediaKind !== "image") revokeIfBlob(r.url);
      }
      return keep;
    });
  }, [kind]);

  useEffect(() => {
    return () => {
      for (const r of refsRef.current) revokeIfBlob(r.url);
    };
  }, []);

  const mentionItems = useMemo(() => {
    const counters = { image: 0, video: 0, audio: 0 };
    return refs.map((r) => {
      counters[r.mediaKind] += 1;
      const index1 = counters[r.mediaKind];
      return {
        id: r.remoteAssetId || r.localId,
        label: refMentionLabel(r.mediaKind, index1),
        url: r.url,
        mediaKind: r.mediaKind,
        expandText: mentionExpandText(r.mediaKind, index1),
      };
    });
  }, [refs]);

  const placeholder =
    placeholderProp ??
    (kind === "video"
      ? "上传文字、图片/视频/音频或 @ 素材，创造你想生成的视频"
      : "上传文字、图片或 @ 不同图片，创造你想生成的图片");

  function applyKindPrefs(next: "image" | "video", kp: KindPrefs = {}) {
    if (lockedKind && next !== lockedKind) return;
    setKind(next);
    const nextCaps =
      models.find((m) => m.id === (kp.modelId ?? modelId) && m.kind === next)
        ?.capabilities ??
      models.find((m) => m.kind === next)?.capabilities ??
      null;
    const nextLayout = layoutControlsFromCapabilities(nextCaps, next);
    const nextDurations = durationsFromCapabilities(nextCaps);

    if (nextLayout.showRatio) {
      setAspect(pickAspect(nextLayout.aspects, kp.aspect, next));
    }
    if (nextLayout.showResolution) {
      if (next === "video") {
        setVideoQuality(
          pickResolution(nextLayout.resolutions, kp.videoQuality, "video"),
        );
      } else {
        setImageQuality(
          pickResolution(nextLayout.resolutions, kp.imageQuality, "image"),
        );
      }
    }
    if (nextLayout.showSizePicker) {
      const preferred = kp.pixelSize;
      setPixelSize(
        preferred && nextLayout.sizes.some((s) => s.id === preferred)
          ? preferred
          : (nextLayout.sizes[0]?.id ?? ""),
      );
    }
    setN(
      typeof kp.n === "number" && kp.n >= 1 && kp.n <= 4
        ? kp.n
        : next === "video"
          ? 1
          : 2,
    );
    if (next === "video") {
      setDuration(pickDuration(nextDurations, kp.duration));
      setGenerateAudio(kp.generateAudio !== false);
      const nextModes = refModesFromCapabilities(nextCaps);
      const preferred = normalizeRefModePref(kp.refMode);
      setRefMode(
        preferred && nextModes.some((m) => m.id === preferred)
          ? preferred
          : (nextModes[0]?.id ?? "omni"),
      );
    }
    if (kp.modelId) setModelId(kp.modelId);
  }

  function applyKind(next: "image" | "video") {
    const prefs = readPrefs();
    applyKindPrefs(next, prefs[next] ?? {});
    patchPrefs({ kind: next });
  }

  useEffect(() => {
    void api<PublicModel[]>("/models")
      .then((list) => {
        setModels(list);
      })
      .catch(() => {
        /* silent — composer still usable with empty model list */
      });
  }, []);

  // 首屏：seed / URL ?type= 优先，否则从本地恢复工具与参数
  useEffect(() => {
    const prefs = readPrefs();
    const t = search.get("type");
    const nextKind =
      boot.type === "video" || boot.type === "image"
        ? boot.type
        : t === "video" || t === "image"
          ? t
          : prefs.kind === "video"
            ? "video"
            : "image";
    applyKindPrefs(nextKind, prefs[nextKind] ?? {});
    patchPrefs({ kind: nextKind });
    setPrefsHydrated(true);
    // 仅挂载时恢复；后续由下方 type 监听与用户操作驱动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    const t = search.get("type");
    if (t === "video" || t === "image") applyKind(t);
    // applyKind 每轮 render 重建；仅跟随 URL type / 首屏 hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, prefsHydrated]);

  useEffect(() => {
    if (models.length === 0) return;
    setModelId((prev) => {
      const preferred = prev || readPrefs()[kind]?.modelId || null;
      return resolveModelId(models, kind, preferred);
    });
  }, [kind, models]);

  // 参数变更后写回本地（首屏恢复完成后再写，避免覆盖缓存）
  useEffect(() => {
    if (!prefsHydrated) return;
    const slice: KindPrefs = {
      modelId: modelId || undefined,
      aspect: showRatio ? aspect : undefined,
      pixelSize: layout.showSizePicker ? pixelSize : undefined,
      n,
      ...(kind === "image"
        ? { imageQuality: layout.showResolution ? imageQuality : undefined }
        : {
            videoQuality: layout.showResolution ? videoQuality : undefined,
            duration,
            refMode,
            generateAudio: showVideoAudioToggle ? generateAudio : undefined,
          }),
    };
    patchPrefs({
      kind,
      ...(kind === "image" ? { image: slice } : { video: slice }),
    });
  }, [
    prefsHydrated,
    kind,
    modelId,
    aspect,
    pixelSize,
    n,
    imageQuality,
    videoQuality,
    duration,
    generateAudio,
    showVideoAudioToggle,
    refMode,
    layout.showRatio,
    showRatio,
    layout.showSizePicker,
    layout.showResolution,
  ]);

  // Ensure TipTap picks up boot prompt after dynamic editor mounts.
  useEffect(() => {
    if (!seeded.current) return;
    const q = prompt.trim();
    if (!q && refs.length === 0) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const editor = editorRef.current;
      if (!editor) {
        if (tries > 40) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      if (!q) return;
      const current = editor.getText().trim();
      if (current) return;
      const counters = { image: 0, video: 0, audio: 0 };
      const items = refs.map((r) => {
        counters[r.mediaKind] += 1;
        return {
          id: r.remoteAssetId || r.localId,
          label: refMentionLabel(r.mediaKind, counters[r.mediaKind]),
          url: r.url,
          mediaKind: r.mediaKind,
          expandText: mentionExpandText(r.mediaKind, counters[r.mediaKind]),
        };
      });
      setEditorPlainText(editor, q, items);
    }, 50);
    return () => window.clearInterval(timer);
    // Only on mount — boot payload is fixed per composer instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!canUploadRef) {
        toast.error("当前模型不支持参考素材");
        return;
      }
      const limits = refSlotLimitsFromCapabilities(caps, {
        kind,
        refMode: kind === "video" ? refMode : undefined,
      });
      let imageCount = refs.filter((r) => r.mediaKind === "image").length;
      let videoCount = refs.filter((r) => r.mediaKind === "video").length;
      let audioCount = refs.filter((r) => r.mediaKind === "audio").length;
      let videoDurSum = refs
        .filter((r) => r.mediaKind === "video")
        .reduce((s, r) => s + (r.durationSec ?? 0), 0);
      let audioDurSum = refs
        .filter((r) => r.mediaKind === "audio")
        .reduce((s, r) => s + (r.durationSec ?? 0), 0);

      const accepted: PendingRef[] = [];
      for (const file of files) {
        const mediaKind = classifyRefFile(file);
        if (!mediaKind) {
          toast.error(`不支持的文件类型：${file.name}`);
          continue;
        }
        if (mediaKind === "image") {
          if (limits.images != null && imageCount >= limits.images) {
            toast.error(
              refMode === "first_last"
                ? "首尾帧参考最多 2 张图（首帧 + 尾帧）"
                : `当前模型最多 ${limits.images} 张参考图`,
            );
            continue;
          }
          let dims: { width: number; height: number };
          try {
            dims = await probeImageSize(file);
          } catch {
            toast.error(`无法读取「${file.name}」尺寸`);
            continue;
          }
          const dimErr = validateRefImageConstraints(file, dims, limits);
          if (dimErr) {
            toast.error(dimErr);
            continue;
          }
        } else if (mediaKind === "video") {
          if (limits.videos != null && limits.videos <= 0) {
            toast.error("当前模式不支持参考视频");
            continue;
          }
          if (limits.videos != null && videoCount >= limits.videos) {
            toast.error(`当前模型最多 ${limits.videos} 个参考视频`);
            continue;
          }
          const byteErr = validateRefFileBytes(file, "video", limits);
          if (byteErr) {
            toast.error(byteErr);
            continue;
          }
        } else {
          if (limits.audios != null && limits.audios <= 0) {
            toast.error("当前模式不支持参考音频");
            continue;
          }
          if (limits.audios != null && audioCount >= limits.audios) {
            toast.error(`当前模型最多 ${limits.audios} 个参考音频`);
            continue;
          }
          const byteErr = validateRefFileBytes(file, "audio", limits);
          if (byteErr) {
            toast.error(byteErr);
            continue;
          }
        }

        let durationSec: number | undefined;
        if (mediaKind === "video" || mediaKind === "audio") {
          try {
            durationSec = await probeMediaDurationSec(file);
          } catch {
            toast.error(`无法读取「${file.name}」时长`);
            continue;
          }
          if (mediaKind === "video") {
            if (
              limits.minVideoSec != null &&
              durationSec < limits.minVideoSec
            ) {
              toast.error(
                `参考视频至少 ${limits.minVideoSec} 秒（${file.name} 约 ${durationSec.toFixed(1)}s）`,
              );
              continue;
            }
            if (
              limits.maxVideoSec != null &&
              videoDurSum + durationSec > limits.maxVideoSec + 0.05
            ) {
              toast.error(
                `参考视频总时长不能超过 ${limits.maxVideoSec} 秒（已用 ${videoDurSum.toFixed(1)}s）`,
              );
              continue;
            }
          } else if (mediaKind === "audio") {
            if (
              limits.minAudioSec != null &&
              durationSec < limits.minAudioSec
            ) {
              toast.error(
                `参考音频至少 ${limits.minAudioSec} 秒（${file.name} 约 ${durationSec.toFixed(1)}s）`,
              );
              continue;
            }
            if (
              limits.maxAudioSec != null &&
              audioDurSum + durationSec > limits.maxAudioSec + 0.05
            ) {
              toast.error(
                `参考音频总时长不能超过 ${limits.maxAudioSec} 秒（已用 ${audioDurSum.toFixed(1)}s）`,
              );
              continue;
            }
          }
        }

        accepted.push({
          localId: crypto.randomUUID(),
          url: URL.createObjectURL(file),
          file,
          mediaKind,
          durationSec,
        });
        if (mediaKind === "image") imageCount += 1;
        else if (mediaKind === "video") {
          videoCount += 1;
          videoDurSum += durationSec ?? 0;
        } else {
          audioCount += 1;
          audioDurSum += durationSec ?? 0;
        }
      }

      if (accepted.length === 0) return;
      setRefs((prev) => [...prev, ...accepted]);
      // File dialog keeps pointer over the stack — don't auto-expand.
      suppressExpandRef.current = true;
      setRefsExpanded(false);
    },
    [canUploadRef, caps, kind, refMode, refs],
  );

  const dropAccept = useMemo(() => refDropAccept(refLimits), [refLimits]);
  const uploadHint = useMemo(() => refUploadHint(refLimits), [refLimits]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => {
      void onDrop(files);
    },
    accept: dropAccept,
    multiple: true,
    noClick: true,
    disabled: !canUploadRef || !dropAccept,
  });

  useEffect(() => {
    if (refMode !== "first_last") return;
    setRefs((prev) => {
      const images = prev.filter((r) => r.mediaKind === "image");
      const drop = prev.filter((r) => r.mediaKind !== "image");
      if (images.length <= 2 && drop.length === 0) return prev;
      for (const r of [...drop, ...images.slice(2)]) {
        revokeIfBlob(r.url);
      }
      return images.slice(0, 2);
    });
  }, [refMode]);

  function removeRef(localId: string) {
    setRefs((prev) => {
      const target = prev.find((r) => r.localId === localId);
      if (target) revokeIfBlob(target.url);
      const next = prev.filter((r) => r.localId !== localId);
      if (next.length === 0) setRefsExpanded(false);
      return next;
    });
  }

  function insertAtMention() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
  }

  async function submit() {
    const payload = getGeneratePayload(editorRef.current);
    const userText = normalizeOmniWireMentions(
      payload.prompt.trim() || prompt.trim(),
    );
    const promptText = buildPrompt ? buildPrompt(userText).trim() : userText;
    if (!promptText) {
      toast.error(buildPrompt ? "工具提示词未配置" : "请输入提示词");
      return;
    }
    const imageRefCount = refs.filter((r) => r.mediaKind === "image").length;
    if (minImageRefs > 0 && imageRefCount < minImageRefs) {
      toast.error(`请至少上传 ${minImageRefs} 张参考图`);
      return;
    }
    if (refModes.length > 0 && refMode === "first_last" && refs.length < 1) {
      toast.error("首尾帧参考请至少添加 1 张图（建议首帧 + 尾帧共 2 张）");
      return;
    }
    const remoteId = selectedModel?.remoteId ?? "";
    if (
      /gemini[_-]?omni[_-]?flash/i.test(remoteId) &&
      !/official/i.test(remoteId) &&
      imageRefCount === 2
    ) {
      toast.error("Gemini Omni Flash 参考图只支持 1 张或 3 张，不支持 2 张");
      return;
    }
    setSubmitting(true);
    try {
      // Upload pending local files; keep remote seeds as-is
      const uploaded: { localId: string; id: string; url: string }[] = [];
      for (const ref of refs) {
        if (!ref.file) {
          if (/^https?:\/\//i.test(ref.url)) {
            uploaded.push({
              localId: ref.localId,
              id: ref.remoteAssetId || "",
              url: ref.url,
            });
          }
          continue;
        }
        const asset = await apiUpload<{ id: string; url: string }>(
          "/upload",
          ref.file,
        );
        uploaded.push({ localId: ref.localId, id: asset.id, url: asset.url });
      }
      const localToAsset = new Map(
        uploaded.map((u) => [u.localId, u] as const),
      );
      const referenceAssetIds = Array.from(
        new Set(
          [
            ...uploaded.map((u) => u.id),
            ...payload.assetIds.map((id) => localToAsset.get(id)?.id ?? id),
          ].filter(Boolean),
        ),
      );
      const isRemoteUrl = (u: string) => /^https?:\/\//i.test(u);
      const referenceUrls = Array.from(
        new Set(
          [
            ...payload.imageUrls,
            ...(kind === "video" ? payload.videoUrls : []),
            ...(kind === "video" ? payload.audioUrls : []),
          ]
            .map((u) => {
              if (isRemoteUrl(u)) return u;
              // blob preview from @mention → resolve via localId match on refs
              const hit = refs.find((r) => r.url === u);
              return hit ? localToAsset.get(hit.localId)?.url : undefined;
            })
            .filter((u): u is string => Boolean(u && isRemoteUrl(u)))
            // Always persist uploaded ref URLs for feed thumbnails
            .concat(uploaded.map((u) => u.url)),
        ),
      );

      const resolutionOpt = layout.showResolution
        ? (selectedResolution ??
          layout.resolutions[0] ??
          resolveResolutionOption(kind === "image" ? "2K" : "720p"))
        : null;

      if (kind === "image") {
        const input: Record<string, unknown> = {
          prompt: promptText,
          n,
          modelId: modelId || undefined,
          referenceAssetIds,
          referenceUrls,
        };
        if (layout.showRatio && selectedAspect) {
          input.ratio = selectedAspect.id;
        }
        if (resolutionOpt) {
          input.resolution = resolutionOpt.id;
        }
        if (layout.showSizePicker && selectedSize) {
          input.size = selectedSize.id;
          input.width = selectedSize.width;
          input.height = selectedSize.height;
        }
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: { kind: "image", input },
        });
        watchStudioGeneration(job.id, {
          kind: "image",
          modelName: selectedModel?.name,
          prompt: promptText,
        });
        onJobCreated?.(job.id);
      } else {
        const input: Record<string, unknown> = {
          prompt: promptText,
          duration,
          modelId: modelId || undefined,
          referenceAssetIds,
          referenceUrls,
        };
        if (refModes.length > 0) {
          input.refMode = refMode;
        }
        if (showRatio && selectedAspect) {
          input.ratio = selectedAspect.id;
        }
        if (resolutionOpt) {
          input.resolution = resolutionOpt.id;
        }
        if (showVideoAudioToggle) {
          input.generateAudio = generateAudio;
        }
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: { kind: "video", input },
        });
        watchStudioGeneration(job.id, {
          kind: "video",
          modelName: selectedModel?.name,
          prompt: promptText,
        });
        onJobCreated?.(job.id);
      }
      toast.success("任务已提交");
      void ensureGenerationNotifyPermission();
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const imageRefCount = refs.filter((r) => r.mediaKind === "image").length;
  const videoRefCount = refs.filter((r) => r.mediaKind === "video").length;
  const audioRefCount = refs.filter((r) => r.mediaKind === "audio").length;
  const slotOpen = (limit: number | null, used: number) =>
    limit === null ? true : limit > 0 && used < limit;
  const canAddMoreRef =
    slotOpen(refLimits.images, imageRefCount) ||
    slotOpen(refLimits.videos, videoRefCount) ||
    slotOpen(refLimits.audios, audioRefCount);
  const canClearComposer = Boolean(prompt.trim()) || refs.length > 0;
  const canSend = buildPrompt
    ? imageRefCount >= minImageRefs && Boolean(buildPrompt(prompt).trim())
    : Boolean(prompt.trim());

  function clearComposer() {
    for (const r of refsRef.current) revokeIfBlob(r.url);
    setRefs([]);
    setRefsExpanded(false);
    setPrompt("");
    setEditorPlainText(editorRef.current, "");
    editorRef.current?.commands.focus("end");
  }

  async function optimizePrompt() {
    const raw =
      getGeneratePayload(editorRef.current).prompt.trim() || prompt.trim();
    if (!raw || optimizing || submitting) return;
    setOptimizing(true);
    const toastId = toast.loading("正在优化提示词…");
    try {
      const next = await optimizePromptText(raw);
      setEditorPlainText(editorRef.current, next);
      setPrompt(next);
      toast.success("提示词已优化", { id: toastId });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.dismiss(toastId);
        return;
      }
      toast.error(error instanceof Error ? error.message : "优化失败", {
        id: toastId,
      });
    } finally {
      setOptimizing(false);
    }
  }

  const rippleIdle =
    !prompt.trim() &&
    refs.length === 0 &&
    !editorFocused &&
    !composerHovered &&
    !isDragActive &&
    !paramsOpen;

  return (
    <div
      className={cn(
        "joy-composer-wrap",
        compact && !editorFocused && "is-compact",
        className,
      )}
    >
      <div
        {...getRootProps()}
        className={cn(
          "joy-composer",
          variant === "hero" ? "is-hero" : "is-dock",
          compact && !editorFocused && "is-compact",
          isDragActive && "is-dragging",
        )}
        onMouseEnter={() => setComposerHovered(true)}
        onMouseLeave={() => setComposerHovered(false)}
      >
        <input {...getInputProps()} />
        <ComposerRipple idle={rippleIdle} />
        {canClearComposer ? (
          <button
            type="button"
            className="joy-composer-clear"
            aria-label="清除输入与参考素材"
            title="清除"
            onClick={(e) => {
              e.stopPropagation();
              clearComposer();
            }}
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
        <div className="joy-composer-body">
          {canUploadRef ? (
            <div
              className={cn(
                "joy-composer-ref-stack",
                refsExpanded && "is-open",
                refs.length === 0 && "is-empty",
              )}
              data-count={refs.length}
              aria-label="参考内容"
              onMouseEnter={() => {
                if (suppressExpandRef.current) return;
                if (refs.length > 0) setRefsExpanded(true);
              }}
              onMouseLeave={() => {
                suppressExpandRef.current = false;
                setRefsExpanded(false);
              }}
              onBlurCapture={(e) => {
                if (
                  !e.currentTarget.contains(e.relatedTarget as Node | null)
                ) {
                  setRefsExpanded(false);
                }
              }}
            >
              <div className="joy-composer-ref-fan">
                <div
                  className={cn(
                    "joy-composer-ref-fan-layer",
                    refsExpanded && "is-open",
                  )}
                  style={
                    {
                      ["--ref-n"]: String(refs.length),
                      ["--ref-slots"]: String(
                        refs.length + (canAddMoreRef ? 1 : 0),
                      ),
                    } as Record<string, string>
                  }
                >
                  {canAddMoreRef ? (
                    <button
                      type="button"
                      className={cn(
                        "joy-composer-upload",
                        refs.length === 0
                          ? "is-empty"
                          : refsExpanded
                            ? "is-card"
                            : "is-fab",
                      )}
                      onClick={open}
                      aria-label={
                        refs.length === 0
                          ? `添加${uploadHint}`
                          : "继续添加参考素材"
                      }
                    >
                      <Plus className="h-4 w-4" strokeWidth={1.75} />
                      {refs.length === 0 || refsExpanded ? (
                        <span className="joy-composer-upload-label">
                          {uploadHint}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {refs.map((ref, i) => {
                    const typeIndex =
                      refs
                        .slice(0, i + 1)
                        .filter((r) => r.mediaKind === ref.mediaKind).length;
                    const label = refLabel(ref.mediaKind, typeIndex);
                    return (
                      <CanvasRefHoverPreview
                        key={ref.localId}
                        kind={ref.mediaKind}
                        url={ref.url}
                        className={cn(
                          "joy-composer-ref-card",
                          `is-${ref.mediaKind}`,
                          i % 2 === 0 ? "is-tilt-a" : "is-tilt-b",
                        )}
                        thumbClassName="size-full"
                        preview={
                          ref.mediaKind === "image" || ref.mediaKind === "video"
                        }
                        style={
                          {
                            ["--ref-i"]: String(i),
                            ["--ref-x"]: String(canAddMoreRef ? i + 1 : i),
                          } as Record<string, string>
                        }
                      >
                        {ref.mediaKind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ref.url} alt="" />
                        ) : ref.mediaKind === "video" ? (
                          <video
                            src={ref.url}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <span className="joy-composer-ref-audio">
                            <Music className="h-5 w-5" strokeWidth={1.5} />
                          </span>
                        )}
                        <button
                          type="button"
                          className="joy-composer-ref-remove"
                          aria-label={`移除${label}`}
                          onClick={() => removeRef(ref.localId)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="joy-composer-ref-index">
                          {label}
                          {ref.durationSec != null
                            ? ` · ${Math.round(ref.durationSec)}s`
                            : ""}
                        </span>
                      </CanvasRefHoverPreview>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div className="joy-composer-main">
            <div
              onFocusCapture={() => setEditorFocused(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setEditorFocused(false);
                }
              }}
            >
              <AiPromptEditor
                editorRef={editorRef}
                initialText={prompt}
                mentionItems={mentionItems}
                placeholder={placeholder}
                disabled={submitting || optimizing}
                onPlainChange={setPrompt}
                onKindCommand={(next) => {
                  if (lockedKind) return;
                  if (next === "image" || next === "video") applyKind(next);
                }}
              />
            </div>
          </div>
        </div>

        <div className="joy-composer-toolbar">
          <div className="joy-composer-toolbar-left">
            {lockedKind ? (
              <button type="button" className="joy-chip joy-chip-kind" disabled>
                {kind === "image" ? (
                  <ImageGenIcon className="h-4 w-4 text-[16px]" />
                ) : (
                  <VideoGenIcon className="h-4 w-4 text-[16px]" />
                )}
                {kind === "image" ? "图片生成" : "视频生成"}
              </button>
            ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="joy-chip joy-chip-kind">
                  {kind === "image" ? (
                    <ImageGenIcon className="h-4 w-4 text-[16px]" />
                  ) : (
                    <VideoGenIcon className="h-4 w-4 text-[16px]" />
                  )}
                  {kind === "image" ? "图片生成" : "视频生成"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[148px]">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => applyKind("image")}
                >
                  <ImageGenIcon className="h-4 w-4 text-[16px]" />
                  图片生成
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => applyKind("video")}
                >
                  <VideoGenIcon className="h-4 w-4 text-[16px]" />
                  视频生成
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}

            <ComposerModelMenu
              models={kindModels}
              selectedId={modelId}
              onSelect={setModelId}
            >
              <button type="button" className="joy-chip joy-chip-model">
                {selectedModel ? (
                  <BrandAvatar
                    src={selectedBrand.icon}
                    label={selectedModel.name}
                    size={16}
                    rounded="md"
                  />
                ) : (
                  <Box className="h-3.5 w-3.5 opacity-80" />
                )}
                <span className="joy-chip-model-name">
                  {selectedModel
                    ? selectedBrand.channel
                      ? `${selectedModel.name}（${selectedBrand.channel}）`
                      : selectedModel.name
                    : "选择模型"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </ComposerModelMenu>

            {kind === "video" && refModes.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="joy-chip">
                    <Orbit className="h-3.5 w-3.5 opacity-80" />
                    {refModeLabel}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {refModes.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setRefMode(m.id)}
                    >
                      {m.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <DropdownMenu open={paramsOpen} onOpenChange={setParamsOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="joy-chip-params-pill"
                  aria-label="生成参数"
                >
                  {showRatio || layout.showSizePicker || ratioLockedToRef ? (
                    <span className="joy-chip-params-seg">
                      <RectangleHorizontal className="h-3.5 w-3.5 opacity-70" />
                      {ratioLockedToRef ? "跟首帧" : layoutChipLabel}
                    </span>
                  ) : null}
                  {layout.showResolution ? (
                    <>
                      {showRatio ||
                      layout.showSizePicker ||
                      ratioLockedToRef ? (
                        <span className="joy-chip-params-sep" aria-hidden />
                      ) : null}
                      <span className="joy-chip-params-seg">{qualityLabel}</span>
                    </>
                  ) : null}
                  {kind === "video" ? (
                    <>
                      {showRatio ||
                      layout.showSizePicker ||
                      layout.showResolution ||
                      ratioLockedToRef ? (
                        <span className="joy-chip-params-sep" aria-hidden />
                      ) : null}
                      <span className="joy-chip-params-seg">{duration}s</span>
                    </>
                  ) : null}
                  {showVideoAudioToggle ? (
                    <>
                      {showRatio ||
                      layout.showSizePicker ||
                      layout.showResolution ||
                      ratioLockedToRef ||
                      kind === "video" ? (
                        <span className="joy-chip-params-sep" aria-hidden />
                      ) : null}
                      <span
                        className={cn(
                          "joy-chip-params-seg",
                          !generateAudio && "is-muted",
                        )}
                      >
                        {generateAudio ? "音频" : "无音频"}
                      </span>
                    </>
                  ) : null}
                  <>
                    {showRatio ||
                    layout.showSizePicker ||
                    layout.showResolution ||
                    ratioLockedToRef ||
                    kind === "video" ||
                    showVideoAudioToggle ? (
                      <span className="joy-chip-params-sep" aria-hidden />
                    ) : null}
                    <span className="joy-chip-params-seg">
                      {n}
                      {kind === "image" ? "张" : "条"}
                    </span>
                  </>
                  <ChevronDown className="joy-chip-params-caret h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="joy-composer-params-menu p-0 w-[min(300px,calc(100vw-48px))]"
              >
                <div className="joy-composer-params-panel">
                  {showRatio ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">比例</span>
                      <div className="joy-composer-params-options is-aspect">
                        {aspectOptions.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={cn(
                              "joy-composer-params-option is-aspect",
                              aspect === a.id && "is-on",
                            )}
                            onClick={() => setAspect(a.id)}
                          >
                            <AspectRatioGlyph ratio={a.id} />
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : ratioLockedToRef ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">比例</span>
                      <span className="joy-composer-params-hint text-muted-foreground text-xs">
                        有参考图时跟随首帧比例
                      </span>
                    </div>
                  ) : null}
                  {layout.showSizePicker ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">尺寸</span>
                      <div className="joy-composer-params-options">
                        {sizeOptions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={cn(
                              "joy-composer-params-option",
                              pixelSize === s.id && "is-on",
                            )}
                            onClick={() => setPixelSize(s.id)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {layout.showResolution ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">
                        {kind === "video" ? "分辨率" : "清晰度"}
                      </span>
                      <div className="joy-composer-params-options">
                        {resolutionOptions.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className={cn(
                              "joy-composer-params-option",
                              (kind === "image"
                                ? imageQuality === r.id
                                : videoQuality === r.id) && "is-on",
                            )}
                            onClick={() => {
                              if (kind === "image") setImageQuality(r.id);
                              else setVideoQuality(r.id);
                            }}
                          >
                            {formatQualityLabel(r, kind)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {kind === "video" && durationOptions.length > 0 ? (
                    <div className="joy-composer-params-row is-duration">
                      <span className="joy-composer-params-label">时长</span>
                      <div className="joy-composer-params-duration">
                        {durationOptions.length === 1 ? (
                          <div className="joy-composer-params-slider-fixed">
                            {durationOptions[0]}s
                          </div>
                        ) : (
                          <DurationSlider
                            options={durationOptions}
                            value={duration}
                            onChange={setDuration}
                            className="joy-composer-params-duration-slider"
                          />
                        )}
                        <span className="joy-composer-params-duration-value">
                          <span className="joy-composer-params-duration-num">
                            {duration}
                          </span>
                          <span className="joy-composer-params-duration-unit">
                            s
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {showVideoAudioToggle ? (
                    <div className="joy-composer-params-row is-switch">
                      <span className="joy-composer-params-label">音频</span>
                      <Switch
                        checked={generateAudio}
                        onCheckedChange={setGenerateAudio}
                        aria-label={generateAudio ? "关闭音频" : "开启音频"}
                        className="joy-composer-params-switch"
                      />
                    </div>
                  ) : null}
                  <div className="joy-composer-params-row">
                    <span className="joy-composer-params-label">数量</span>
                    <div className="joy-composer-params-options">
                      {[1, 2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={cn(
                            "joy-composer-params-option",
                            n === count && "is-on",
                          )}
                          onClick={() => setN(count)}
                        >
                          {count}
                          {kind === "image" ? "张" : "条"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              className="joy-chip joy-chip-icon"
              aria-label="引用素材"
              onClick={insertAtMention}
            >
              <AtSign className="h-4 w-4" />
            </button>
          </div>

          <div className="joy-composer-toolbar-right">
            <button
              type="button"
              className={cn(
                "joy-composer-optimize",
                Boolean(prompt.trim()) && !submitting && !optimizing && "is-ready",
              )}
              disabled={!prompt.trim() || submitting || optimizing}
              aria-label="提示词优化"
              title="提示词优化"
              onClick={() => void optimizePrompt()}
            >
              {optimizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <WandSparkles className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              className={cn("joy-composer-send", canSend && "is-ready")}
              disabled={submitting || optimizing || !canSend}
              onClick={() => void submit()}
              aria-label="生成"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_ASPECTS as ASPECTS } from "./model-options";
