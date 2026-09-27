import type { CanvasNode, CanvasNodeType } from "@joyai/shared";
import { useCanvasStore } from "../store";
import { nodeBox } from "./node-box";
import { titleFromPrompt } from "./node-title";
import { linkImageBatch } from "./batch-group";
import { archiveNodeMedia } from "./node-gen-history";

export type JobAsset = { id: string; url: string };

const GAP = 36;
const COLS = 2;

function isEmptyMedia(node: CanvasNode) {
  const url = String(node.data.url ?? "");
  return !url || url.startsWith("data:");
}

function mediaOutputOf(
  node: CanvasNode,
  assetUrl: string,
): "image" | "video" | "panorama" | "audio" {
  const url = assetUrl.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|ogg|flac|opus)(\?|$)/.test(url)) return "audio";
  if (/\.(mp4|webm|mov)(\?|$)/.test(url)) return "video";
  if (node.type === "panorama") return "panorama";
  if (node.type === "video") return "video";
  if (node.type === "audio") return "audio";
  if (node.type === "prompt") {
    const stored = String(node.data.outputKind ?? "");
    if (
      stored === "video" ||
      stored === "panorama" ||
      stored === "audio"
    ) {
      return stored;
    }
  }
  return "image";
}

function placeOffset(index: number, width: number, height: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: col * (width + GAP),
    y: row * (height + GAP),
  };
}

function fillMediaNode(
  nodeId: string,
  asset: JobAsset,
  patch: Record<string, unknown>,
) {
  archiveNodeMedia(nodeId);
  useCanvasStore.getState().updateNodeData(nodeId, {
    url: asset.url,
    assetId: asset.id,
    status: "succeeded",
    error: "",
    ...patch,
  });
}

/**
 * Fan-out job assets onto matching canvas nodes.
 * First asset fills existing empty / self targets; extras become sibling nodes.
 * Multi image/panorama results are linked as a collapsible batch stack.
 */
export function applyJobAssetsToMatches(opts: {
  jobId: string;
  assets: JobAsset[];
  onFrame?: (
    nodeId: string,
    url: string,
    kind: "image" | "video" | "panorama" | "audio",
  ) => void;
  onPanoramaNote?: (nodeId: string, url: string) => void;
}): { addedNode: boolean } {
  const assets = opts.assets.filter((item) => item?.id && item?.url);
  if (!assets.length) return { addedNode: false };

  const live = useCanvasStore.getState();
  const matches = live.nodes.filter((node) => node.data.jobId === opts.jobId);
  if (!matches.length) return { addedNode: false };

  const prompts = matches.filter((node) => node.type === "prompt");
  const mediaTargets = matches.filter(
    (node) =>
      node.type === "image" ||
      node.type === "video" ||
      node.type === "panorama" ||
      node.type === "audio",
  );

  let addedNode = false;
  const filledIds: string[] = [];

  if (mediaTargets.length) {
    const anchor = mediaTargets[0]!;
    const box = nodeBox(anchor);
    const upstream = live.edges
      .filter((edge) => edge.target === anchor.id)
      .map((edge) => edge.source);
    const named = titleFromPrompt(String(anchor.data.prompt ?? ""));

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]!;
      const existing = mediaTargets[i];
      const kind = mediaOutputOf(existing ?? anchor, asset.url);
      const titlePatch =
        named && !(existing && String(existing.data.title ?? "").trim())
          ? { title: named }
          : named && !existing
            ? { title: named }
            : {};
      const projection =
        kind === "panorama" ? { projection: "equirectangular" } : {};

      if (existing) {
        fillMediaNode(existing.id, asset, {
          ...titlePatch,
          ...projection,
        });
        filledIds.push(existing.id);
        if (kind === "panorama") opts.onPanoramaNote?.(existing.id, asset.url);
        else if (kind !== "audio") opts.onFrame?.(existing.id, asset.url, kind);
        continue;
      }

      const offset = placeOffset(i, box.width, box.height);
      const id = useCanvasStore.getState().addNode(kind, {
        x: box.x + offset.x,
        y: box.y + offset.y,
      });
      fillMediaNode(id, asset, {
        prompt: String(anchor.data.prompt ?? ""),
        jobId: opts.jobId,
        ...titlePatch,
        ...projection,
      });
      const state = useCanvasStore.getState();
      for (const source of upstream) state.addEdge(source, id);
      filledIds.push(id);
      if (kind === "panorama") opts.onPanoramaNote?.(id, asset.url);
      else if (kind !== "audio") opts.onFrame?.(id, asset.url, kind);
      addedNode = true;
    }

    for (let i = assets.length; i < mediaTargets.length; i++) {
      const spare = mediaTargets[i];
      if (!spare || !isEmptyMedia(spare)) continue;
      useCanvasStore.getState().updateNodeData(spare.id, {
        status: "idle",
        jobId: "",
        error: "",
      });
    }
    linkImageBatch(
      filledIds.filter((id) => {
        const n = useCanvasStore.getState().nodes.find((item) => item.id === id);
        return n?.type === "image" || n?.type === "panorama";
      }),
    );
    return { addedNode };
  }

  for (const promptNode of prompts) {
    useCanvasStore.getState().updateNodeData(promptNode.id, {
      status: "succeeded",
      error: "",
    });
    const state = useCanvasStore.getState();
    const stored = String(promptNode.data.outputKind ?? "");
    const named = titleFromPrompt(String(promptNode.data.prompt ?? ""));
    const promptBox = nodeBox(promptNode);
    const promptFilled: string[] = [];

    const outgoing = state.edges
      .filter((edge) => edge.source === promptNode.id)
      .map((edge) => state.nodes.find((item) => item.id === edge.target))
      .filter((item): item is CanvasNode => Boolean(item));
    const upstream = state.edges
      .filter((edge) => edge.target === promptNode.id)
      .map((edge) => edge.source);

    let emptySlots = outgoing.filter(
      (item) =>
        (item.type === "image" ||
          item.type === "video" ||
          item.type === "panorama" ||
          item.type === "audio") &&
        isEmptyMedia(item),
    );

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]!;
      const kind: CanvasNodeType =
        stored === "video" ||
        stored === "panorama" ||
        stored === "audio"
          ? stored
          : mediaOutputOf(promptNode, asset.url);
      const projection =
        kind === "panorama" ? { projection: "equirectangular" } : {};
      const titlePatch = named ? { title: named } : {};

      const wireResult = (resultId: string) => {
        const live = useCanvasStore.getState();
        live.addEdge(promptNode.id, resultId);
        for (const source of upstream) live.addEdge(source, resultId);
      };

      const slot = emptySlots[0];
      if (slot && (slot.type === kind || isEmptyMedia(slot))) {
        emptySlots = emptySlots.slice(1);
        fillMediaNode(slot.id, asset, {
          prompt: String(promptNode.data.prompt ?? ""),
          ...titlePatch,
          ...projection,
        });
        wireResult(slot.id);
        promptFilled.push(slot.id);
        if (kind === "panorama") opts.onPanoramaNote?.(slot.id, asset.url);
        else if (kind === "image" || kind === "video") {
          opts.onFrame?.(slot.id, asset.url, kind);
        }
        continue;
      }

      const offset = placeOffset(i, 340, 240);
      const id = useCanvasStore.getState().addNode(kind, {
        x: promptBox.x + promptBox.width + 40 + offset.x,
        y: promptBox.y + offset.y,
      });
      fillMediaNode(id, asset, {
        prompt: String(promptNode.data.prompt ?? ""),
        jobId: opts.jobId,
        ...titlePatch,
        ...projection,
      });
      wireResult(id);
      promptFilled.push(id);
      if (kind === "panorama") opts.onPanoramaNote?.(id, asset.url);
      else if (kind === "image" || kind === "video") {
        opts.onFrame?.(id, asset.url, kind);
      }
      addedNode = true;
    }
    linkImageBatch(
      promptFilled.filter((id) => {
        const n = useCanvasStore.getState().nodes.find((item) => item.id === id);
        return n?.type === "image" || n?.type === "panorama";
      }),
    );
  }

  return { addedNode };
}
