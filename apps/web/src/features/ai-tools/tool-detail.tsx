"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import dayjs from "dayjs";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Film,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { copyText } from "@/shared/lib/clipboard";
import { downloadAsset } from "@/shared/lib/download-asset";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { getToolExamples, type AiToolDef } from "./tool-catalog";
import { useAiToolJob } from "./use-ai-tool-job";
import { modelAcceptsImageInput } from "@/features/studio/model-options";
import { writeStudioRemixSeed } from "@/features/studio/studio-remix-seed";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { JoyReleasedVideo } from "@/shared/ui/joy-released-video";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import {
  AssetsDetailDialog,
  type AssetsPreviewItem,
} from "@/features/assets/assets-detail-dialog";
import { GeneratingThumb } from "@/features/studio/generating-thumb";
import { VideoGenIcon } from "@/features/studio/gen-kind-icons";
import type {
  ToolHistoryEntry,
  ToolHistoryMeta,
  ToolResultAsset,
} from "./use-ai-tool-job";
import "@/features/studio/creation-composer.css";
import "@/features/studio/studio-workspace.css";
import "./ai-tools.css";

/**
 * Specialty tool detail — layout inspired by ai-video `tool-page`
 * (left sidebar form + pinned generate, right preview), rewritten with FrameRally controls.
 */
export function AiToolDetail({ tool }: { tool: AiToolDef }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const historySentinelRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const [preview, setPreview] = useState<AssetsPreviewItem | null>(null);
  const {
    refs,
    videos,
    note,
    setNote,
    results,
    resultText,
    selected,
    selectedId,
    selectHistory,
    history,
    pendingCount,
    historyHasMore,
    historyLoading,
    historyLoadingMore,
    loadMoreHistory,
    models,
    modelsReady,
    modelId,
    chooseModel,
    selectedModel,
    acceptsImageInput,
    showRefs,
    layout,
    ratio,
    chooseRatio,
    resolution,
    chooseResolution,
    sizeId,
    chooseSize,
    n,
    chooseN,
    addFiles,
    removeRef,
    addVideos,
    removeVideo,
    submit,
    regenerate,
  } = useAiToolJob(tool);

  useEffect(() => {
    const root = historyScrollRef.current;
    const sentinel = historySentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreHistory();
        }
      },
      { root, rootMargin: "80px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreHistory, history.length, historyHasMore]);

  const videosMax = tool.videosMax ?? 0;
  const videosRequired = tool.videosRequired ?? 0;
  const locked = tool.status !== "available";
  const canAdd = showRefs && refs.length < tool.refsMax && !locked;
  const canAddVideo = videos.length < videosMax && !locked;
  const refsNeeded = showRefs ? tool.refsRequired : 0;
  const canGenerate =
    !locked &&
    refs.length >= refsNeeded &&
    videos.length >= videosRequired &&
    (!tool.noteRequired || Boolean(note.trim())) &&
    (modelId || models.length === 0) &&
    !(tool.kind === "llm" && tool.refsRequired > 0 && !acceptsImageInput);
  const previewPending = selected?.status === "pending";
  const previewFailed = selected?.status === "failed";
  const examples = getToolExamples(tool);
  const modelLabel =
    selectedModel?.name ?? (models.length ? "选择模型" : "暂无模型");
  const modelIcon = selectedModel
    ? modelIconSrc({
        remoteId: selectedModel.remoteId,
        name: selectedModel.name,
      })
    : null;

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (!canAdd) return;
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  function openInStudio(opts: {
    prompt: string;
    refs?: string[];
    type?: "image" | "video";
  }) {
    const prompt = opts.prompt.trim();
    if (!prompt) {
      toast.error("没有可用的提示词");
      return;
    }
    const type = opts.type ?? "image";
    const refs = (opts.refs ?? [])
      .map((url) => String(url || "").trim())
      .filter((url) => url && !isVideoUrl(url));
    writeStudioRemixSeed({ prompt, refs, type });
    const qs = new URLSearchParams({ remix: "1", type });
    router.push(`/studio?${qs.toString()}`);
  }

  if (tool.status === "coming_soon") {
    return (
      <div className="joy-tool-page">
        <aside className="joy-tool-page-sidebar">
          <div className="joy-tool-page-sidebar-inner">
            <div className="joy-tool-page-body">
              <Link href="/tools" className="joy-ai-tool-back">
                <ArrowLeft className="size-3.5" />
                全部工具
              </Link>
              <div className="joy-tool-page-heading">
                <h1>{tool.name}</h1>
                <p>{tool.description}</p>
              </div>
              <div className="joy-ai-tool-soon">
                <strong>即将上线</strong>
                <p>
                  {tool.slug === "upscale"
                    ? "上线后会走独立的放大任务：上传 1 张图，选 2× 或 4×，尽量保住脸、线条和构图。不会用普通生图重画一张来冒充高清。"
                    : tool.slug === "video-reverse"
                      ? "上线后会走视频理解：上传短视频，反推适合生视频模型的动态提示词。"
                      : "上线后可以在这里提交任务，结果会显示在右侧。"}
                </p>
              </div>
            </div>
          </div>
        </aside>
        <section className="joy-tool-page-preview">
          <div className="joy-ai-tool-empty">
            <span className="joy-ai-tool-empty-icon" aria-hidden>
              <Box className="size-5" />
            </span>
            <p className="joy-ai-tool-empty-title">即将上线</p>
            <p className="joy-ai-tool-empty-hint">上线后结果会显示在这里</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="joy-tool-page">
      <aside className="joy-tool-page-sidebar">
        <div className="joy-tool-page-sidebar-inner">
          <div className="joy-tool-page-scroll">
            <div className="joy-tool-page-body">
              <Link href="/tools" className="joy-ai-tool-back">
                <ArrowLeft className="size-3.5" />
                全部工具
              </Link>

              <div className="joy-tool-page-heading">
                <h1>{tool.name}</h1>
                <p>{tool.description}</p>
              </div>

              <p className="joy-tool-page-hint">
                {tool.kind === "llm" && tool.refsRequired > 0 && !acceptsImageInput ? (
                  <>当前模型不支持看图。请换成带视觉能力的模型后再上传参考图。</>
                ) : tool.kind === "llm" && tool.llmPurpose === "prompt_optimize" ? (
                  showRefs ? (
                    <>粘贴原始提示词；可选上传参考图辅助理解风格。</>
                  ) : (
                    <>粘贴原始提示词后点击开始优化。</>
                  )
                ) : tool.kind === "llm" && tool.llmPurpose === "reverse_prompt" ? (
                  <>
                    需要 {tool.refsRequired}
                    {tool.refsMax > tool.refsRequired
                      ? `–${tool.refsMax}`
                      : ""}{" "}
                    张参考图，结果为可复制的生图提示词。
                  </>
                ) : videosRequired > 0 ? (
                  <>
                    需要 {tool.refsRequired} 张角色图，以及 {videosRequired}{" "}
                    段动作参考视频。图里的角色会跟着视频做动作，不会换成视频里的人。
                  </>
                ) : tool.refsRequired > 0 ? (
                  <>
                    需要 {tool.refsRequired}
                    {tool.refsMax > tool.refsRequired
                      ? `–${tool.refsMax}`
                      : ""}{" "}
                    张参考图。
                  </>
                ) : showRefs ? (
                  <>参考图可选（0–{tool.refsMax} 张），用于风格参考。</>
                ) : null}
                {tool.kind === "llm"
                  ? tool.noteRequired
                    ? "填写后点击开始。"
                    : showRefs
                      ? "可填说明调整输出偏好。"
                      : ""
                  : tool.noteRequired
                    ? "请先填写说明后再生成。"
                    : videosRequired > 0
                      ? "不填说明时，动作完全跟参考视频。"
                      : "不填说明时按工具模板生成。"}
              </p>

              <div className="joy-tool-page-field">
                <span className="joy-tool-page-label">模型</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="joy-tool-model-trigger"
                      disabled={locked || !modelsReady || models.length < 2}
                    >
                      {modelIcon ? (
                        <BrandAvatar
                          src={modelIcon}
                          label={modelLabel}
                          size={20}
                          rounded="md"
                        />
                      ) : (
                        <Box className="size-4 opacity-80" />
                      )}
                      <span className="joy-tool-model-name">{modelLabel}</span>
                      {models.length > 1 ? (
                        <ChevronDown className="joy-tool-model-chevron size-3.5" />
                      ) : null}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="joy-composer-model-menu joy-tool-model-menu"
                  >
                    {models.length === 0 ? (
                      <DropdownMenuItem disabled>
                        暂无可用
                        {tool.kind === "video"
                          ? "视频"
                          : tool.kind === "llm"
                            ? "文本"
                            : "图像"}
                        模型
                      </DropdownMenuItem>
                    ) : (
                      models.map((item) => (
                        <DropdownMenuItem
                          key={item.id}
                          className={cn(
                            "joy-composer-model-item",
                            item.id === modelId && "is-selected",
                          )}
                          onClick={() => chooseModel(item.id)}
                        >
                          <BrandAvatar
                            src={modelIconSrc({
                              remoteId: item.remoteId,
                              name: item.name,
                            })}
                            label={item.name}
                            size={22}
                            rounded="md"
                          />
                          <span className="joy-composer-model-item-text">
                            <span className="joy-composer-model-item-name">
                              {item.name}
                              {tool.kind === "llm" &&
                              modelAcceptsImageInput(item.capabilities) ? (
                                <span className="joy-tool-model-cap">看图</span>
                              ) : null}
                            </span>
                            {item.channel?.name ? (
                              <span className="joy-composer-model-item-id">
                                {item.channel.name}
                              </span>
                            ) : null}
                          </span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {showRefs ? (
              <div className="joy-tool-page-field">
                <span className="joy-tool-page-label">
                  {tool.refsRequired > 0
                    ? "参考图"
                    : "参考图（可选）"}
                </span>
                <div
                  className={cn(
                    "joy-ai-tool-drop",
                    !refs.length && "is-empty",
                    dragOver && "is-dragging",
                    !canAdd && "is-full",
                  )}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (canAdd) setDragOver(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (canAdd) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                >
                  {!refs.length ? (
                    <button
                      type="button"
                      className="joy-ai-tool-drop-zone"
                      disabled={!canAdd}
                      onClick={() => inputRef.current?.click()}
                    >
                      <ImagePlus className="size-5" strokeWidth={1.75} />
                      <strong>
                        {tool.refsRequired > 0
                          ? "选择或拖入图片"
                          : "可选风格参考图"}
                      </strong>
                      <span>支持 JPG / PNG / WebP</span>
                    </button>
                  ) : (
                    <div className="joy-ai-tool-refs">
                      {refs.map((item) => (
                        <div key={item.localId} className="joy-ai-tool-ref">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.previewUrl} alt="" />
                          <button
                            type="button"
                            className="joy-ai-tool-ref-remove"
                            aria-label="移除"
                            disabled={locked}
                            onClick={() => removeRef(item.localId)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                      {canAdd ? (
                        <button
                          type="button"
                          className="joy-ai-tool-ref-add"
                          onClick={() => inputRef.current?.click()}
                        >
                          <ImagePlus className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple={tool.refsMax > 1}
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      addFiles(event.target.files);
                    }
                    event.target.value = "";
                  }}
                />
              </div>
              ) : null}

              {videosMax > 0 ? (
                <div className="joy-tool-page-field">
                  <span className="joy-tool-page-label">动作参考视频</span>
                  <div
                    className={cn(
                      "joy-ai-tool-drop",
                      !videos.length && "is-empty",
                      videoDragOver && "is-dragging",
                      !canAddVideo && "is-full",
                    )}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (canAddVideo) setVideoDragOver(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (canAddVideo) setVideoDragOver(true);
                    }}
                    onDragLeave={() => setVideoDragOver(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setVideoDragOver(false);
                      if (!canAddVideo) return;
                      if (event.dataTransfer.files?.length) {
                        addVideos(event.dataTransfer.files);
                      }
                    }}
                  >
                    {!videos.length ? (
                      <button
                        type="button"
                        className="joy-ai-tool-drop-zone"
                        disabled={!canAddVideo}
                        onClick={() => videoInputRef.current?.click()}
                      >
                        <Film className="size-5" strokeWidth={1.75} />
                        <strong>选择或拖入动作视频</strong>
                        <span>MP4 / WebM / MOV，建议 15 秒内</span>
                      </button>
                    ) : (
                      <div className="joy-ai-tool-refs">
                        {videos.map((item) => (
                          <div key={item.localId} className="joy-ai-tool-ref">
                            <JoyReleasedVideo
                              src={item.previewUrl}
                              muted
                              playsInline
                            />
                            <button
                              type="button"
                              className="joy-ai-tool-ref-remove"
                              aria-label="移除视频"
                              disabled={locked}
                              onClick={() => removeVideo(item.localId)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        addVideos(event.target.files);
                      }
                      event.target.value = "";
                    }}
                  />
                </div>
              ) : null}

              {layout.showRatio && layout.aspects.length > 0 ? (
                <div className="joy-tool-page-field">
                  <span className="joy-tool-page-label">比例</span>
                  <div className="joy-tool-options is-ratio">
                    {layout.aspects.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "joy-tool-option",
                          ratio === item.id && "is-on",
                        )}
                        disabled={locked}
                        onClick={() => chooseRatio(item.id)}
                      >
                        <RatioMark id={item.id} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {layout.showResolution && layout.resolutions.length > 0 ? (
                <div className="joy-tool-page-field">
                  <span className="joy-tool-page-label">清晰度</span>
                  <div className="joy-tool-options is-mode">
                    {layout.resolutions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "joy-tool-option",
                          resolution === item.id && "is-on",
                        )}
                        disabled={locked}
                        onClick={() => chooseResolution(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {layout.showSizePicker && layout.sizes.length > 0 ? (
                <div className="joy-tool-page-field">
                  <span className="joy-tool-page-label">尺寸</span>
                  <div className="joy-tool-options is-mode">
                    {layout.sizes.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "joy-tool-option",
                          sizeId === item.id && "is-on",
                        )}
                        disabled={locked}
                        onClick={() => chooseSize(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {tool.kind === "image" ? (
                <div className="joy-tool-page-field">
                  <span className="joy-tool-page-label">张数</span>
                  <div className="joy-tool-options is-count">
                    {[1, 2, 3, 4].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={cn(
                          "joy-tool-option",
                          n === value && "is-on",
                        )}
                        disabled={locked}
                        onClick={() => chooseN(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="joy-tool-page-field">
                <label className="joy-tool-page-label" htmlFor="tool-note">
                  {tool.promptMode === "note-as-prompt"
                    ? "原始提示词（必填）"
                    : tool.noteRequired
                      ? tool.promptMode === "brand-brief"
                        ? "品牌说明（必填）"
                        : "补充说明（必填）"
                      : "补充说明（可选）"}
                </label>
                {examples.length ? (
                  <div className="joy-tool-examples" role="group" aria-label="示例文字">
                    {examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className={cn(
                          "joy-tool-example",
                          note === example && "is-on",
                        )}
                        disabled={locked}
                        onClick={() => setNote(example)}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Textarea
                  id="tool-note"
                  value={note}
                  disabled={locked}
                  placeholder={
                    tool.noteHint || "例如想要的色调、文案、场景…"
                  }
                  className="joy-ai-tool-note"
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="joy-tool-page-actions">
            <Button
              type="button"
              className="joy-tool-page-generate h-11"
              disabled={!canGenerate}
              onClick={() => void submit()}
            >
              {pendingCount > 0
                ? tool.kind === "llm"
                  ? "再来一次"
                  : "再抽一张"
                : tool.submitLabel || "开始生成"}
            </Button>
          </div>
        </div>
      </aside>

      <section className="joy-tool-page-preview">
        <div
          className={cn(
            "joy-tool-page-preview-inner",
            !results.length &&
              !resultText &&
              !previewPending &&
              !previewFailed &&
              "is-empty",
          )}
        >
          <JoyPhotoProvider>
            {selected ? (
              <ToolResultHead
                entry={selected}
                onPreviewAsset={(asset) => setPreview(toPreviewItem(asset))}
                onRegenerate={() => void regenerate(selected)}
                onOpenStudio={
                  tool.kind === "llm"
                    ? (type) =>
                        openInStudio({
                          prompt: selected.resultText?.trim() || "",
                          refs: selected.meta?.referenceUrls,
                          type,
                        })
                    : undefined
                }
              />
            ) : null}

            {previewPending ? (
              tool.kind === "llm" ? (
                <div className="joy-ai-tool-text-pending" aria-busy>
                  <div className="joy-ai-tool-text-pending-card">
                    <Loader2 className="size-4 animate-spin" />
                    <div className="joy-ai-tool-text-pending-copy">
                      <p className="joy-ai-tool-text-pending-title">
                        {tool.llmPurpose === "prompt_optimize"
                          ? "正在优化提示词"
                          : tool.llmPurpose === "reverse_prompt"
                            ? "正在反推提示词"
                            : "正在处理"}
                      </p>
                      <p className="joy-ai-tool-text-pending-hint">
                        通常几秒内完成，结果会显示在这里
                      </p>
                    </div>
                  </div>
                  <div className="joy-ai-tool-text-pending-lines" aria-hidden>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ) : (
                <div className="joy-ai-tool-pending">
                  <GeneratingThumb
                    className="joy-ai-tool-pending-gen"
                    aspectRatio="1 / 1"
                  />
                </div>
              )
            ) : previewFailed ? (
              <div className="joy-ai-tool-empty">
                <span className="joy-ai-tool-empty-icon" aria-hidden>
                  <Box className="size-5" />
                </span>
                <p className="joy-ai-tool-empty-title">
                  {tool.kind === "llm" ? "处理失败" : "生成失败"}
                </p>
                <p className="joy-ai-tool-empty-hint">
                  {selected?.error || "请稍后重试"}
                </p>
                {selected?.meta?.prompt ? (
                  <Button
                    type="button"
                    className="joy-ai-tool-empty-action"
                    onClick={() => void regenerate(selected)}
                  >
                    <RefreshCw className="size-3.5" />
                    重新生成
                  </Button>
                ) : null}
              </div>
            ) : resultText ? (
              <div className="joy-ai-tool-text-result">
                <pre className="joy-ai-tool-text-body">{resultText}</pre>
              </div>
            ) : results.length ? (
              <div className="joy-ai-tool-results">
                {results.map((asset) => (
                  <ResultCard
                    key={asset.id}
                    url={asset.url}
                    onPreview={() => setPreview(toPreviewItem(asset))}
                  />
                ))}
              </div>
            ) : (
              <div className="joy-ai-tool-empty">
                <span className="joy-ai-tool-empty-icon" aria-hidden>
                  {tool.kind === "llm" ? (
                    <Copy className="size-5" />
                  ) : videosRequired > 0 || tool.kind === "video" ? (
                    <Film className="size-5" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                </span>
                <p className="joy-ai-tool-empty-title">
                  {tool.kind === "llm" ? "提示词结果" : "结果预览"}
                </p>
                <p className="joy-ai-tool-empty-hint">
                  {tool.kind === "llm" && tool.llmPurpose === "prompt_optimize"
                    ? "填写提示词并优化后，结果会显示在这里"
                    : tool.kind === "llm"
                      ? "上传参考图并反推后，提示词会显示在这里"
                      : videosRequired > 0
                        ? "上传角色图和动作视频后，结果会显示在这里"
                        : tool.kind === "video"
                          ? "上传参考图并生成后，短片会显示在这里"
                          : tool.noteRequired
                            ? "填写说明并生成后在此预览"
                            : "上传参考图并生成后在此预览"}
                </p>
              </div>
            )}
          </JoyPhotoProvider>
        </div>
      </section>

      <aside className="joy-tool-page-history">
        <div className="joy-tool-page-history-head">
          <h2 className="joy-tool-page-history-title">历史记录</h2>
        </div>
        <div ref={historyScrollRef} className="joy-tool-page-history-scroll">
          {historyLoading && !history.length ? (
            <div className="joy-tool-page-history-status">
              <Loader2 className="size-4 animate-spin" />
              加载中…
            </div>
          ) : history.length ? (
            <div className="joy-ai-tool-history-grid">
              {history.map((entry) => (
                <HistoryThumb
                  key={entry.id}
                  entry={entry}
                  active={entry.id === selectedId}
                  onSelect={() => selectHistory(entry.id)}
                  onPreviewAsset={(asset) => setPreview(toPreviewItem(asset))}
                />
              ))}
            </div>
          ) : (
            <div className="joy-tool-page-history-status is-muted">
              暂无历史
            </div>
          )}
          {historyHasMore ? (
            <div
              ref={historySentinelRef}
              className="joy-tool-page-history-sentinel"
            >
              {historyLoadingMore ? (
                <span className="joy-tool-page-history-status">
                  <Loader2 className="size-3.5 animate-spin" />
                  加载更多…
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>

      <AssetsDetailDialog
        asset={preview}
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        createdLabel="工具生成"
        locateHref={null}
      />
    </div>
  );
}

function RatioMark({ id }: { id: string }) {
  const parts = id.split(":").map(Number);
  const width = parts[0];
  const height = parts[1];
  const smart = !width || !height;
  const max = 16;
  const scale = smart ? 1 : max / Math.max(width, height);
  return (
    <span className={cn("joy-tool-ratio-mark", smart && "is-smart")} aria-hidden>
      <span
        style={
          smart
            ? undefined
            : {
                width: Math.max(6, Math.round(width * scale)),
                height: Math.max(6, Math.round(height * scale)),
              }
        }
      />
    </span>
  );
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

async function copyResultText(text: string) {
  if (!text.trim()) {
    toast.error("没有可复制的内容");
    return;
  }
  if (await copyText(text)) {
    toast.success("提示词已复制");
  } else {
    toast.error("复制失败");
  }
}

function toPreviewItem(asset: ToolResultAsset): AssetsPreviewItem {
  return {
    id: asset.id,
    kind: isVideoUrl(asset.url) ? "video" : "image",
    url: asset.url,
    createdAt: "",
    source: "tools",
  };
}

function toolMetaParts(meta?: ToolHistoryMeta, assetCount = 0): string[] {
  if (!meta) return [];
  const model =
    meta.modelName?.trim() ||
    meta.channelName?.trim() ||
    (meta.kind === "llm"
      ? "文本模型"
      : meta.kind === "video"
        ? "视频生成"
        : "图片生成");
  const channel =
    meta.channelName &&
    meta.modelName &&
    meta.channelName.trim() !== meta.modelName.trim()
      ? meta.channelName.trim()
      : null;
  const count =
    meta.kind === "image" && (meta.n ?? assetCount) > 1
      ? `${meta.n ?? assetCount}张`
      : null;
  const time = meta.finishedAt || meta.createdAt
    ? dayjs(meta.finishedAt || meta.createdAt).format("M月D日 HH:mm")
    : null;
  return [
    model,
    meta.resolution,
    meta.ratio,
    count,
    channel,
    time,
  ].filter((part): part is string => Boolean(part));
}

function ToolResultHead({
  entry,
  onPreviewAsset,
  onRegenerate,
  onOpenStudio,
}: {
  entry: ToolHistoryEntry;
  onPreviewAsset: (asset: ToolResultAsset) => void;
  onRegenerate: () => void;
  onOpenStudio?: (type: "image" | "video") => void;
}) {
  const meta = entry.meta;
  const refs = meta?.referenceUrls ?? [];
  const prompt = meta?.prompt?.trim() || "";
  const resultText = entry.resultText?.trim() || "";
  const parts = useMemo(
    () => toolMetaParts(meta, entry.assets.length),
    [meta, entry.assets.length],
  );
  const canDownload = entry.status === "succeeded" && entry.assets.length > 0;
  const canCopyResult = entry.status === "succeeded" && Boolean(resultText);
  const canRegenerate = Boolean(prompt);

  async function onCopyPrompt() {
    if (!prompt) {
      toast.error("没有可复制的提示词");
      return;
    }
    if (await copyText(prompt)) {
      toast.success("提示词已复制");
    } else {
      toast.error("复制失败");
    }
  }

  async function onCopyResult() {
    await copyResultText(resultText);
  }

  async function onDownload() {
    if (!canDownload) {
      toast.error("暂无可下载的生成结果");
      return;
    }
    try {
      for (const asset of entry.assets) {
        await downloadAsset(
          asset.url,
          isVideoUrl(asset.url) ? "video" : "image",
        );
      }
      toast.success(
        entry.assets.length > 1 ? "已开始下载全部生成结果" : "已开始下载生成结果",
      );
    } catch {
      toast.error("下载失败");
    }
  }

  return (
    <div className="joy-ai-tool-result-head">
      <div
        className={cn(
          "joy-studio-prompt-row joy-ai-tool-prompt-row",
          refs.length > 0 && "has-refs",
        )}
      >
        {refs.length > 0 ? (
          <div
            className={cn(
              "joy-studio-refs",
              refs.length > 1 && "is-stack",
            )}
            data-count={Math.min(refs.length, 4)}
            aria-label="参考素材"
          >
            <div className="joy-studio-refs-fan">
              {refs.slice(0, 4).map((url, index) => {
                const video = isVideoUrl(url);
                const tilt =
                  refs.length === 1
                    ? "is-tilt-solo"
                    : index % 2 === 0
                      ? "is-tilt-a"
                      : "is-tilt-b";
                const thumb = (
                  <div
                    className={cn(
                      "joy-studio-ref-card",
                      video ? "is-video" : "is-image",
                      tilt,
                    )}
                  >
                    {video ? (
                      <JoyVideoPoster
                        url={url}
                        size="sm"
                        fallback="video"
                        className="size-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`参考${index + 1}`} />
                    )}
                    {index === 0 ? (
                      <span className="joy-studio-ref-index">{index + 1}</span>
                    ) : null}
                  </div>
                );
                return video ? (
                  <div
                    key={`${url}-${index}`}
                    className="joy-studio-ref-hit"
                    style={{ ["--ref-i" as string]: String(index) }}
                  >
                    {thumb}
                  </div>
                ) : (
                  <PhotoView key={`${url}-${index}`} src={url}>
                    <button
                      type="button"
                      className="joy-studio-ref-hit"
                      style={{ ["--ref-i" as string]: String(index) }}
                      aria-label={`预览参考${index + 1}`}
                    >
                      {thumb}
                    </button>
                  </PhotoView>
                );
              })}
            </div>
            {refs.length > 4 ? (
              <span className="joy-studio-ref-more">+{refs.length - 4}</span>
            ) : null}
          </div>
        ) : null}

        <div className="joy-studio-prompt-col">
          <div className="joy-ai-tool-prompt-line">
            <p className="joy-ai-tool-prompt-text" title={prompt || undefined}>
              {prompt ||
                (entry.status === "pending"
                  ? "处理中…"
                  : entry.status === "failed"
                    ? entry.error || "处理失败"
                    : "未命名结果")}
            </p>
            {prompt && !onOpenStudio ? (
              <button
                type="button"
                className="joy-ai-tool-prompt-copy"
                aria-label="复制输入"
                title="复制输入"
                onClick={() => void onCopyPrompt()}
              >
                <Copy className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div className="joy-ai-tool-meta-row">
            {parts.length > 0 ? (
              <p className="joy-studio-meta joy-studio-meta-sub">
                {parts.map((part, index) => (
                  <span key={`${entry.id}-meta-${index}`}>
                    {index > 0 ? (
                      <span className="joy-studio-meta-sep" aria-hidden>
                        {" "}
                        |{" "}
                      </span>
                    ) : null}
                    <span className="joy-studio-meta-part">{part}</span>
                  </span>
                ))}
              </p>
            ) : (
              <span className="joy-ai-tool-meta-spacer" />
            )}
            <div className="joy-ai-tool-meta-icons" role="group" aria-label="结果操作">
              <button
                type="button"
                className="joy-ai-tool-icon-btn"
                disabled={!canRegenerate || entry.status === "pending"}
                title="重新生成"
                aria-label="重新生成"
                onClick={onRegenerate}
              >
                <RefreshCw strokeWidth={1.75} className="size-3.5" />
              </button>
              {canCopyResult ? (
                <button
                  type="button"
                  className="joy-ai-tool-icon-btn"
                  title="复制提示词"
                  aria-label="复制提示词"
                  onClick={() => void onCopyResult()}
                >
                  <Copy strokeWidth={1.75} className="size-3.5" />
                </button>
              ) : null}
              {canCopyResult && onOpenStudio ? (
                <>
                  <button
                    type="button"
                    className="joy-ai-tool-icon-btn"
                    title="去生图"
                    aria-label="去生图"
                    onClick={() => onOpenStudio("image")}
                  >
                    <ImagePlus strokeWidth={1.75} className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="joy-ai-tool-icon-btn"
                    title="去生视频"
                    aria-label="去生视频"
                    onClick={() => onOpenStudio("video")}
                  >
                    <VideoGenIcon className="size-3.5 text-[14px]" />
                  </button>
                </>
              ) : null}
              {!onOpenStudio && canDownload ? (
                <button
                  type="button"
                  className="joy-ai-tool-icon-btn"
                  title="下载"
                  aria-label="下载"
                  onClick={() => void onDownload()}
                >
                  <Download strokeWidth={1.75} className="size-3.5" />
                </button>
              ) : null}
              {!onOpenStudio && entry.assets[0] ? (
                <button
                  type="button"
                  className="joy-ai-tool-icon-btn"
                  title="预览"
                  aria-label="预览"
                  onClick={() => onPreviewAsset(entry.assets[0]!)}
                >
                  <ExternalLink strokeWidth={1.75} className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryThumb({
  entry,
  active,
  onSelect,
  onPreviewAsset,
}: {
  entry: ToolHistoryEntry;
  active: boolean;
  onSelect: () => void;
  onPreviewAsset: (asset: ToolResultAsset) => void;
}) {
  if (entry.status === "pending") {
    const llmPending = entry.meta?.kind === "llm";
    return (
      <button
        type="button"
        className={cn(
          "joy-ai-tool-history-item is-pending",
          llmPending && "is-text",
          active && "is-active",
        )}
        aria-label={llmPending ? "处理中" : "生成中"}
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
      >
        {llmPending ? (
          <span className="joy-ai-tool-history-text-pending">
            <Loader2 className="size-3.5 animate-spin" />
            处理中
          </span>
        ) : (
          <GeneratingThumb
            className="joy-ai-tool-history-gen"
            aspectRatio="1 / 1"
          />
        )}
      </button>
    );
  }

  if (entry.status === "failed") {
    return (
      <button
        type="button"
        className={cn("joy-ai-tool-history-item is-failed", active && "is-active")}
        aria-label="生成失败"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="joy-ai-tool-history-failed">失败</span>
      </button>
    );
  }

  const asset = entry.assets[0];
  const text = entry.resultText?.trim() || "";
  if (!asset && !text) return null;

  if (!asset && text) {
    return (
      <button
        type="button"
        className={cn(
          "joy-ai-tool-history-item is-text",
          active && "is-active",
        )}
        aria-label="查看历史提示词"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="joy-ai-tool-history-text">{text}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn("joy-ai-tool-history-item", active && "is-active")}
      aria-label="预览历史结果"
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      onDoubleClick={() => asset && onPreviewAsset(asset)}
    >
      {isVideoUrl(asset!.url) ? (
        <JoyVideoPoster url={asset!.url} size="sm" />
      ) : (
        <JoyAssetThumb url={asset!.url} size="sm" />
      )}
      {entry.assets.length > 1 ? (
        <span className="joy-ai-tool-history-count">{entry.assets.length}</span>
      ) : null}
    </button>
  );
}

function ResultCard({
  url,
  onPreview,
}: {
  url: string;
  onPreview: () => void;
}) {
  const video = isVideoUrl(url);
  return (
    <div className="joy-ai-tool-result">
      {video ? (
        <div className="joy-ai-tool-result-media">
          <JoyReleasedVideo
            src={url}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      ) : (
        <button
          type="button"
          className="joy-ai-tool-result-media"
          aria-label="放大预览"
          onClick={onPreview}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="生成结果" />
        </button>
      )}
    </div>
  );
}
