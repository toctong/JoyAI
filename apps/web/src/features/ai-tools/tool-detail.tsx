"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  Download,
  ExternalLink,
  Film,
  ImagePlus,
  Loader2,
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
import { cn } from "@/shared/lib/utils";
import { getToolExamples, type AiToolDef } from "./tool-catalog";
import { useAiToolJob } from "./use-ai-tool-job";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import "@/features/studio/creation-composer.css";
import "./ai-tools.css";

/**
 * Specialty tool detail — layout inspired by ai-video `tool-page`
 * (left sidebar form + pinned generate, right preview), rewritten with JoyAI controls.
 */
export function AiToolDetail({ tool }: { tool: AiToolDef }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const {
    refs,
    videos,
    note,
    setNote,
    busy,
    results,
    history,
    models,
    modelsReady,
    modelId,
    chooseModel,
    selectedModel,
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
    clearResults,
    submit,
  } = useAiToolJob(tool);

  const videosMax = tool.videosMax ?? 0;
  const videosRequired = tool.videosRequired ?? 0;
  const locked = busy || tool.status !== "available";
  const canAdd = refs.length < tool.refsMax && !locked;
  const canAddVideo = videos.length < videosMax && !locked;
  const canGenerate =
    !locked &&
    refs.length >= tool.refsRequired &&
    videos.length >= videosRequired &&
    (!tool.noteRequired || Boolean(note.trim())) &&
    (modelId || models.length === 0);
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
                    : "上线后可以在这里提交任务，结果会显示在右侧。"}
                </p>
              </div>
            </div>
          </div>
        </aside>
        <section className="joy-tool-page-preview">
          <div className="joy-ai-tool-empty">上线后结果会显示在这里</div>
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
                {videosRequired > 0 ? (
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
                ) : tool.refsMax > 0 ? (
                  <>参考图可选（0–{tool.refsMax} 张），用于风格参考。</>
                ) : null}
                {tool.noteRequired
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
                        暂无可用{tool.kind === "video" ? "视频" : "图像"}模型
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

              <div className="joy-tool-page-field">
                <span className="joy-tool-page-label">
                  {tool.refsRequired > 0
                    ? "参考图"
                    : tool.refsMax > 0
                      ? "参考图（可选）"
                      : "参考图"}
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
                            <video src={item.previewUrl} muted playsInline />
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
                  {tool.noteRequired
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
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  生成中…
                </>
              ) : (
                "开始生成"
              )}
            </Button>
          </div>
        </div>
      </aside>

      <section className="joy-tool-page-preview">
        <div
          className={cn(
            "joy-tool-page-preview-inner",
            !results.length && !busy && !history.length && "is-empty",
          )}
        >
          {results.length || busy || history.length ? (
            <div className="joy-ai-tool-result-head">
              <div>
                <h2 className="joy-ai-tool-panel-title">结果预览</h2>
                <p className="joy-ai-tool-panel-hint">
                  完成后会写入资产库，也可在这里下载。
                </p>
              </div>
              <div className="joy-ai-tool-result-head-actions">
                {results.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={clearResults}
                  >
                    清空本次
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link href="/assets">
                    <ExternalLink className="size-3.5" />
                    资产库
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}

          {busy && !results.length ? (
            <div className="joy-ai-tool-empty">
              <Loader2 className="size-5 animate-spin" />
              任务已提交，等待模型返回…
            </div>
          ) : results.length ? (
            <div className="joy-ai-tool-results">
              {results.map((asset) => (
                <ResultCard key={asset.id} url={asset.url} />
              ))}
            </div>
          ) : (
            <div className="joy-ai-tool-empty">
              {videosRequired > 0
                ? "上传角色图和动作视频后，结果会显示在这里"
                : tool.kind === "video"
                  ? "上传参考图并生成后，短片会显示在这里"
                  : tool.noteRequired
                    ? "填写说明并生成后在此预览"
                    : "上传参考图并生成后在此预览"}
            </div>
          )}

          {history.length > results.length ? (
            <div className="joy-ai-tool-history">
              <h3 className="joy-ai-tool-history-title">本次会话历史</h3>
              <div className="joy-ai-tool-history-grid">
                {history.map((asset) => (
                  <a
                    key={`h_${asset.id}`}
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="joy-ai-tool-history-item"
                  >
                    {isVideoUrl(asset.url) ? (
                      <JoyVideoPoster url={asset.url} size="sm" />
                    ) : (
                      <JoyAssetThumb url={asset.url} size="sm" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
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

function ResultCard({ url }: { url: string }) {
  const video = isVideoUrl(url);
  return (
    <div className="joy-ai-tool-result">
      {video ? (
        <video src={url} controls playsInline preload="metadata" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="生成结果" />
      )}
      <div className="joy-ai-tool-result-actions">
        <a href={url} target="_blank" rel="noreferrer" download>
          <Download className="size-3.5" />
          下载
        </a>
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink className="size-3.5" />
          打开
        </a>
      </div>
    </div>
  );
}
