"use client";

import { CanvasIconLoader } from "./icons/canvas-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Box,
  ChevronDown,
  Clock,
  RectangleHorizontal,
  X,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import type { CanvasNode, ModelCapabilities } from "@joyai/shared";
import type { Viewport } from "./store";
import { useCanvasStore } from "./store";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { videoRefMode } from "./lib/video-ref-mode";
import { wrapPanoramaPrompt } from "./lib/panorama-prompt";
import {
  applyCameraPrompt,
  parseCameraControl,
  type CameraControlOptions,
} from "./lib/camera-control";
import {
  collectVideoFrameCandidates,
  orderVideoImageRefs,
  resolveVideoFrameSlots,
} from "./lib/video-frame-slots";
import { CanvasCameraControl } from "./canvas-camera-control";
import { CanvasRefThumb } from "./canvas-ref-thumb";
import {
  buildCanvasMentionItems,
  collectIncomingMediaFromEdges,
  mergeJobReferences,
  appendTextRefs,
} from "./lib/canvas-media-refs";
import { nodeBox } from "./lib/node-box";
import { titleFromPrompt } from "./lib/node-title";
import { NodeRefBar } from "./node-ref-bar";
import {
  durationsFromCapabilities,
  layoutControlsFromCapabilities,
} from "@/features/studio/model-options";
import { DurationSlider } from "@/features/studio/duration-slider";
import {
  AiPromptEditor,
  getGeneratePayload,
  setEditorPlainText,
} from "@/features/ai-prompt";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { isBusyStatus } from "./node-registry";
import "@/features/studio/creation-composer.css";
import "./node-gen-panel.css";
import { CANVAS_TEXT_FONT } from "@/shared/theme";

type Props = {
  node: CanvasNode;
  viewport: Viewport;
  onClose?: () => void;
};

type GenKind = "image" | "video" | "text" | "audio";

type PublicModel = {
  id: string;
  name: string;
  kind: "image" | "video" | "llm" | "audio";
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { name?: string };
};

const DEFAULT_TTS_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

const DEFAULT_TTS_FORMATS = [
  "mp3",
  "wav",
  "opus",
  "aac",
  "flac",
  "pcm",
] as const;

function modelBrandIcon(m: PublicModel) {
  return modelIconSrc({ remoteId: m.remoteId, name: m.name });
}

function panelAnchor(node: CanvasNode, viewport: Viewport) {
  const box = nodeBox(node);
  const left = viewport.x + (box.x + box.width / 2) * viewport.zoom;
  const top = viewport.y + (box.y + box.height) * viewport.zoom + 14;
  return { left, top };
}

function pickModelId(
  models: PublicModel[],
  kind: GenKind,
  preferred?: string,
) {
  const list = models.filter((item) =>
    kind === "text" ? item.kind === "llm" : item.kind === kind,
  );
  if (!list.length) return "";
  if (preferred && list.some((item) => item.id === preferred)) return preferred;
  return list[0]!.id;
}

function kindForNode(node: CanvasNode): GenKind {
  if (node.type === "video") return "video";
  if (node.type === "audio") return "audio";
  return "image";
}

/** Prefer in-progress draft; fall back to last submitted prompt when draft was cleared. */
function resolveGenText(data: CanvasNode["data"]): string {
  const draft = String(data.genDraft ?? "").trim();
  if (draft) return String(data.genDraft ?? "");
  return String(data.prompt ?? "");
}

/**
 * Below-node generate panel — studio-like shell + AI rich prompt.
 */
export function NodeGenPanel({ node, viewport, onClose }: Props) {
  const projectId = useCanvasStore((s) => s.projectId);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const editorRef = useRef<Editor | null>(null);

  const panorama = node.type === "panorama";
  const url = String(node.data.url ?? "");
  const hasMedia = Boolean(url) && !url.startsWith("data:");
  const status = String(node.data.status ?? "idle");
  const nodeError = String(node.data.error ?? "").trim();

  const [prompt, setPrompt] = useState(() => resolveGenText(node.data));
  const [busy, setBusy] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState(() =>
    String(node.data.genModelId ?? ""),
  );
  const [ratio, setRatio] = useState(() =>
    panorama ? "2:1" : String(node.data.genRatio ?? "auto"),
  );
  const [resolution, setResolution] = useState(() =>
    String(node.data.genResolution ?? ""),
  );
  const [duration, setDuration] = useState(() => {
    const n = Number(node.data.genDuration);
    return Number.isFinite(n) && n > 0 ? n : 5;
  });
  const [imageCount, setImageCount] = useState(() => {
    const n = Number(node.data.genCount);
    return Number.isFinite(n) ? Math.min(4, Math.max(1, Math.floor(n))) : 1;
  });
  const [voice, setVoice] = useState(() =>
    String(node.data.genVoice ?? "alloy"),
  );
  const [audioFormat, setAudioFormat] = useState(() =>
    String(node.data.genAudioFormat ?? "mp3"),
  );
  const [audioSpeed, setAudioSpeed] = useState(() => {
    const n = Number(node.data.genAudioSpeed);
    return Number.isFinite(n) ? Math.min(4, Math.max(0.25, n)) : 1;
  });
  const [cameraControl, setCameraControl] = useState<CameraControlOptions>(() =>
    parseCameraControl(node.data.cameraControl),
  );
  const [firstFrameNodeId, setFirstFrameNodeId] = useState(
    () => String(node.data.firstFrameNodeId ?? "") || "",
  );
  const [lastFrameNodeId, setLastFrameNodeId] = useState(
    () => String(node.data.lastFrameNodeId ?? "") || "",
  );

  const output: GenKind = kindForNode(node);
  const mentionItems = useMemo(() => {
    const { incoming } = collectIncomingMediaFromEdges(nodes, edges, node.id);
    return buildCanvasMentionItems(incoming);
  }, [nodes, edges, node.id]);

  useEffect(() => {
    setPrompt(resolveGenText(node.data));
    setModelId(String(node.data.genModelId ?? ""));
    setRatio(panorama ? "2:1" : String(node.data.genRatio ?? "auto"));
    setResolution(String(node.data.genResolution ?? ""));
    const n = Number(node.data.genDuration);
    setDuration(Number.isFinite(n) && n > 0 ? n : 5);
    const count = Number(node.data.genCount);
    setImageCount(
      Number.isFinite(count) ? Math.min(4, Math.max(1, Math.floor(count))) : 1,
    );
    setVoice(String(node.data.genVoice ?? "alloy"));
    setAudioFormat(String(node.data.genAudioFormat ?? "mp3"));
    const speed = Number(node.data.genAudioSpeed);
    setAudioSpeed(
      Number.isFinite(speed) ? Math.min(4, Math.max(0.25, speed)) : 1,
    );
    setCameraControl(parseCameraControl(node.data.cameraControl));
    setFirstFrameNodeId(String(node.data.firstFrameNodeId ?? "") || "");
    setLastFrameNodeId(String(node.data.lastFrameNodeId ?? "") || "");
    setBusy(false);
    setParamsOpen(false);
  }, [node.id, panorama]);

  useEffect(() => {
    let alive = true;
    void api<PublicModel[]>("/models")
      .then((list) => {
        if (!alive) return;
        setModels(
          list.filter(
            (item) =>
              item.kind === "image" ||
              item.kind === "video" ||
              item.kind === "llm" ||
              item.kind === "audio",
          ),
        );
      })
      .catch(() => {
        if (alive) toast.error("加载模型失败");
      });
    return () => {
      alive = false;
    };
  }, []);

  const kindModels = useMemo(
    () =>
      models.filter((item) =>
        output === "text" ? item.kind === "llm" : item.kind === output,
      ),
    [models, output],
  );

  useEffect(() => {
    if (!kindModels.length) return;
    setModelId((prev) => pickModelId(kindModels, output, prev));
  }, [kindModels, output]);

  const selectedModel = kindModels.find((item) => item.id === modelId);
  const layout = useMemo(
    () =>
      layoutControlsFromCapabilities(
        selectedModel?.capabilities ?? null,
        output === "video" ? "video" : "image",
      ),
    [selectedModel, output],
  );
  const voiceOptions = useMemo(() => {
    const fromCaps = selectedModel?.capabilities?.voices?.filter(Boolean);
    return fromCaps?.length ? fromCaps : [...DEFAULT_TTS_VOICES];
  }, [selectedModel]);
  const formatOptions = useMemo(() => {
    const fromCaps =
      selectedModel?.capabilities?.audioFormats?.filter(Boolean);
    return fromCaps?.length ? fromCaps : [...DEFAULT_TTS_FORMATS];
  }, [selectedModel]);
  const durations = useMemo(
    () => durationsFromCapabilities(selectedModel?.capabilities ?? null),
    [selectedModel],
  );

  useEffect(() => {
    if (panorama) {
      setRatio("2:1");
      return;
    }
    if (!layout.showRatio || !layout.aspects.length) return;
    setRatio((prev) =>
      layout.aspects.some((item) => item.id === prev)
        ? prev
        : layout.aspects[0]!.id,
    );
  }, [layout, panorama]);

  useEffect(() => {
    if (!layout.showResolution || !layout.resolutions.length) return;
    setResolution((prev) =>
      layout.resolutions.some((item) => item.id === prev)
        ? prev
        : layout.resolutions[0]!.id,
    );
  }, [layout]);

  useEffect(() => {
    if (output !== "video" || !durations.length) return;
    setDuration((prev) => (durations.includes(prev) ? prev : durations[0]!));
  }, [durations, output]);

  const { left, top } = useMemo(
    () => panelAnchor(node, viewport),
    [node, viewport],
  );

  const running = isBusyStatus(status) || busy;
  const edgeRefs = useMemo(
    () => collectIncomingMediaFromEdges(nodes, edges, node.id),
    [edges, node.id, nodes],
  );

  const frameCandidates = useMemo(
    () => collectVideoFrameCandidates(nodes, edges, node),
    [edges, node, nodes],
  );
  const frameSlots = useMemo(
    () =>
      resolveVideoFrameSlots({
        candidates: frameCandidates,
        firstFrameNodeId,
        lastFrameNodeId,
      }),
    [frameCandidates, firstFrameNodeId, lastFrameNodeId],
  );

  const canShowParams =
    output === "audio" ||
    output === "image" ||
    output === "video" ||
    (output !== "text" &&
      ((!panorama && layout.showRatio && layout.aspects.length > 0) ||
        (layout.showResolution && layout.resolutions.length > 0) ||
        (output === "video" && layout.showDuration && durations.length > 0)));

  function writeDraft(next: string) {
    setPrompt(next);
    updateNodeData(node.id, { genDraft: next });
  }

  function persistParams(patch: Record<string, unknown>) {
    updateNodeData(node.id, patch);
  }

  function clearPrompt() {
    writeDraft("");
    setEditorPlainText(editorRef.current, "", mentionItems);
  }

  async function submit() {
    const payload = getGeneratePayload(editorRef.current);
    const text = appendTextRefs(
      (payload.prompt.trim() || prompt.trim()).trim(),
      edgeRefs.texts,
    );
    if (!projectId || !text || running) return;
    if (!modelId) {
      toast.message("请先选择模型");
      return;
    }

    const assetId = String(node.data.assetId ?? "");
    const includeAv = output === "video";
    const merged = mergeJobReferences(
      payload,
      [...new Set([...(assetId ? [assetId] : []), ...edgeRefs.edgeAssetIds])],
      [
        ...new Set([...(hasMedia ? [url] : []), ...edgeRefs.edgeUrls]),
      ].filter((item) => item && !item.startsWith("data:")),
      includeAv,
    );
    const referenceAssetIds = merged.referenceAssetIds;
    const referenceUrls = merged.referenceUrls;

    setBusy(true);
    pushHistory();
    let targetId = node.id;
    let createdTarget = false;

    try {
      if (output === "image") {
        const reuseEmpty =
          (node.type === "image" || node.type === "panorama") && !hasMedia;
        if (!reuseEmpty) {
          targetId = addNode(panorama ? "panorama" : "image", {
            x: node.x + (node.width ?? 240) + 40,
            y: node.y,
          });
          addEdge(node.id, targetId);
          createdTarget = true;
        }
        const promptText = applyCameraPrompt(
          panorama
            ? wrapPanoramaPrompt(text, { hasReference: hasMedia })
            : text,
          panorama ? null : cameraControl,
        );
        const aspect = layout.aspects.find((item) => item.id === ratio);
        const named = titleFromPrompt(text);
        const keepTitle = Boolean(
          String(
            useCanvasStore.getState().nodes.find((item) => item.id === targetId)
              ?.data.title ?? "",
          ).trim(),
        );
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          prompt: text,
          genDraft: text,
          cameraControl,
          ...(named && !keepTitle ? { title: named } : {}),
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "image",
            input: {
              prompt: promptText,
              n: Math.min(4, Math.max(1, imageCount)),
              modelId,
              ratio: panorama ? "2:1" : layout.showRatio ? ratio : undefined,
              resolution:
                layout.showResolution && resolution ? resolution : undefined,
              width:
                panorama || !aspect || aspect.flexible
                  ? undefined
                  : aspect.width,
              height:
                panorama || !aspect || aspect.flexible
                  ? undefined
                  : aspect.height,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
              referenceAssetIds,
              referenceUrls,
              operation: "generate",
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
        persistParams({ genCount: imageCount, cameraControl });
      } else if (output === "text") {
        targetId = addNode("text", {
          x: node.x + (node.width ?? 240) + 40,
          y: node.y,
        });
        addEdge(node.id, targetId);
        createdTarget = true;
        useCanvasStore.getState().updateNode(targetId, { width: 360, height: 160 });
        const named = titleFromPrompt(text);
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          text: "",
          fontSize: CANVAS_TEXT_FONT.default,
          ...(named ? { title: named } : { title: "生成文本" }),
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "llm",
            input: {
              purpose: "chat",
              prompt: text,
              modelId,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
              referenceAssetIds,
              referenceUrls,
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
      } else if (output === "audio") {
        if (node.type !== "audio" || hasMedia) {
          targetId = addNode("audio", {
            x: node.x + (node.width ?? 240) + 40,
            y: node.y,
          });
          addEdge(node.id, targetId);
          createdTarget = true;
        }
        const named = titleFromPrompt(text);
        const keepTitle = Boolean(
          String(
            useCanvasStore.getState().nodes.find((item) => item.id === targetId)
              ?.data.title ?? "",
          ).trim(),
        );
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          prompt: text,
          genDraft: text,
          ...(named && !keepTitle ? { title: named } : {}),
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "audio",
            input: {
              prompt: text,
              modelId,
              voice,
              format: audioFormat,
              speed: audioSpeed,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
        persistParams({
          genVoice: voice,
          genAudioFormat: audioFormat,
          genAudioSpeed: audioSpeed,
        });
      } else {
        if (node.type !== "video" || hasMedia) {
          targetId = addNode("video", {
            x: node.x + (node.width ?? 240) + 40,
            y: node.y,
          });
          addEdge(node.id, targetId);
          createdTarget = true;
        }
        const named = titleFromPrompt(text);
        const keepTitle = Boolean(
          String(
            useCanvasStore.getState().nodes.find((item) => item.id === targetId)
              ?.data.title ?? "",
          ).trim(),
        );
        const ordered = orderVideoImageRefs({
          first: frameSlots.first,
          last: frameSlots.last,
          otherAssetIds: referenceAssetIds,
          otherUrls: referenceUrls,
        });
        const videoPrompt = applyCameraPrompt(text, cameraControl);
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          prompt: text,
          genDraft: text,
          cameraControl,
          firstFrameNodeId: frameSlots.first?.nodeId ?? "",
          lastFrameNodeId: frameSlots.last?.nodeId ?? "",
          ...(named && !keepTitle ? { title: named } : {}),
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "video",
            input: {
              prompt: videoPrompt,
              modelId,
              duration: layout.showDuration ? duration : undefined,
              ratio: layout.showRatio ? ratio : undefined,
              resolution:
                layout.showResolution && resolution ? resolution : undefined,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
              referenceAssetIds: ordered.referenceAssetIds,
              referenceUrls: ordered.referenceUrls,
              refMode:
                ordered.refMode ??
                videoRefMode(
                  Math.max(
                    ordered.referenceAssetIds.length,
                    ordered.referenceUrls.length,
                  ),
                ),
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
        persistParams({
          cameraControl,
          firstFrameNodeId: frameSlots.first?.nodeId ?? "",
          lastFrameNodeId: frameSlots.last?.nodeId ?? "",
        });
      }
      // Keep the prompt in the editor so reopening the panel still shows
      // what produced this node (draft may have been wiped by older clients).
      writeDraft(text);
      toast.success(
        panorama
          ? "已提交全景任务"
          : output === "video"
            ? "已提交视频任务"
            : output === "audio"
              ? "已提交语音任务"
              : "已提交图像任务",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "提交失败";
      if (createdTarget && targetId !== node.id) {
        removeNodes([targetId]);
      } else {
        updateNodeData(targetId, { status: "failed", error: message });
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const modelLabel =
    selectedModel?.name ?? (kindModels.length ? "选择模型" : "无模型");
  const ratioLabel = panorama
    ? "2:1"
    : (layout.aspects.find((item) => item.id === ratio)?.label ?? ratio);
  const resolutionLabel =
    layout.resolutions.find((item) => item.id === resolution)?.label ??
    resolution;
  const ready = Boolean(prompt.trim() && projectId && modelId && !running);

  const placeholder = panorama
    ? "描述全景场景，将按 2:1 等距圆柱生成… / 指令 · @ 引用"
    : output === "audio"
      ? "输入要朗读的文本… /语音"
      : hasMedia
        ? output === "video"
          ? "描述运动与镜头…（当前媒体作参考）"
          : "描述画面…（当前媒体作参考）"
        : output === "video"
          ? "描述要生成的视频… / 指令 · @ 引用"
          : "描述要生成的图像… / 指令 · @ 引用";

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="absolute z-30 -translate-x-1/2"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose?.();
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
      }}
    >
      <div className="joy-node-gen">
        {prompt.trim() ? (
          <button
            type="button"
            className="joy-node-gen-clear"
            aria-label="清空"
            onClick={clearPrompt}
          >
            <X className="size-3.5" />
          </button>
        ) : null}

        <div className="joy-node-gen-body">
          <div className="joy-node-gen-main">
            <NodeRefBar nodeId={node.id} />
            {output === "video" && frameCandidates.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5">
                <FrameSlotPicker
                  label="首帧"
                  value={frameSlots.first?.nodeId ?? ""}
                  candidates={frameCandidates}
                  excludeId={frameSlots.last?.nodeId}
                  onChange={(id) => {
                    setFirstFrameNodeId(id);
                    persistParams({ firstFrameNodeId: id });
                  }}
                />
                <FrameSlotPicker
                  label="尾帧"
                  value={frameSlots.last?.nodeId ?? ""}
                  candidates={frameCandidates}
                  excludeId={frameSlots.first?.nodeId}
                  allowEmpty
                  onChange={(id) => {
                    setLastFrameNodeId(id);
                    persistParams({ lastFrameNodeId: id });
                  }}
                />
              </div>
            ) : null}
            <AiPromptEditor
              key={node.id}
              editorRef={editorRef}
              initialText={resolveGenText(node.data)}
              mentionItems={mentionItems}
              placeholder={placeholder}
              disabled={running}
              allowKindSwitch={false}
              onPlainChange={writeDraft}
            />
          </div>
        </div>

        {nodeError && status === "failed" ? (
          <p className="joy-node-gen-error">{nodeError}</p>
        ) : null}

        <div className="joy-node-gen-toolbar">
          <div className="joy-node-gen-toolbar-left">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="joy-chip joy-chip-model">
                  {selectedModel ? (
                    <BrandAvatar
                      src={modelBrandIcon(selectedModel)}
                      label={selectedModel.name}
                      size={16}
                      rounded="md"
                    />
                  ) : (
                    <Box className="size-3.5 opacity-80" />
                  )}
                  <span className="joy-chip-model-name">{modelLabel}</span>
                  <ChevronDown className="size-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="joy-composer-model-menu min-w-[240px]"
                data-canvas-shortcuts-ignore
              >
                {kindModels.length === 0 ? (
                  <DropdownMenuItem disabled>暂无可用模型</DropdownMenuItem>
                ) : (
                  kindModels.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      className={cn(
                        "joy-composer-model-item",
                        item.id === modelId && "is-selected",
                      )}
                      onClick={() => {
                        setModelId(item.id);
                        persistParams({ genModelId: item.id });
                      }}
                    >
                      <BrandAvatar
                        src={modelBrandIcon(item)}
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

            {canShowParams ? (
              <DropdownMenu open={paramsOpen} onOpenChange={setParamsOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="joy-chip-params-pill"
                    aria-label="生成参数"
                  >
                    {!panorama && layout.showRatio && output !== "audio" ? (
                      <span className="joy-chip-params-seg">
                        <RectangleHorizontal className="size-3.5 opacity-70" />
                        {ratioLabel}
                      </span>
                    ) : panorama ? (
                      <span className="joy-chip-params-seg">
                        <RectangleHorizontal className="size-3.5 opacity-70" />
                        2:1
                      </span>
                    ) : null}
                    {layout.showResolution && output !== "audio" ? (
                      <>
                        {(!panorama && layout.showRatio) || panorama ? (
                          <span className="joy-chip-params-sep" aria-hidden />
                        ) : null}
                        <span className="joy-chip-params-seg">
                          {resolutionLabel || "清晰度"}
                        </span>
                      </>
                    ) : null}
                    {output === "video" && layout.showDuration ? (
                      <>
                        {(!panorama && layout.showRatio) ||
                        layout.showResolution ||
                        panorama ? (
                          <span className="joy-chip-params-sep" aria-hidden />
                        ) : null}
                        <span className="joy-chip-params-seg">
                          <Clock className="size-3.5 opacity-70" />
                          {duration}秒
                        </span>
                      </>
                    ) : null}
                    {output === "image" ? (
                      <>
                        {(!panorama && layout.showRatio) ||
                        layout.showResolution ||
                        panorama ? (
                          <span className="joy-chip-params-sep" aria-hidden />
                        ) : null}
                        <span className="joy-chip-params-seg">
                          {imageCount}张
                        </span>
                      </>
                    ) : null}
                    {output === "audio" ? (
                      <>
                        <span className="joy-chip-params-seg">{voice}</span>
                        <span className="joy-chip-params-sep" aria-hidden />
                        <span className="joy-chip-params-seg">
                          {audioFormat.toUpperCase()}
                        </span>
                        <span className="joy-chip-params-sep" aria-hidden />
                        <span className="joy-chip-params-seg">
                          {audioSpeed}x
                        </span>
                      </>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="p-3 w-[min(320px,calc(100vw-48px))]"
                  data-canvas-shortcuts-ignore
                >
                  <div className="joy-composer-params-panel">
                    {output === "audio" ? (
                      <>
                        <div className="joy-composer-params-row">
                          <span className="joy-composer-params-label">音色</span>
                          <div className="joy-composer-params-options">
                            {voiceOptions.map((item) => (
                              <button
                                key={item}
                                type="button"
                                className={cn(
                                  "joy-composer-params-option",
                                  voice === item && "is-on",
                                )}
                                onClick={() => {
                                  setVoice(item);
                                  persistParams({ genVoice: item });
                                }}
                              >
                                {item}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="joy-composer-params-row">
                          <span className="joy-composer-params-label">格式</span>
                          <div className="joy-composer-params-options">
                            {formatOptions.map((item) => (
                              <button
                                key={item}
                                type="button"
                                className={cn(
                                  "joy-composer-params-option",
                                  audioFormat === item && "is-on",
                                )}
                                onClick={() => {
                                  setAudioFormat(item);
                                  persistParams({ genAudioFormat: item });
                                }}
                              >
                                {item.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="joy-composer-params-row">
                          <div className="joy-composer-params-label-row">
                            <span className="joy-composer-params-label">语速</span>
                            <span className="joy-composer-params-value">
                              {audioSpeed}x
                            </span>
                          </div>
                          <div className="joy-composer-params-options">
                            {[0.75, 1, 1.25, 1.5, 2].map((item) => (
                              <button
                                key={item}
                                type="button"
                                className={cn(
                                  "joy-composer-params-option",
                                  audioSpeed === item && "is-on",
                                )}
                                onClick={() => {
                                  setAudioSpeed(item);
                                  persistParams({ genAudioSpeed: item });
                                }}
                              >
                                {item}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                    {!panorama && layout.showRatio && output !== "audio" ? (
                      <div className="joy-composer-params-row">
                        <span className="joy-composer-params-label">比例</span>
                        <div className="joy-composer-params-options">
                          {layout.aspects.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={cn(
                                "joy-composer-params-option",
                                ratio === item.id && "is-on",
                              )}
                              onClick={() => {
                                setRatio(item.id);
                                persistParams({ genRatio: item.id });
                              }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {layout.showResolution && output !== "audio" ? (
                      <div className="joy-composer-params-row">
                        <span className="joy-composer-params-label">清晰度</span>
                        <div className="joy-composer-params-options">
                          {layout.resolutions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={cn(
                                "joy-composer-params-option",
                                resolution === item.id && "is-on",
                              )}
                              onClick={() => {
                                setResolution(item.id);
                                persistParams({ genResolution: item.id });
                              }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {output === "video" && layout.showDuration ? (
                      <div className="joy-composer-params-row">
                        <div className="joy-composer-params-label-row">
                          <span className="joy-composer-params-label">时长</span>
                          <span className="joy-composer-params-value">
                            {duration}s
                          </span>
                        </div>
                        {durations.length <= 1 ? (
                          <div className="joy-composer-params-slider-fixed">
                            {duration}s
                          </div>
                        ) : (
                          <DurationSlider
                            options={durations}
                            value={duration}
                            onChange={(next) => {
                              setDuration(next);
                              persistParams({ genDuration: next });
                            }}
                          />
                        )}
                      </div>
                    ) : null}

                    {output === "image" ? (
                      <div className="joy-composer-params-row">
                        <span className="joy-composer-params-label">数量</span>
                        <div className="joy-composer-params-options">
                          {[1, 2, 3, 4].map((count) => (
                            <button
                              key={count}
                              type="button"
                              className={cn(
                                "joy-composer-params-option",
                                imageCount === count && "is-on",
                              )}
                              onClick={() => {
                                setImageCount(count);
                                persistParams({ genCount: count });
                              }}
                            >
                              {count}张
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {(output === "image" || output === "video") && !panorama ? (
              <CanvasCameraControl
                value={cameraControl}
                onChange={(next) => {
                  setCameraControl(next);
                  persistParams({ cameraControl: next });
                }}
              />
            ) : null}
          </div>

          <button
            type="button"
            className={cn("joy-node-gen-send", ready && "is-ready")}
            disabled={!ready}
            aria-label={
              panorama
                ? "生成全景"
                : output === "video"
                  ? "生成视频"
                  : output === "audio"
                    ? "生成语音"
                    : "生成图像"
            }
            onClick={() => void submit()}
          >
            {running ? (
              <CanvasIconLoader className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FrameSlotPicker({
  label,
  value,
  candidates,
  excludeId,
  allowEmpty,
  onChange,
}: {
  label: string;
  value: string;
  candidates: ReturnType<typeof collectVideoFrameCandidates>;
  excludeId?: string;
  allowEmpty?: boolean;
  onChange: (nodeId: string) => void;
}) {
  const options = candidates.filter((item) => item.nodeId !== excludeId);
  const selected = options.find((item) => item.nodeId === value) ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
        >
          {selected ? (
            <CanvasRefThumb
              kind="image"
              url={selected.url}
              className="size-5 rounded-sm"
            />
          ) : (
            <span className="grid size-5 place-items-center rounded-sm bg-muted text-[10px]">
              —
            </span>
          )}
          <span>
            {label}
            {selected ? ` · ${selected.label}` : " · 未选"}
          </span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-canvas-shortcuts-ignore>
        {allowEmpty ? (
          <DropdownMenuItem onClick={() => onChange("")}>不使用</DropdownMenuItem>
        ) : null}
        {options.map((item) => (
          <DropdownMenuItem
            key={item.nodeId}
            className="gap-2"
            onClick={() => onChange(item.nodeId)}
          >
            <CanvasRefThumb
              kind="image"
              url={item.url}
              className="size-6 rounded-sm"
            />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
