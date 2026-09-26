"use client";

import { CanvasIconLoader } from "./icons/canvas-icons";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  Box,
  Camera,
  ChevronDown,
  ImageIcon,
  List,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  RectangleHorizontal,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import type { CanvasNode, ModelCapabilities } from "@joyai/shared";
import type { Viewport } from "./store";
import { useCanvasStore } from "./store";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import {
  genModeNeedsFirstFrame,
  genModeNeedsLastFrame,
  jobRefModeForGenMode,
  modelSupportsVideoGenMode,
  normalizeVideoGenMode,
  VIDEO_GEN_MODES,
  videoGenModeLabelById,
  type VideoGenModeId,
} from "./lib/video-ref-mode";
import { wrapPanoramaPrompt } from "./lib/panorama-prompt";
import {
  applyCameraPrompt,
  CAMERA_PRESETS,
  matchCameraPreset,
  parseCameraControl,
  type CameraControlOptions,
} from "./lib/camera-control";
import {
  collectVideoFrameCandidates,
  orderVideoImageRefs,
  resolveVideoFrameSlots,
} from "./lib/video-frame-slots";
import { CanvasCameraControl } from "./canvas-camera-control";
import {
  CanvasCameraMovePicker,
  composePromptWithCameraMoves,
  type SelectedCameraMove,
} from "./canvas-camera-move-picker";
import { CanvasPromptPresets } from "./canvas-prompt-presets";
import { CanvasStylePicker, composePromptWithStyle, type SelectedCanvasStyle } from "./canvas-style-picker";
import { CanvasNodeRefDialog } from "./canvas-node-ref-dialog";
import { CanvasAssetDialog } from "./canvas-asset-dialog";
import {
  buildCanvasMentionItems,
  collectIncomingMediaFromEdges,
  mergeJobReferences,
  appendTextRefs,
} from "./lib/canvas-media-refs";
import { nodeBox } from "./lib/node-box";
import {
  mediaNamePatch,
  originalNameFromAsset,
  titleFromPrompt,
} from "./lib/node-title";
import { frameNodeToMedia } from "./lib/fit-node-size";
import { nodeTypeForAssetKind } from "./lib/upload-node-type";
import { NodeRefBar } from "./node-ref-bar";
import {
  durationsFromCapabilities,
  layoutControlsFromCapabilities,
  modelSupportsVideoAudio,
} from "@/features/studio/model-options";
import { AspectRatioGlyph } from "@/features/studio/aspect-ratio-glyph";
import { DurationSlider } from "@/features/studio/duration-slider";
import { ComposerModelMenu } from "@/features/studio/composer-model-menu";
import {
  AiPromptEditor,
  getGeneratePayload,
  optimizePromptText,
  setEditorPlainText,
} from "@/features/ai-prompt";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { isBusyStatus } from "./node-registry";
import "@/features/studio/creation-composer.css";
import "./node-gen-panel.css";
import { CANVAS_TEXT_FONT } from "@/shared/theme";

type Props = {
  node: CanvasNode;
  viewport: Viewport;
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

function parseSelectedMoves(raw: unknown): SelectedCameraMove[] {
  if (!Array.isArray(raw)) return [];
  const out: SelectedCameraMove[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const slug = String(row.slug ?? "").trim();
    const prompt = String(row.prompt ?? "").trim();
    if (!slug || !prompt) continue;
    out.push({
      slug,
      label: String(row.label ?? "").trim() || slug,
      prompt,
      exclusiveGroup:
        typeof row.exclusiveGroup === "string" ? row.exclusiveGroup : null,
    });
  }
  return out.slice(0, 3);
}

/**
 * Below-node generate panel — studio-like shell + AI rich prompt.
 */
export function NodeGenPanel({ node, viewport }: Props) {
  const projectId = useCanvasStore((s) => s.projectId);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const removeEdge = useCanvasStore((s) => s.removeEdge);
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
  const [optimizing, setOptimizing] = useState(false);
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
  const [expanded, setExpanded] = useState(false);
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [generateAudio, setGenerateAudio] = useState(() => {
    const raw = node.data.genAudio;
    if (raw === false || raw === "false" || raw === 0) return false;
    return true;
  });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMoveOpen, setCameraMoveOpen] = useState(false);
  const [selectedMoves, setSelectedMoves] = useState<SelectedCameraMove[]>(
    () => parseSelectedMoves(node.data.genCameraMoves),
  );
  const [presetOpen, setPresetOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<SelectedCanvasStyle | null>(
    () => {
      const slug = String(node.data.genStyleSlug ?? "").trim();
      const label = String(node.data.genStyleLabel ?? "").trim();
      const prompt = String(node.data.genStylePrompt ?? "").trim();
      if (!slug || !prompt) return null;
      return { slug, label: label || slug, prompt };
    },
  );
  const [videoGenMode, setVideoGenMode] = useState<VideoGenModeId>(() =>
    normalizeVideoGenMode(node.data.genVideoMode, []),
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
    setVideoGenMode(normalizeVideoGenMode(node.data.genVideoMode, []));
    {
      const raw = node.data.genAudio;
      setGenerateAudio(!(raw === false || raw === "false" || raw === 0));
    }
    setExpanded(false);
    setCameraOpen(false);
    setCameraMoveOpen(false);
    setPresetOpen(false);
    setStyleOpen(false);
    setSelectedMoves(parseSelectedMoves(node.data.genCameraMoves));
    {
      const slug = String(node.data.genStyleSlug ?? "").trim();
      const label = String(node.data.genStyleLabel ?? "").trim();
      const stylePrompt = String(node.data.genStylePrompt ?? "").trim();
      setSelectedStyle(
        slug && stylePrompt
          ? { slug, label: label || slug, prompt: stylePrompt }
          : null,
      );
    }
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

  const kindModels = useMemo(() => {
    const base = models.filter((item) =>
      output === "text" ? item.kind === "llm" : item.kind === output,
    );
    if (output !== "video") return base;
    return base.filter((item) =>
      modelSupportsVideoGenMode(item.capabilities, videoGenMode),
    );
  }, [models, output, videoGenMode]);

  useEffect(() => {
    if (!kindModels.length) {
      if (output === "video") setModelId("");
      return;
    }
    setModelId((prev) => pickModelId(kindModels, output, prev));
  }, [kindModels, output]);

  const selectedModel = kindModels.find((item) => item.id === modelId);
  /** Mode list is fixed; models filter by the chosen mode. */
  const videoModes = output === "video" ? VIDEO_GEN_MODES : [];
  const showVideoAudioToggle =
    output === "video" &&
    modelSupportsVideoAudio(selectedModel?.capabilities ?? null);

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

  const running = isBusyStatus(status) || busy || optimizing;
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

  async function optimizePrompt() {
    const raw =
      getGeneratePayload(editorRef.current).prompt.trim() || prompt.trim();
    if (!raw || optimizing || busy || isBusyStatus(status)) return;
    setOptimizing(true);
    const toastId = toast.loading("正在优化提示词…");
    try {
      const next = await optimizePromptText(raw, {
        modelId: output === "text" ? modelId : undefined,
      });
      setEditorPlainText(editorRef.current, next, mentionItems);
      writeDraft(next);
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

  function attachPickedNodes(nodeIds: string[]) {
    const wanted = new Set(nodeIds);
    const refEdges = edges.filter((edge) => {
      if (edge.target !== node.id) return false;
      const source = nodes.find((item) => item.id === edge.source);
      if (!source) return false;
      return (
        source.type === "image" ||
        source.type === "video" ||
        source.type === "panorama" ||
        source.type === "audio" ||
        source.type === "text"
      );
    });
    const linked = new Set(refEdges.map((edge) => edge.source));

    pushHistory();
    let added = 0;
    let removed = 0;
    for (const edge of refEdges) {
      if (!wanted.has(edge.source)) {
        removeEdge(edge.id);
        removed += 1;
      }
    }
    for (const id of wanted) {
      if (linked.has(id)) continue;
      if (addEdge(id, node.id)) added += 1;
    }
    setRefPickerOpen(false);
    setMaterialOpen(false);
    if (added || removed) {
      toast.success(
        added && removed
          ? `已更新参考（+${added} / -${removed}）`
          : added
            ? added > 1
              ? `已连接 ${added} 个参考`
              : "已连接参考"
            : removed > 1
              ? `已断开 ${removed} 个参考`
              : "已断开参考",
      );
    }
  }

  function attachPickedAssets(
    assets: {
      id: string;
      url: string;
      kind: string;
      meta?: Record<string, unknown> | null;
      originalName?: string | null;
    }[],
  ) {
    if (!assets.length) return;
    pushHistory();
    const box = nodeBox(node);
    for (let i = 0; i < assets.length; i += 1) {
      const asset = assets[i]!;
      let type = nodeTypeForAssetKind(asset.kind);
      if (type !== "image" && type !== "video" && type !== "panorama") {
        type = "image";
      }
      const id = addNode(type, {
        x: box.x - 220 - i * 36,
        y: box.y + i * 28,
      });
      const fromAsset = originalNameFromAsset(asset);
      updateNodeData(id, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
        ...mediaNamePatch(fromAsset),
      });
      addEdge(id, node.id);
      if (type === "image" || type === "video") {
        void frameNodeToMedia(id, asset.url, type);
      }
    }
    setMaterialOpen(false);
    toast.success(
      assets.length > 1 ? `已添加 ${assets.length} 个参考` : "已添加参考",
    );
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

    const styledText = composePromptWithStyle(text, selectedStyle?.prompt);
    const jobText =
      output === "video"
        ? composePromptWithCameraMoves(styledText, selectedMoves)
        : styledText;

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

    if (output === "video") {
      if (genModeNeedsFirstFrame(videoGenMode) && !frameSlots.first) {
        toast.error(
          videoGenMode === "first_last"
            ? "首尾帧模式请先选择首帧"
            : "首帧模式请先选择首帧",
        );
        return;
      }
      if (genModeNeedsLastFrame(videoGenMode) && !frameSlots.last) {
        toast.error("首尾帧模式请选择尾帧");
        return;
      }
      if (
        videoGenMode === "omni" &&
        referenceAssetIds.length === 0 &&
        referenceUrls.length === 0
      ) {
        toast.error("参考生视频请先添加参考素材");
        return;
      }
    }

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
            ? wrapPanoramaPrompt(jobText, { hasReference: hasMedia })
            : jobText,
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
              prompt: jobText,
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
              prompt: jobText,
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
        const ordered =
          videoGenMode === "t2v"
            ? {
                referenceAssetIds: [] as string[],
                referenceUrls: [] as string[],
              }
            : videoGenMode === "first"
              ? orderVideoImageRefs({
                  first: frameSlots.first,
                  last: null,
                  otherAssetIds: [],
                  otherUrls: [],
                })
              : videoGenMode === "first_last"
                ? orderVideoImageRefs({
                    first: frameSlots.first,
                    last: frameSlots.last,
                    otherAssetIds: [],
                    otherUrls: [],
                  })
                : orderVideoImageRefs({
                    first: null,
                    last: null,
                    otherAssetIds: referenceAssetIds,
                    otherUrls: referenceUrls,
                  });
        const jobRefMode = jobRefModeForGenMode(videoGenMode);
        const videoPrompt = jobText;
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          prompt: text,
          genDraft: text,
          genCameraMoves: selectedMoves,
          genVideoMode: videoGenMode,
          firstFrameNodeId:
            videoGenMode === "t2v" || videoGenMode === "omni"
              ? ""
              : (frameSlots.first?.nodeId ?? ""),
          lastFrameNodeId:
            videoGenMode === "first_last"
              ? (frameSlots.last?.nodeId ?? "")
              : "",
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
              refMode: jobRefMode,
              generateAudio: showVideoAudioToggle ? generateAudio : undefined,
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
        persistParams({
          genCameraMoves: selectedMoves,
          genVideoMode: videoGenMode,
          genAudio: generateAudio,
          firstFrameNodeId:
            videoGenMode === "t2v" || videoGenMode === "omni"
              ? ""
              : (frameSlots.first?.nodeId ?? ""),
          lastFrameNodeId:
            videoGenMode === "first_last"
              ? (frameSlots.last?.nodeId ?? "")
              : "",
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
  const shellLayout =
    output === "video" || (output === "image" && !panorama);
  const activePresetId = matchCameraPreset(cameraControl);
  const cameraBtnLabel =
    cameraControl.enabled && activePresetId
      ? (CAMERA_PRESETS.find((p) => p.id === activePresetId)?.label ?? "摄像头")
      : cameraControl.enabled
        ? `${cameraControl.focalLength}mm`
        : "摄像头";
  const moveBtnLabel =
    selectedMoves.length === 0
      ? "运镜"
      : selectedMoves.length === 1
        ? selectedMoves[0]!.label
        : `${selectedMoves[0]!.label} +${selectedMoves.length - 1}`;
  const styleBtnLabel = selectedStyle?.label?.trim() || "风格";
  const mediaRefCount = edgeRefs.incoming.filter(
    (item) =>
      item.type === "image" ||
      item.type === "video" ||
      item.type === "panorama",
  ).length;
  const modeLabel =
    output === "video" ? videoGenModeLabelById(videoGenMode) : null;

  const placeholder = panorama
    ? "描述全景场景，将按 2:1 等距圆柱生成… / 指令 · @ 引用"
    : output === "audio"
      ? "输入要朗读的文本… /语音"
      : shellLayout
        ? "描述你想要生成的任何内容"
        : hasMedia
          ? "描述画面…（当前媒体作参考）"
          : "描述要生成的图像… / 指令 · @ 引用";

  const modelMenu = (
    <ComposerModelMenu
      models={kindModels}
      selectedId={modelId}
      onSelect={(id) => {
        setModelId(id);
        persistParams({ genModelId: id });
      }}
      contentProps={{ "data-canvas-shortcuts-ignore": true }}
    >
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
    </ComposerModelMenu>
  );

  const paramsMenu = canShowParams ? (
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
                {resolutionLabel || "分辨率"}
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
              <span className="joy-chip-params-seg">{duration}s</span>
            </>
          ) : null}
          {showVideoAudioToggle ? (
            <>
              {(!panorama && layout.showRatio) ||
              layout.showResolution ||
              layout.showDuration ||
              panorama ? (
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
          {output === "image" ? (
            <>
              {(!panorama && layout.showRatio) ||
              layout.showResolution ||
              panorama ? (
                <span className="joy-chip-params-sep" aria-hidden />
              ) : null}
              <span className="joy-chip-params-seg">{imageCount}张</span>
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
              <span className="joy-chip-params-seg">{audioSpeed}x</span>
            </>
          ) : null}
          <ChevronDown className="joy-chip-params-caret size-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="joy-composer-params-menu p-0 w-[min(300px,calc(100vw-48px))]"
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
              <div className="joy-composer-params-options is-aspect">
                {layout.aspects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "joy-composer-params-option is-aspect",
                      ratio === item.id && "is-on",
                    )}
                    onClick={() => {
                      setRatio(item.id);
                      persistParams({ genRatio: item.id });
                    }}
                  >
                    <AspectRatioGlyph ratio={item.id} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {layout.showResolution && output !== "audio" ? (
            <div className="joy-composer-params-row">
              <span className="joy-composer-params-label">
                {output === "video" ? "分辨率" : "清晰度"}
              </span>
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
            <div className="joy-composer-params-row is-duration">
              <span className="joy-composer-params-label">时长</span>
              <div className="joy-composer-params-duration">
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
                    className="joy-composer-params-duration-slider"
                  />
                )}
                <span className="joy-composer-params-duration-value">
                  <span className="joy-composer-params-duration-num">
                    {duration}
                  </span>
                  <span className="joy-composer-params-duration-unit">s</span>
                </span>
              </div>
            </div>
          ) : null}

          {showVideoAudioToggle ? (
            <div className="joy-composer-params-row is-switch">
              <span className="joy-composer-params-label">音频</span>
              <Switch
                checked={generateAudio}
                onCheckedChange={(checked) => {
                  setGenerateAudio(checked);
                  persistParams({ genAudio: checked });
                }}
                aria-label={generateAudio ? "关闭音频" : "开启音频"}
                className="joy-composer-params-switch"
              />
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
  ) : null;

  const sendButton = (
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
      {running && !optimizing ? (
        <CanvasIconLoader className="size-4 animate-spin" />
      ) : (
        <ArrowUp className="size-4" />
      )}
    </button>
  );

  const optimizeButton = (
    <button
      type="button"
      className={cn(
        "joy-node-gen-optimize",
        Boolean(prompt.trim()) && !running && "is-ready",
      )}
      disabled={!prompt.trim() || running}
      aria-label="提示词优化"
      title="提示词优化"
      onClick={() => void optimizePrompt()}
    >
      {optimizing ? (
        <CanvasIconLoader className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
    </button>
  );

  function onPanelKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (expanded) {
        setExpanded(false);
      }
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  const panel = (
    <div
      className={cn(
        "joy-node-gen",
        shellLayout && "is-shell",
        expanded && "is-modal",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {shellLayout ? (
        <div className="joy-node-gen-head">
          <div className="joy-node-gen-actions">
            <button
              type="button"
              className={cn(
                "joy-node-gen-action",
                (refPickerOpen || mediaRefCount > 0) && "is-active",
              )}
              disabled={running}
              onClick={() => setRefPickerOpen(true)}
            >
              <ImageIcon className="size-3.5 opacity-80" />
              参考
              {mediaRefCount > 0 ? (
                <span className="joy-node-gen-action-count">
                  {mediaRefCount}
                </span>
              ) : null}
            </button>

            {output === "video" ? (
              <button
                type="button"
                className={cn(
                  "joy-node-gen-action",
                  (cameraMoveOpen || selectedMoves.length > 0) && "is-active",
                )}
                title={
                  selectedMoves.length
                    ? selectedMoves.map((m) => m.label).join(" · ")
                    : "选择运镜"
                }
                onClick={() => setCameraMoveOpen(true)}
              >
                <Video className="size-3.5 shrink-0 opacity-80" />
                <span className="joy-node-gen-action-label joy-node-gen-style-label">
                  {moveBtnLabel}
                </span>
              </button>
            ) : null}

            {projectId ? (
              <CanvasPromptPresets
                open={presetOpen}
                onOpenChange={setPresetOpen}
                projectId={projectId}
                draftText={prompt}
                onApply={(text) => {
                  setEditorPlainText(editorRef.current, text);
                  writeDraft(text);
                }}
              >
                <button
                  type="button"
                  className={cn(
                    "joy-node-gen-action",
                    presetOpen && "is-active",
                  )}
                >
                  <List className="size-3.5 opacity-80" />
                  预设词
                </button>
              </CanvasPromptPresets>
            ) : null}

            <button
              type="button"
              className={cn(
                "joy-node-gen-action",
                (styleOpen || selectedStyle) && "is-active",
              )}
              title={selectedStyle?.prompt || "选择风格"}
              onClick={() => setStyleOpen(true)}
            >
              <Palette className="size-3.5 shrink-0 opacity-80" />
              <span className="joy-node-gen-action-label joy-node-gen-style-label">
                {styleBtnLabel}
              </span>
            </button>
          </div>
          <div className="joy-node-gen-head-actions">
            <button
              type="button"
              className="joy-node-gen-icon-btn"
              aria-label={expanded ? "缩小" : "放大"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </button>
          </div>
        </div>
      ) : prompt.trim() ? (
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
        <div className={cn("joy-node-gen-main", shellLayout && "is-compose")}>
          {shellLayout ? (
            <div className="joy-node-gen-refs">
              <button
                type="button"
                className="joy-node-gen-add-ref"
                aria-label="选择素材"
                title="选择素材"
                disabled={running}
                onClick={() => setMaterialOpen(true)}
              >
                <Plus className="size-4" />
              </button>
              <NodeRefBar nodeId={node.id} />
            </div>
          ) : (
            <NodeRefBar nodeId={node.id} />
          )}

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
          {modeLabel && videoModes.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="joy-node-gen-mode is-switch"
                  title="切换生成方式"
                >
                  <Video className="size-3.5 opacity-70" />
                  <span className="joy-node-gen-mode-text">{modeLabel}</span>
                  <ChevronDown className="size-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="joy-node-gen-mode-menu min-w-[200px]"
                data-canvas-shortcuts-ignore
              >
                {videoModes.map((mode) => (
                  <DropdownMenuItem
                    key={mode.id}
                    className={cn(
                      "joy-node-gen-mode-item",
                      mode.id === videoGenMode && "is-selected",
                    )}
                    onClick={() => {
                      const nextMode = mode.id;
                      setVideoGenMode(nextMode);
                      const compatible = models.filter(
                        (item) =>
                          item.kind === "video" &&
                          modelSupportsVideoGenMode(
                            item.capabilities,
                            nextMode,
                          ),
                      );
                      const nextModel = pickModelId(
                        compatible,
                        "video",
                        modelId,
                      );
                      setModelId(nextModel);
                      persistParams({
                        genVideoMode: nextMode,
                        genModelId: nextModel || undefined,
                      });
                    }}
                  >
                    <span className="joy-node-gen-mode-item-text">
                      <span className="joy-node-gen-mode-item-name">
                        {mode.label}
                      </span>
                      <span className="joy-node-gen-mode-item-hint">
                        {mode.hint}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {modelMenu}
          {paramsMenu}
          {output === "image" && !panorama ? (
            <CanvasCameraControl
              open={cameraOpen}
              onOpenChange={setCameraOpen}
              value={cameraControl}
              onChange={(next) => {
                setCameraControl(next);
                persistParams({ cameraControl: next });
              }}
            >
              <button
                type="button"
                className={cn(
                  "joy-chip-params-pill",
                  (cameraOpen || cameraControl.enabled) && "is-on",
                )}
              >
                <span className="joy-chip-params-seg">
                  <Camera className="size-3.5 shrink-0 opacity-80" />
                  <span className="joy-node-gen-style-label">
                    {cameraBtnLabel}
                  </span>
                </span>
              </button>
            </CanvasCameraControl>
          ) : null}
        </div>
        <div className="joy-node-gen-toolbar-right">
          {optimizeButton}
          {sendButton}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {!expanded ? (
        <div
          data-canvas-no-zoom
          data-canvas-shortcuts-ignore
          className="absolute z-30 -translate-x-1/2"
          style={{ left, top }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDownCapture={onPanelKeyDown}
        >
          {panel}
        </div>
      ) : typeof document !== "undefined" ? (
        createPortal(
          <div
            className="joy-node-gen-modal-overlay"
            data-canvas-no-zoom
            data-canvas-shortcuts-ignore
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setExpanded(false);
            }}
            onKeyDownCapture={onPanelKeyDown}
          >
            {panel}
          </div>,
          document.body,
        )
      ) : null}

      <CanvasNodeRefDialog
        open={refPickerOpen}
        hostId={node.id}
        hostLabel={
          panorama
            ? "全景"
            : output === "video"
              ? "视频"
              : output === "audio"
                ? "语音"
                : "图像"
        }
        onClose={() => setRefPickerOpen(false)}
        onConfirm={attachPickedNodes}
      />
      <CanvasAssetDialog
        open={materialOpen}
        canvasHostId={node.id}
        onClose={() => setMaterialOpen(false)}
        onConfirm={attachPickedAssets}
        onConfirmCanvasNodes={attachPickedNodes}
      />
      <CanvasStylePicker
        open={styleOpen}
        onClose={() => setStyleOpen(false)}
        selectedSlug={selectedStyle?.slug}
        onSelect={(style) => {
          setSelectedStyle(style);
          persistParams({
            genStyleSlug: style.slug,
            genStyleLabel: style.label,
            genStylePrompt: style.prompt,
          });
        }}
        onClear={() => {
          setSelectedStyle(null);
          persistParams({
            genStyleSlug: "",
            genStyleLabel: "",
            genStylePrompt: "",
          });
        }}
      />
      <CanvasCameraMovePicker
        open={cameraMoveOpen}
        onClose={() => setCameraMoveOpen(false)}
        selected={selectedMoves}
        onChange={(next) => {
          setSelectedMoves(next);
          persistParams({ genCameraMoves: next });
        }}
      />
    </>
  );
}
