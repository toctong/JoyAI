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
  Clock,
  ImageIcon,
  Loader2,
  Orbit,
  Plus,
  RectangleHorizontal,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { toast } from "@/shared/lib/toast";
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
import {
  AiPromptEditor,
  getGeneratePayload,
  setEditorPlainText,
} from "@/features/ai-prompt";
import { SLASH_COMMANDS } from "@/features/ai-prompt/slash-items";
import { cn } from "@/shared/lib/utils";
import { ComposerRipple } from "./composer-ripple";
import {
  durationsFromCapabilities,
  formatQualityLabel,
  layoutControlsFromCapabilities,
  refModesFromCapabilities,
  resolveResolutionOption,
  showReferenceUpload,
  type AspectOption,
  type VideoRefModeId,
} from "./model-options";
import "./creation-composer.css";

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

type UploadedRef = { id: string; url: string };

type Props = {
  variant?: "hero" | "dock";
  className?: string;
  initialPrompt?: string;
  onSubmitted?: () => void;
  promptSeed?: string;
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
  if (preferred != null && options.includes(preferred)) return preferred;
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
  initialPrompt = "",
  onSubmitted,
  promptSeed,
}: Props) {
  const search = useSearchParams();
  const [refs, setRefs] = useState<UploadedRef[]>([]);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [kind, setKind] = useState<"image" | "video">(() =>
    initialComposerKind(search.get("type")),
  );
  const [aspect, setAspect] = useState(() =>
    initialComposerKind(search.get("type")) === "video" ? "16:9" : "1:1",
  );
  const [n, setN] = useState(() =>
    initialComposerKind(search.get("type")) === "video" ? 1 : 2,
  );
  const [imageQuality, setImageQuality] = useState("2K");
  const [videoQuality, setVideoQuality] = useState("720p");
  const [pixelSize, setPixelSize] = useState("");
  const [duration, setDuration] = useState(5);
  const [refMode, setRefMode] = useState<RefMode>("omni");
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [composerHovered, setComposerHovered] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const seeded = useRef(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);

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
  const aspectOptions = layout.aspects;
  const resolutionOptions = layout.resolutions;
  const sizeOptions = layout.sizes;
  const durationOptions = useMemo(
    () => durationsFromCapabilities(caps),
    [caps],
  );
  const maxRefImages = caps?.maxRefImages;
  const refModes = useMemo(
    () => (kind === "video" ? refModesFromCapabilities(caps) : []),
    [caps, kind],
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
  const layoutChipLabel = layout.showRatio
    ? (selectedAspect?.label ?? aspect)
    : layout.showSizePicker
      ? (selectedSize?.label ?? pixelSize || "尺寸")
      : qualityLabel;

  // Clamp params when model / catalog options change
  useEffect(() => {
    if (!layout.showRatio || !aspectOptions.length) return;
    setAspect((prev) => pickAspect(aspectOptions, prev, kind));
  }, [layout.showRatio, aspectOptions, kind]);

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
    setRefs([]);
  }, [canUploadRef]);

  const mentionItems = useMemo(
    () =>
      refs.map((r, i) => ({
        id: r.id,
        label: `@图${i + 1}`,
        url: r.url,
        mediaKind: "image" as const,
      })),
    [refs],
  );

  const placeholder =
    kind === "video"
      ? "上传文字、图片或 @ 素材，创造你想生成的视频"
      : "上传文字、图片或 @ 不同图片，创造你想生成的图片";

  function applyKindPrefs(next: "image" | "video", kp: KindPrefs = {}) {
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
        if (list.length === 0) {
          toast.message("暂无可用模型，请先在运维后台启用渠道与模型");
        }
      })
      .catch(() => {
        toast.error("加载模型列表失败");
      });
  }, []);

  // 首屏：URL ?type= 优先，否则从本地恢复工具与参数
  useEffect(() => {
    const prefs = readPrefs();
    const t = search.get("type");
    const nextKind =
      t === "video" || t === "image"
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
      aspect: layout.showRatio ? aspect : undefined,
      pixelSize: layout.showSizePicker ? pixelSize : undefined,
      n,
      ...(kind === "image"
        ? { imageQuality: layout.showResolution ? imageQuality : undefined }
        : {
            videoQuality: layout.showResolution ? videoQuality : undefined,
            duration,
            refMode,
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
    refMode,
    layout.showRatio,
    layout.showSizePicker,
    layout.showResolution,
  ]);

  useEffect(() => {
    const q = promptSeed || search.get("prompt") || initialPrompt;
    if (!q || seeded.current) return;
    seeded.current = true;
    setPrompt(q);
    const t = window.setTimeout(
      () => setEditorPlainText(editorRef.current, q),
      0,
    );
    return () => window.clearTimeout(t);
  }, [search, initialPrompt, promptSeed]);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!canUploadRef) {
        toast.error("当前模型不支持参考图");
        return;
      }
      try {
        const limit =
          typeof maxRefImages === "number" && maxRefImages > 0
            ? maxRefImages
            : refMode === "first_last"
              ? 2
              : undefined;
        let accepted = files;
        if (typeof limit === "number" && limit > 0) {
          const room = Math.max(0, limit - refs.length);
          if (room <= 0) {
            toast.error(
              refMode === "first_last"
                ? "首尾帧参考最多 2 张图（首帧 + 尾帧）"
                : `当前模型最多 ${limit} 张参考图`,
            );
            return;
          }
          if (files.length > room) {
            toast.message(
              refMode === "first_last"
                ? `首尾帧参考最多 2 张图，已截取前 ${room} 张`
                : `当前模型最多 ${limit} 张参考图，已截取前 ${room} 张`,
            );
            accepted = files.slice(0, room);
          }
        }
        for (const file of accepted) {
          const asset = await apiUpload<UploadedRef>("/upload", file);
          setRefs((prev) => [...prev, { id: asset.id, url: asset.url }]);
        }
        toast.success("参考图已上传");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "上传失败");
      }
    },
    [canUploadRef, maxRefImages, refMode, refs.length],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => void onDrop(files),
    accept: { "image/*": [] },
    multiple: true,
    noClick: true,
    disabled: !canUploadRef,
  });

  useEffect(() => {
    if (refMode !== "first_last") return;
    setRefs((prev) => (prev.length > 2 ? prev.slice(0, 2) : prev));
  }, [refMode]);

  function insertAtMention() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
  }

  function applySkill(cmd: (typeof SLASH_COMMANDS)[number]) {
    if (cmd.kind) {
      applyKind(cmd.kind);
      toast.message(cmd.kind === "image" ? "已切换图片生成" : "已切换视频生成");
      return;
    }
    if (!cmd.insert) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent(cmd.insert).run();
    setPrompt(editor.getText());
  }

  async function submit() {
    const payload = getGeneratePayload(editorRef.current);
    const promptText = payload.prompt.trim() || prompt.trim();
    if (!promptText) {
      toast.error("请输入提示词");
      return;
    }
    setSubmitting(true);
    try {
      const referenceAssetIds = Array.from(
        new Set([...refs.map((r) => r.id), ...payload.assetIds]),
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
          referenceUrls: payload.imageUrls,
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
        await api("/jobs", {
          method: "POST",
          body: { kind: "image", input },
        });
      } else {
        if (refModes.length > 0 && refMode === "first_last" && refs.length < 1) {
          toast.error("首尾帧参考请至少上传 1 张图（建议首帧 + 尾帧共 2 张）");
          setSubmitting(false);
          return;
        }
        const input: Record<string, unknown> = {
          prompt: promptText,
          duration,
          modelId: modelId || undefined,
          referenceAssetIds,
          referenceUrls: [...payload.imageUrls, ...payload.videoUrls],
        };
        if (refModes.length > 0) {
          input.refMode = refMode;
        }
        if (layout.showRatio && selectedAspect) {
          input.ratio = selectedAspect.id;
        }
        if (resolutionOpt) {
          input.resolution = resolutionOpt.id;
        }
        await api("/jobs", {
          method: "POST",
          body: { kind: "video", input },
        });
      }
      toast.success("任务已提交");
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const cost = kind === "image" ? n : Math.max(1, Math.round(duration / 2));
  const skillChips = SLASH_COMMANDS.filter((c) => c.insert || c.kind).slice(
    0,
    5,
  );
  const rippleIdle =
    !prompt.trim() &&
    refs.length === 0 &&
    !editorFocused &&
    !composerHovered &&
    !isDragActive &&
    !paramsOpen;

  return (
    <div className={cn("joy-composer-wrap", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "joy-composer",
          variant === "hero" ? "is-hero" : "is-dock",
          isDragActive && "is-dragging",
        )}
        onMouseEnter={() => setComposerHovered(true)}
        onMouseLeave={() => setComposerHovered(false)}
      >
        <input {...getInputProps()} />
        <ComposerRipple idle={rippleIdle} />
        <div className="joy-composer-body">
          {canUploadRef ? (
            <button
              type="button"
              className={cn(
                "joy-composer-upload",
                refs[0] && "has-preview",
              )}
              onClick={open}
              aria-label="上传参考内容"
            >
              {refs[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={refs[0].url} alt="" />
              ) : (
                <>
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  <span className="joy-composer-upload-label">参考内容</span>
                </>
              )}
            </button>
          ) : null}

          <div className="joy-composer-main">
            {canUploadRef && refs.length > 0 ? (
              <div className="joy-composer-refs">
                {refs.map((ref) => (
                  <div key={ref.id} className="joy-composer-ref">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.url} alt="" />
                    <button
                      type="button"
                      onClick={() =>
                        setRefs((prev) => prev.filter((r) => r.id !== ref.id))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
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
                onPlainChange={setPrompt}
                onKindCommand={applyKind}
              />
            </div>
          </div>
        </div>

        <div className="joy-composer-toolbar">
          <div className="joy-composer-toolbar-left">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="joy-chip joy-chip-kind">
                  {kind === "image" ? (
                    <ImageIcon className="h-3.5 w-3.5" />
                  ) : (
                    <Video className="h-3.5 w-3.5" />
                  )}
                  {kind === "image" ? "图片生成" : "视频生成"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => applyKind("image")}>
                  图片生成
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyKind("video")}>
                  视频生成
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
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
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="joy-composer-model-menu min-w-[260px]"
              >
                {kindModels.length === 0 ? (
                  <DropdownMenuItem disabled>暂无可用模型</DropdownMenuItem>
                ) : (
                  kindModels.map((m) => {
                    const { icon, channel } = modelBrandMeta(m);
                    const selected = m.id === modelId;
                    return (
                      <DropdownMenuItem
                        key={m.id}
                        className={cn(
                          "joy-composer-model-item",
                          selected && "is-selected",
                        )}
                        onClick={() => setModelId(m.id)}
                      >
                        <BrandAvatar
                          src={icon}
                          label={m.name}
                          size={22}
                          rounded="md"
                        />
                        <span className="joy-composer-model-item-text">
                          <span className="joy-composer-model-item-name">
                            {m.name}
                            {channel ? (
                              <span className="joy-composer-model-item-vendor">
                                （{channel}）
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>

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
              <div className="joy-chip-params-group">
                {layout.showRatio || layout.showSizePicker ? (
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="joy-chip">
                      <RectangleHorizontal className="h-3.5 w-3.5 opacity-70" />
                      <span>{layoutChipLabel}</span>
                    </button>
                  </DropdownMenuTrigger>
                ) : null}
                {layout.showResolution ? (
                  <button
                    type="button"
                    className="joy-chip"
                    onClick={() => setParamsOpen(true)}
                  >
                    <span className="joy-chip-params-quality">
                      {kind === "image" ? `高清${qualityLabel}` : qualityLabel}
                      <Sparkles className="joy-chip-sparkle h-3 w-3" />
                    </span>
                  </button>
                ) : layout.showRatio || layout.showSizePicker ? null : (
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="joy-chip">
                      <span className="joy-chip-params-quality">
                        参数
                        <Sparkles className="joy-chip-sparkle h-3 w-3" />
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                )}
                {kind === "image" ? (
                  <button
                    type="button"
                    className="joy-chip"
                    onClick={() => setParamsOpen(true)}
                  >
                    <span>{n}张</span>
                  </button>
                ) : null}
              </div>
              <DropdownMenuContent align="start" className="p-3">
                <div className="joy-composer-params-panel">
                  {layout.showRatio ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">比例</span>
                      <div className="joy-composer-params-options">
                        {aspectOptions.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={cn(
                              "joy-composer-params-option",
                              aspect === a.id && "is-on",
                            )}
                            onClick={() => setAspect(a.id)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
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
                      <span className="joy-composer-params-label">清晰度</span>
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
                          {kind === "image" ? "张" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                  {kind === "video" ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">时长</span>
                      <div className="joy-composer-params-options">
                        {durationOptions.map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            className={cn(
                              "joy-composer-params-option",
                              duration === sec && "is-on",
                            )}
                            onClick={() => setDuration(sec)}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {kind === "video" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="joy-chip">
                    <Clock className="h-3.5 w-3.5 opacity-80" />
                    {duration}s
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {durationOptions.map((d) => (
                    <DropdownMenuItem key={d} onClick={() => setDuration(d)}>
                      {d} 秒
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

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
            <span className="joy-composer-cost" title="预计消耗">
              <Sparkles className="h-3.5 w-3.5" />
              {cost}
            </span>
            <button
              type="button"
              className={cn("joy-composer-send", prompt.trim() && "is-ready")}
              disabled={submitting || !prompt.trim()}
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

      {variant === "hero" ? (
        <div className="joy-composer-skills">
          {skillChips.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              className="joy-composer-skill"
              onClick={() => applySkill(cmd)}
            >
              {cmd.label}
              {cmd.id === "cinematic" || cmd.id === "portrait" ? (
                <span
                  className={cn(
                    "joy-composer-skill-badge",
                    cmd.id === "portrait" && "is-hot",
                  )}
                >
                  {cmd.id === "portrait" ? "Hot" : "New"}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { DEFAULT_ASPECTS as ASPECTS } from "./model-options";
