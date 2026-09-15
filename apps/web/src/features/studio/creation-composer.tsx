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
import "./creation-composer.css";
const ASPECTS = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "4:3", label: "4:3", width: 1024, height: 768 },
  { id: "3:4", label: "3:4", width: 768, height: 1024 },
] as const;

const VIDEO_DURATIONS = [4, 5, 8, 10] as const;

const REF_MODES = [
  { id: "omni", label: "全能参考" },
  { id: "first", label: "首帧参考" },
  { id: "subject", label: "主体参考" },
] as const;

type RefMode = (typeof REF_MODES)[number]["id"];
type ImageQuality = "1k" | "2k";
type VideoQuality = "720p" | "1080p";

type PublicModel = {
  id: string;
  name: string;
  kind: "image" | "video";
  remoteId?: string;
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
  imageQuality?: ImageQuality;
  videoQuality?: VideoQuality;
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

function isAspectId(v: string | undefined): v is (typeof ASPECTS)[number]["id"] {
  return ASPECTS.some((a) => a.id === v);
}

function isDuration(v: number | undefined): v is (typeof VIDEO_DURATIONS)[number] {
  return VIDEO_DURATIONS.some((d) => d === v);
}

function isRefMode(v: string | undefined): v is RefMode {
  return REF_MODES.some((m) => m.id === v);
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
  const [imageQuality, setImageQuality] = useState<ImageQuality>("2k");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("720p");
  const [duration, setDuration] = useState<(typeof VIDEO_DURATIONS)[number]>(4);
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
  const selectedBrand = selectedModel
    ? modelBrandMeta(selectedModel)
    : { icon: null as string | null, channel: null as string | null };
  const refModeLabel =
    REF_MODES.find((m) => m.id === refMode)?.label ?? "全能参考";
  const qualityLabel =
    kind === "image"
      ? imageQuality === "2k"
        ? "2K"
        : "1K"
      : videoQuality === "1080p"
        ? "1080P"
        : "720P";

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
    if (next === "video") {
      setAspect(isAspectId(kp.aspect) ? kp.aspect : "16:9");
      setN(typeof kp.n === "number" && kp.n >= 1 && kp.n <= 4 ? kp.n : 1);
      setVideoQuality(kp.videoQuality === "1080p" ? "1080p" : "720p");
      setDuration(isDuration(kp.duration) ? kp.duration : 4);
      setRefMode(isRefMode(kp.refMode) ? kp.refMode : "omni");
      if (kp.modelId) setModelId(kp.modelId);
    } else {
      setAspect(isAspectId(kp.aspect) ? kp.aspect : "1:1");
      setN(typeof kp.n === "number" && kp.n >= 1 && kp.n <= 4 ? kp.n : 2);
      setImageQuality(kp.imageQuality === "1k" ? "1k" : "2k");
      if (kp.modelId) setModelId(kp.modelId);
    }
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
      aspect,
      n,
      ...(kind === "image"
        ? { imageQuality }
        : { videoQuality, duration, refMode }),
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
    n,
    imageQuality,
    videoQuality,
    duration,
    refMode,
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

  const onDrop = useCallback(async (files: File[]) => {
    try {
      for (const file of files) {
        const asset = await apiUpload<UploadedRef>("/upload", file);
        setRefs((prev) => [...prev, { id: asset.id, url: asset.url }]);
      }
      toast.success("参考图已上传");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => void onDrop(files),
    accept: { "image/*": [] },
    multiple: true,
    noClick: true,
  });

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
      const preset = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
      // ASPECTS ≈ 1K pixels; 2K doubles. Avoid sub-1K sizes (Seedream rejects < ~921600 px).
      const scale = imageQuality === "2k" ? 2 : 1;
      if (kind === "image") {
        await api("/jobs", {
          method: "POST",
          body: {
            kind: "image",
            input: {
              prompt: promptText,
              width: Math.round(preset.width * scale),
              height: Math.round(preset.height * scale),
              n,
              modelId: modelId || undefined,
              referenceAssetIds,
              referenceUrls: payload.imageUrls,
            },
          },
        });
      } else {
        await api("/jobs", {
          method: "POST",
          body: {
            kind: "video",
            input: {
              prompt: promptText,
              ratio: aspect,
              duration,
              modelId: modelId || undefined,
              referenceAssetIds,
              referenceUrls: [...payload.imageUrls, ...payload.videoUrls],
            },
          },
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

          <div className="joy-composer-main">
            {refs.length > 0 ? (
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

            {kind === "video" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="joy-chip">
                    <Orbit className="h-3.5 w-3.5 opacity-80" />
                    {refModeLabel}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {REF_MODES.map((m) => (
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
                <DropdownMenuTrigger asChild>
                  <button type="button" className="joy-chip">
                    <RectangleHorizontal className="h-3.5 w-3.5 opacity-70" />
                    <span>{aspect}</span>
                  </button>
                </DropdownMenuTrigger>
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
                  <div className="joy-composer-params-row">
                    <span className="joy-composer-params-label">比例</span>
                    <div className="joy-composer-params-options">
                      {ASPECTS.map((a) => (
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
                  <div className="joy-composer-params-row">
                    <span className="joy-composer-params-label">清晰度</span>
                    <div className="joy-composer-params-options">
                      {kind === "image"
                        ? (
                            [
                              ["2k", "2K"],
                              ["1k", "1K"],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              className={cn(
                                "joy-composer-params-option",
                                imageQuality === id && "is-on",
                              )}
                              onClick={() => setImageQuality(id)}
                            >
                              {label}
                            </button>
                          ))
                        : (
                            [
                              ["720p", "720P"],
                              ["1080p", "1080P"],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              className={cn(
                                "joy-composer-params-option",
                                videoQuality === id && "is-on",
                              )}
                              onClick={() => setVideoQuality(id)}
                            >
                              {label}
                            </button>
                          ))}
                    </div>
                  </div>
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
                        {[5, 10].map((sec) => (
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
                  {VIDEO_DURATIONS.map((d) => (
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

export { ASPECTS };
