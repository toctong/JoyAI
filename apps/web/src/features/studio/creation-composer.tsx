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
import { toast } from "sonner";
import { api, apiUpload } from "@/shared/lib/api";
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
  isDefault: boolean;
};

type UploadedRef = { id: string; url: string };

type Props = {
  variant?: "hero" | "dock";
  className?: string;
  initialPrompt?: string;
  onSubmitted?: () => void;
  promptSeed?: string;
};

function pickDefaultModel(models: PublicModel[], kind: "image" | "video") {
  const list = models.filter((m) => m.kind === kind);
  return list.find((m) => m.isDefault)?.id ?? list[0]?.id ?? "";
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
  const [kind, setKind] = useState<"image" | "video">(
    search.get("type") === "video" ? "video" : "image",
  );
  const [aspect, setAspect] = useState(
    search.get("type") === "video" ? "16:9" : "1:1",
  );
  const [n, setN] = useState(search.get("type") === "video" ? 1 : 2);
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

  const kindModels = useMemo(
    () => models.filter((m) => m.kind === kind),
    [models, kind],
  );
  const selectedModel = kindModels.find((m) => m.id === modelId);
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
      ? "上传参考图、输入文字或 @ 素材，描述你想生成的视频。"
      : "上传参考图、输入文字或 @ 素材，描述你想生成的图片。";

  useEffect(() => {
    void api<PublicModel[]>("/models")
      .then(setModels)
      .catch(() => {
        /* 无模型配置时仍可提交，后端走默认渠道 */
      });
  }, []);

  useEffect(() => {
    const t = search.get("type");
    if (t === "video" || t === "image") setKind(t);
  }, [search]);

  useEffect(() => {
    if (models.length === 0) return;
    setModelId((prev) => {
      if (prev && models.some((m) => m.id === prev && m.kind === kind)) {
        return prev;
      }
      return pickDefaultModel(models, kind);
    });
  }, [kind, models]);

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

  function applyKind(next: "image" | "video") {
    setKind(next);
    if (next === "video") {
      setAspect("16:9");
      setN(1);
      setVideoQuality("720p");
      setDuration(4);
    } else {
      setAspect("1:1");
      setN(2);
      setImageQuality("2k");
    }
  }

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
      const scale = imageQuality === "2k" ? 1 : 0.75;
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
                  <Box className="h-3.5 w-3.5 opacity-80" />
                  <span className="joy-chip-model-name">
                    {selectedModel?.name ?? "默认模型"}
                  </span>
                  <Sparkles className="joy-chip-sparkle h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {kindModels.length === 0 ? (
                  <DropdownMenuItem disabled>暂无可用模型</DropdownMenuItem>
                ) : (
                  kindModels.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setModelId(m.id)}
                    >
                      {m.name}
                      {m.isDefault ? " · 默认" : ""}
                    </DropdownMenuItem>
                  ))
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
              <DropdownMenuTrigger asChild>
                <button type="button" className="joy-chip joy-chip-params">
                  <RectangleHorizontal className="h-3.5 w-3.5 opacity-70" />
                  <span>{aspect}</span>
                  <span className="joy-chip-dot" aria-hidden>
                    ·
                  </span>
                  <span className="joy-chip-params-quality">
                    {qualityLabel}
                    <Sparkles className="joy-chip-sparkle h-3 w-3" />
                  </span>
                  <span className="joy-chip-dot" aria-hidden>
                    ·
                  </span>
                  <span>{n}</span>
                </button>
              </DropdownMenuTrigger>
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
