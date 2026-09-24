"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  CheckList,
  DotLoading,
  Image,
  ImageViewer,
  Popup,
  TextArea,
} from "antd-mobile";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  ImagePlus,
  Plus,
  Ratio,
  Sparkles,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { assetListImageUrl } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import {
  getToolExamples,
  type AiToolDef,
} from "@/features/ai-tools/tool-catalog";
import { useAiToolJob } from "@/features/ai-tools/use-ai-tool-job";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import { cn } from "@/shared/lib/utils";

type ParamSheet = "ratio" | "resolution" | "size" | null;

const CATEGORY_LABEL: Record<AiToolDef["category"], string> = {
  image: "影像",
  video: "动画",
  other: "工具",
};

export function MobileToolDetailPage({ tool }: { tool: AiToolDef }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [paramOpen, setParamOpen] = useState<ParamSheet>(null);

  const {
    refs,
    videos,
    note,
    setNote,
    results,
    resultText,
    selected,
    history,
    pendingCount,
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
    addFiles,
    removeRef,
    addVideos,
    removeVideo,
    submit,
    selectHistory,
  } = useAiToolJob(tool);

  const locked = tool.status !== "available";
  const videosMax = tool.videosMax ?? 0;
  const videosRequired = tool.videosRequired ?? 0;
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

  const examples = getToolExamples(tool);
  const modelLabel =
    selectedModel?.name ?? (models.length ? "选择模型" : "暂无模型");
  const modelIcon = selectedModel
    ? modelIconSrc({
        remoteId: selectedModel.remoteId,
        name: selectedModel.name,
      })
    : null;
  const rawCover =
    tool.covers?.filter(Boolean).at(-1) ?? tool.covers?.[0] ?? null;
  const cover = rawCover ? staticAssetUrl(rawCover) : null;

  const ratioLabel =
    layout.aspects.find((a) => a.id === ratio)?.label ?? ratio;
  const resolutionLabel =
    layout.resolutions.find((r) => r.id === resolution)?.label ?? resolution;
  const sizeLabel =
    layout.sizes.find((s) => s.id === sizeId)?.label ?? sizeId;

  const showParams =
    (layout.showRatio && layout.aspects.length > 0) ||
    (layout.showResolution && layout.resolutions.length > 0) ||
    (layout.showSizePicker && layout.sizes.length > 0);

  if (locked) {
    return (
      <div className="joy-m-tool">
        <Link href="/m/tools" className="joy-m-tool-back">
          <ArrowLeft className="size-4" />
          全部工具
        </Link>
        <header
          className="joy-m-tool-hero"
          style={{ ["--tool-accent" as string]: tool.accent }}
        >
          {cover ? (
            <span className="joy-m-tool-hero-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" draggable={false} />
            </span>
          ) : (
            <span className="joy-m-tool-hero-cover is-ph" />
          )}
          <div className="joy-m-tool-hero-copy">
            <div className="joy-m-tool-hero-tags">
              <span>{CATEGORY_LABEL[tool.category]}</span>
              <span className="is-soon">即将上线</span>
            </div>
            <h1 className="joy-m-tool-title">{tool.name}</h1>
            <p className="joy-m-tool-desc">{tool.description}</p>
          </div>
        </header>
        <div className="joy-m-tool-soon">
          <strong>即将上线</strong>
          <p>上线后可在手机端直接提交任务，结果会出现在下方。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="joy-m-tool">
      <Link href="/m/tools" className="joy-m-tool-back">
        <ArrowLeft className="size-4" />
        全部工具
      </Link>

      <header
        className="joy-m-tool-hero"
        style={{ ["--tool-accent" as string]: tool.accent }}
      >
        {cover ? (
          <span className="joy-m-tool-hero-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" draggable={false} />
          </span>
        ) : (
          <span className="joy-m-tool-hero-cover is-ph" />
        )}
        <div className="joy-m-tool-hero-copy">
          <div className="joy-m-tool-hero-tags">
            <span>{CATEGORY_LABEL[tool.category]}</span>
            {tool.badge === "new" ? <span className="is-new">NEW</span> : null}
          </div>
          <h1 className="joy-m-tool-title">{tool.name}</h1>
          <p className="joy-m-tool-desc">{tool.description}</p>
        </div>
      </header>

      <section className="joy-m-tool-panel">
        <button
          type="button"
          className="joy-m-tool-model"
          disabled={!modelsReady || models.length < 2}
          onClick={() => setModelOpen(true)}
        >
          {modelIcon ? (
            <BrandAvatar
              src={modelIcon}
              label={modelLabel}
              size={26}
              rounded="md"
            />
          ) : (
            <span className="joy-m-tool-model-ph">
              <Box className="size-4 opacity-70" />
            </span>
          )}
          <span className="joy-m-tool-model-text">
            <span className="joy-m-tool-model-kicker">模型</span>
            <span className="joy-m-tool-model-name">{modelLabel}</span>
          </span>
          {models.length > 1 ? (
            <ChevronDown className="size-3.5 opacity-55" />
          ) : null}
        </button>

        {showRefs ? (
          <div className="joy-m-tool-block">
            <div className="joy-m-tool-block-head">
              <span className="joy-m-tool-label">参考图</span>
              <span className="joy-m-tool-hint">
                {tool.refsRequired > 0
                  ? `${refs.length}/${tool.refsMax} · 至少 ${tool.refsRequired}`
                  : `${refs.length}/${tool.refsMax} · 可选`}
              </span>
            </div>
            <div className="joy-m-tool-refs">
              {refs.map((item) => (
                <span key={item.localId} className="joy-m-tool-ref">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt="" />
                  <button
                    type="button"
                    className="joy-m-tool-ref-rm"
                    aria-label="移除"
                    onClick={() => removeRef(item.localId)}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {canAdd ? (
                <button
                  type="button"
                  className="joy-m-tool-ref-add"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="size-5" strokeWidth={1.7} />
                  <span>添加</span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple={tool.refsMax > 1}
              hidden
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}

        {videosMax > 0 ? (
          <div className="joy-m-tool-block">
            <div className="joy-m-tool-block-head">
              <span className="joy-m-tool-label">参考视频</span>
              <span className="joy-m-tool-hint">
                {videos.length}/{videosMax}
                {videosRequired > 0 ? ` · 至少 ${videosRequired}` : ""}
              </span>
            </div>
            <div className="joy-m-tool-refs">
              {videos.map((item) => (
                <span key={item.localId} className="joy-m-tool-ref is-video">
                  <Video className="size-5" />
                  <button
                    type="button"
                    className="joy-m-tool-ref-rm"
                    aria-label="移除"
                    onClick={() => removeVideo(item.localId)}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {canAddVideo ? (
                <button
                  type="button"
                  className="joy-m-tool-ref-add"
                  onClick={() => videoRef.current?.click()}
                >
                  <Plus className="size-5" strokeWidth={1.7} />
                  <span>视频</span>
                </button>
              ) : null}
            </div>
            <input
              ref={videoRef}
              type="file"
              accept="video/*"
              multiple={videosMax > 1}
              hidden
              onChange={(e) => {
                if (e.target.files?.length) addVideos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}

        {showParams ? (
          <div className="joy-m-tool-params">
            {layout.showRatio && layout.aspects.length > 0 ? (
              <button
                type="button"
                className="joy-m-tool-param"
                onClick={() => setParamOpen("ratio")}
              >
                <Ratio className="size-3.5" strokeWidth={1.8} />
                {ratioLabel}
              </button>
            ) : null}
            {layout.showResolution && layout.resolutions.length > 0 ? (
              <button
                type="button"
                className="joy-m-tool-param"
                onClick={() => setParamOpen("resolution")}
              >
                {resolutionLabel}
              </button>
            ) : null}
            {layout.showSizePicker && layout.sizes.length > 0 ? (
              <button
                type="button"
                className="joy-m-tool-param"
                onClick={() => setParamOpen("size")}
              >
                {sizeLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="joy-m-tool-block">
          <div className="joy-m-tool-block-head">
            <span className="joy-m-tool-label">
              {tool.kind === "llm" && tool.llmPurpose === "prompt_optimize"
                ? "原始提示词"
                : tool.noteRequired
                  ? "说明"
                  : "说明"}
            </span>
            <span className="joy-m-tool-hint">
              {tool.noteRequired ? "必填" : "可选"}
            </span>
          </div>
          <TextArea
            className="joy-m-tool-note"
            value={note}
            onChange={setNote}
            rows={3}
            maxLength={800}
            placeholder={
              tool.noteHint?.trim() ||
              (tool.kind === "llm"
                ? "粘贴或输入文本…"
                : "补充场景、风格或短句…")
            }
          />
          {examples.length > 0 ? (
            <div className="joy-m-tool-examples">
              {examples.slice(0, 3).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="joy-m-tool-example"
                  onClick={() => setNote(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="joy-m-tool-dock">
        <Button
          color="primary"
          className="joy-m-tool-submit"
          disabled={!canGenerate}
          loading={pendingCount > 0}
          onClick={() => void submit()}
        >
          <span className="joy-m-tool-submit-inner">
            <WandSparkles className="size-4" strokeWidth={1.9} />
            {tool.submitLabel?.trim() ||
              (tool.kind === "llm" ? "开始" : "生成")}
            {pendingCount > 0 ? ` · ${pendingCount}` : ""}
          </span>
        </Button>
      </div>

      <section className="joy-m-tool-results">
        <div className="joy-m-tool-results-head">
          <h2>
            <Sparkles className="size-3.5" strokeWidth={2} />
            结果
          </h2>
          {pendingCount > 0 ? <DotLoading color="primary" /> : null}
        </div>

        {selected?.status === "failed" ? (
          <p className="joy-m-tool-error">
            {selected.error?.trim() || "生成失败"}
          </p>
        ) : null}

        {resultText ? (
          <pre className="joy-m-tool-text">{resultText}</pre>
        ) : null}

        {results.length > 0 ? (
          <div className="joy-m-tool-result-grid">
            {results.map((asset) => {
              const src =
                assetListImageUrl({ url: asset.url, size: "md" }) || asset.url;
              return (
                <button
                  key={asset.id}
                  type="button"
                  className="joy-m-tool-result"
                  onClick={() => {
                    ImageViewer.show({ image: asset.url });
                  }}
                >
                  <Image src={src} fit="cover" alt="" lazy />
                </button>
              );
            })}
          </div>
        ) : selected?.status === "pending" ? (
          <div className="joy-m-tool-pending">
            <DotLoading color="primary" />
            <span>生成中…</span>
          </div>
        ) : !resultText ? (
          <div className="joy-m-tool-empty">
            <span className="joy-m-tool-empty-ico" aria-hidden>
              <WandSparkles className="size-5" strokeWidth={1.6} />
            </span>
            <p>上传参考并生成后，结果会出现在这里</p>
          </div>
        ) : null}
      </section>

      {history.length > 0 ? (
        <section className="joy-m-tool-history">
          <h2>历史</h2>
          <div className="joy-m-tool-history-row">
            {history.slice(0, 24).map((item) => {
              const thumb = item.assets[0]?.url;
              const src = thumb
                ? assetListImageUrl({ url: thumb, size: "sm" }) || thumb
                : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "joy-m-tool-history-item",
                    item.id === selected?.id && "is-active",
                    item.status === "pending" && "is-pending",
                    item.status === "failed" && "is-failed",
                  )}
                  onClick={() => selectHistory(item.id)}
                >
                  {src ? (
                    <Image src={src} fit="cover" alt="" lazy />
                  ) : (
                    <span className="joy-m-tool-history-ph">
                      {item.status === "pending" ? (
                        <DotLoading color="primary" />
                      ) : item.resultText ? (
                        "文"
                      ) : (
                        "·"
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <Popup
        visible={modelOpen}
        onMaskClick={() => setModelOpen(false)}
        onClose={() => setModelOpen(false)}
        bodyClassName="joy-m-studio-sheet"
        position="bottom"
      >
        <div className="joy-m-studio-sheet-inner">
          <div className="joy-m-studio-sheet-head">
            <h3>
              选择
              {tool.kind === "video"
                ? "视频"
                : tool.kind === "llm"
                  ? "文本"
                  : "图像"}
              模型
            </h3>
            <button
              type="button"
              onClick={() => setModelOpen(false)}
              aria-label="关闭"
            >
              <X className="size-5" />
            </button>
          </div>
          {models.length === 0 ? (
            <p className="joy-m-tool-empty is-plain">暂无可用模型</p>
          ) : (
            <CheckList
              value={modelId ? [modelId] : []}
              onChange={(v) => {
                const id = String(v[0] ?? "");
                if (id) {
                  chooseModel(id);
                  setModelOpen(false);
                }
              }}
            >
              {models.map((m) => {
                const icon = modelIconSrc({
                  remoteId: m.remoteId,
                  name: m.name,
                });
                return (
                  <CheckList.Item key={m.id} value={m.id}>
                    <div className="joy-m-studio-model-row">
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={icon}
                          alt=""
                          className="joy-m-studio-model-row-icon"
                          draggable={false}
                        />
                      ) : (
                        <span
                          className="joy-m-studio-model-row-icon is-ph"
                          aria-hidden
                        />
                      )}
                      <div className="joy-m-studio-model-row-text">
                        <span className="joy-m-studio-model-row-name">
                          {m.name}
                        </span>
                        {m.channel?.name ? (
                          <span className="joy-m-studio-model-row-chan">
                            {m.channel.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </CheckList.Item>
                );
              })}
            </CheckList>
          )}
        </div>
      </Popup>

      <Popup
        visible={paramOpen !== null}
        onMaskClick={() => setParamOpen(null)}
        onClose={() => setParamOpen(null)}
        position="bottom"
        bodyClassName="joy-m-studio-param-sheet"
        destroyOnClose
      >
        <div className="joy-m-studio-param-sheet-inner">
          <div className="joy-m-studio-model-sheet-handle" aria-hidden />
          <h3 className="joy-m-studio-model-sheet-title">
            {paramOpen === "ratio"
              ? "画面比例"
              : paramOpen === "resolution"
                ? "清晰度"
                : "尺寸"}
          </h3>
          <div className="joy-m-studio-param-options">
            {paramOpen === "ratio"
              ? layout.aspects.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={cn(
                      "joy-m-studio-param-opt",
                      ratio === a.id && "is-active",
                    )}
                    onClick={() => {
                      chooseRatio(a.id);
                      setParamOpen(null);
                    }}
                  >
                    {a.label}
                  </button>
                ))
              : null}
            {paramOpen === "resolution"
              ? layout.resolutions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={cn(
                      "joy-m-studio-param-opt",
                      resolution === r.id && "is-active",
                    )}
                    onClick={() => {
                      chooseResolution(r.id);
                      setParamOpen(null);
                    }}
                  >
                    {r.label}
                  </button>
                ))
              : null}
            {paramOpen === "size"
              ? layout.sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      "joy-m-studio-param-opt",
                      sizeId === s.id && "is-active",
                    )}
                    onClick={() => {
                      chooseSize(s.id);
                      setParamOpen(null);
                    }}
                  >
                    {s.label}
                  </button>
                ))
              : null}
          </div>
        </div>
      </Popup>
    </div>
  );
}
