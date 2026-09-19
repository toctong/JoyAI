"use client";

import {
  CanvasIconDirector,
  CanvasIconImage,
  CanvasIconLoader,
  CanvasIconText,
} from "./icons/canvas-icons";
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
  buildCanvasMentionItems,
  collectIncomingMediaFromEdges,
  mergeJobReferences,
  appendTextRefs,
} from "./lib/canvas-media-refs";
import { nodeBox } from "./lib/node-box";
import { titleFromPrompt } from "./lib/node-title";
import { NodeRefBar } from "./node-ref-bar";
import { CanvasRefThumb } from "./canvas-ref-thumb";
import { CanvasRefHoverPreview } from "./canvas-ref-preview";
import {
  durationsFromCapabilities,
  layoutControlsFromCapabilities,
} from "@/features/studio/model-options";
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
import "@/features/studio/creation-composer.css";
import "./node-gen-panel.css";

type Props = {
  node: CanvasNode;
  viewport: Viewport;
  onClose?: () => void;
};

type GenKind = "image" | "video" | "text";

type PublicModel = {
  id: string;
  name: string;
  kind: "image" | "video" | "llm";
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { name?: string };
};

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

  const [prompt, setPrompt] = useState(() =>
    String(node.data.genDraft ?? node.data.prompt ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [kind, setKind] = useState<GenKind>(() =>
    node.type === "video"
      ? "video"
      : String(node.data.genKind ?? "") === "video"
        ? "video"
        : String(node.data.genKind ?? "") === "text"
          ? "text"
          : "image",
  );
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

  const output: GenKind = panorama ? "image" : kind;
  const mentionItems = useMemo(() => buildCanvasMentionItems(nodes), [nodes]);

  useEffect(() => {
    setPrompt(String(node.data.genDraft ?? node.data.prompt ?? ""));
    setKind(
      node.type === "video"
        ? "video"
        : String(node.data.genKind ?? "") === "video"
          ? "video"
          : String(node.data.genKind ?? "") === "text"
            ? "text"
            : "image",
    );
    setModelId(String(node.data.genModelId ?? ""));
    setRatio(panorama ? "2:1" : String(node.data.genRatio ?? "auto"));
    setResolution(String(node.data.genResolution ?? ""));
    const n = Number(node.data.genDuration);
    setDuration(Number.isFinite(n) && n > 0 ? n : 5);
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
              item.kind === "llm",
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

  const running = status === "queued" || status === "running" || busy;
  const edgeRefs = useMemo(
    () => collectIncomingMediaFromEdges(nodes, edges, node.id),
    [edges, node.id, nodes],
  );

  const canShowParams =
    output !== "text" &&
    ((!panorama && layout.showRatio && layout.aspects.length > 0) ||
      (layout.showResolution && layout.resolutions.length > 0) ||
      (output === "video" && layout.showDuration && durations.length > 0));

  function writeDraft(next: string) {
    setPrompt(next);
    updateNodeData(node.id, { genDraft: next });
  }

  function writeKind(next: GenKind) {
    if (panorama) return;
    setKind(next);
    updateNodeData(node.id, { genKind: next });
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
        const promptText = panorama
          ? wrapPanoramaPrompt(text, { hasReference: hasMedia })
          : text;
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
          ...(named && !keepTitle ? { title: named } : {}),
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "image",
            input: {
              prompt: promptText,
              n: 1,
              modelId,
              ratio: panorama ? "2:1" : layout.showRatio ? ratio : undefined,
              resolution:
                layout.showResolution && resolution ? resolution : undefined,
              width: aspect && !aspect.flexible ? aspect.width : undefined,
              height: aspect && !aspect.flexible ? aspect.height : undefined,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
              referenceAssetIds,
              referenceUrls,
              operation: "generate",
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
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
          fontSize: 14,
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
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          prompt: text,
          ...(named && !keepTitle ? { title: named } : {}),
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "video",
            input: {
              prompt: text,
              modelId,
              duration: layout.showDuration ? duration : undefined,
              ratio: layout.showRatio ? ratio : undefined,
              resolution:
                layout.showResolution && resolution ? resolution : undefined,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
              referenceAssetIds,
              referenceUrls,
              refMode: videoRefMode(
                Math.max(referenceAssetIds.length, referenceUrls.length),
              ),
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
      }
      clearPrompt();
      toast.success(
        panorama
          ? "已提交全景任务"
          : kind === "video"
            ? "已提交视频任务"
            : kind === "text"
              ? "已提交文本任务"
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
    : kind === "text"
      ? hasMedia
        ? "让模型读这张图并写正文… /文本 · @ 引用"
        : "写下要生成的文本… /文本 · @ 引用"
      : hasMedia
        ? kind === "video"
          ? "描述运动与镜头…（当前媒体作参考）"
          : "描述画面…（当前媒体作参考）"
        : kind === "video"
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
          {hasMedia ? (
            <CanvasRefHoverPreview
              kind={node.type}
              url={url}
              className="joy-node-gen-ref"
            >
              <CanvasRefThumb kind={node.type} url={url} />
              <span className="joy-node-gen-ref-caption">参考</span>
            </CanvasRefHoverPreview>
          ) : null}

          <div className="joy-node-gen-main">
            <NodeRefBar nodeId={node.id} />
            <AiPromptEditor
              key={node.id}
              editorRef={editorRef}
              initialText={String(node.data.genDraft ?? node.data.prompt ?? "")}
              mentionItems={mentionItems}
              placeholder={placeholder}
              disabled={running}
              onPlainChange={writeDraft}
              onKindCommand={writeKind}
            />
          </div>
        </div>

        {nodeError && status === "failed" ? (
          <p className="joy-node-gen-error">{nodeError}</p>
        ) : null}

        <div className="joy-node-gen-toolbar">
          <div className="joy-node-gen-toolbar-left">
            {panorama ? (
              <button type="button" className="joy-chip joy-chip-kind" disabled>
                <CanvasIconImage className="size-4" />
                全景 2:1
              </button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="joy-chip joy-chip-kind">
                    {kind === "image" ? (
                      <CanvasIconImage className="size-4" />
                    ) : kind === "text" ? (
                      <CanvasIconText className="size-4" />
                    ) : (
                      <CanvasIconDirector className="size-4" />
                    )}
                    {kind === "image" ? "图片" : kind === "text" ? "文本" : "视频"}
                    <ChevronDown className="size-3.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-[148px]"
                  data-canvas-shortcuts-ignore
                >
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => writeKind("image")}
                  >
                    <CanvasIconImage className="size-4" />
                    图片生成
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => writeKind("video")}
                  >
                    <CanvasIconDirector className="size-4" />
                    视频生成
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => writeKind("text")}
                  >
                    <CanvasIconText className="size-4" />
                    文本生成
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

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
                    {!panorama && layout.showRatio ? (
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
                    {layout.showResolution ? (
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
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="p-3 max-w-[min(340px,calc(100vw-48px))]"
                  data-canvas-shortcuts-ignore
                >
                  <div className="joy-composer-params-panel">
                    {!panorama && layout.showRatio ? (
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

                    {layout.showResolution ? (
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
                        <div className="joy-composer-params-options">
                          {durations.map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={cn(
                                "joy-composer-params-option",
                                duration === item && "is-on",
                              )}
                              onClick={() => {
                                setDuration(item);
                                persistParams({ genDuration: item });
                              }}
                            >
                              {item}s
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <button
            type="button"
            className={cn("joy-node-gen-send", ready && "is-ready")}
            disabled={!ready}
            aria-label={
              panorama
                ? "生成全景"
                : kind === "video"
                  ? "生成视频"
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
