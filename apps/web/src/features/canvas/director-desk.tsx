"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "./store";
import type {
  DirectorCapture,
  DirectorPanorama,
  DirectorVideo,
} from "./director-types";
import { dataUrlToFile } from "./lib/data-url-to-file";
import { nodeBox } from "./lib/node-box";
import { uploadFileToNewNode } from "./lib/upload-to-node";
import { toast } from "@/shared/lib/toast";

type Props = {
  nodeId: string;
  onClose: () => void;
};

type CapturePayload = { dataUrl?: unknown; fileName?: unknown } | null;

function isMediaSource(node: CanvasNode | undefined): node is CanvasNode {
  if (!node) return false;
  if (node.type !== "panorama" && node.type !== "image") return false;
  const url = String(node.data.url ?? "");
  return Boolean(url) && !url.startsWith("data:");
}

function nextOutputY(host: CanvasNode, nodes: CanvasNode[], edges: { source: string; target: string }[]) {
  let y = host.y;
  for (const edge of edges) {
    if (edge.source !== host.id) continue;
    const target = nodes.find((item) => item.id === edge.target);
    if (!target) continue;
    const box = nodeBox(target);
    y = Math.max(y, box.y + box.height + 36);
  }
  return y;
}

/**
 * Hosts the three.js director SPA (`/director/index.html`) via postMessage.
 * Opens empty — panoramas from the canvas are optional inputs.
 */
export function DirectorDesk({ nodeId, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionSent = useRef(false);
  const [ready, setReady] = useState(false);
  const { resolvedTheme } = useTheme();

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const removeEdge = useCanvasStore((s) => s.removeEdge);
  const pushHistory = useCanvasStore((s) => s.pushHistory);

  const node = nodes.find((item) => item.id === nodeId);
  const project = node?.data.directorProject ?? null;

  const panoramas = useMemo<DirectorPanorama[]>(() => {
    return edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => {
        const source = nodes.find((item) => item.id === edge.source);
        if (!isMediaSource(source)) return null;
        return {
          edgeId: edge.id,
          sourceNodeId: source.id,
          imageUrl: String(source.data.url),
          fileName:
            String(source.data.title ?? "").trim() ||
            (source.type === "panorama" ? "全景" : "图像"),
          projectionMode:
            source.type === "panorama"
              ? ("equirectangular" as const)
              : ("backdrop" as const),
        };
      })
      .filter((item): item is DirectorPanorama => item != null);
  }, [edges, nodeId, nodes]);

  const projectRef = useRef(project);
  const themeRef = useRef<"light" | "dark">("dark");
  projectRef.current = project;
  themeRef.current = resolvedTheme === "light" ? "light" : "dark";

  const postToDesk = useCallback((type: string, payload: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type, payload },
      window.location.origin,
    );
  }, []);

  const onProjectChange = useCallback(
    (next: unknown) => {
      if (!next || typeof next !== "object" || Array.isArray(next)) return;
      updateNodeData(nodeId, { directorProject: next });
    },
    [nodeId, updateNodeData],
  );

  const onPanoramaRemoved = useCallback(
    (payload: { edgeId: string; sourceNodeId: string }) => {
      const edge = useCanvasStore
        .getState()
        .edges.find(
          (item) =>
            item.id === payload.edgeId &&
            item.source === payload.sourceNodeId &&
            item.target === nodeId,
        );
      if (!edge) return;
      pushHistory();
      removeEdge(edge.id);
    },
    [nodeId, pushHistory, removeEdge],
  );

  const onCapturesSent = useCallback(
    async (directorNodeId: string, captures: DirectorCapture[]) => {
      const host = useCanvasStore
        .getState()
        .nodes.find((item) => item.id === directorNodeId);
      if (!host || !captures.length) return;
      const toastId = toast.loading(
        captures.length > 1
          ? `正在发送 ${captures.length} 张截图…`
          : "正在发送截图…",
      );
      try {
        pushHistory();
        const state = useCanvasStore.getState();
        let y = nextOutputY(host, state.nodes, state.edges);
        const box = nodeBox(host);
        for (const [index, capture] of captures.entries()) {
          const file = await dataUrlToFile(
            capture.dataUrl,
            capture.fileName || `导演台截图-${index + 1}.png`,
          );
          const imageId = await uploadFileToNewNode(
            file,
            {
              x: box.x + box.width + 48,
              y,
            },
            {
              history: false,
              preferredType: "image",
              title:
                capture.fileName.replace(/\.[^.]+$/, "") || "导演台截帧",
            },
          );
          addEdge(host.id, imageId);
          y += 180 + 36;
        }
        const prev =
          (host.data.directorProject as { shots?: unknown[] } | undefined) ??
          {};
        const shots = Array.isArray(prev.shots) ? prev.shots : [];
        updateNodeData(host.id, {
          directorProject: {
            ...prev,
            shots: [
              ...shots,
              ...captures.map((capture) => ({
                fileName: capture.fileName,
                at: Date.now(),
              })),
            ].slice(-24),
          },
        });
        toast.success(
          captures.length > 1
            ? `已发送 ${captures.length} 张截图到画布`
            : "截图已发送到画布",
          { id: toastId },
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "截图发送失败", {
          id: toastId,
        });
      }
    },
    [addEdge, pushHistory, updateNodeData],
  );

  const onVideoSent = useCallback(
    async (directorNodeId: string, output: DirectorVideo) => {
      const host = useCanvasStore
        .getState()
        .nodes.find((item) => item.id === directorNodeId);
      if (!host) return;
      const toastId = toast.loading("正在发送视频…");
      try {
        pushHistory();
        const file = new File([output.blob], output.fileName, {
          type: output.blob.type || "video/mp4",
        });
        const state = useCanvasStore.getState();
        const y = nextOutputY(host, state.nodes, state.edges);
        const box = nodeBox(host);
        const videoId = await uploadFileToNewNode(
          file,
          {
            x: box.x + box.width + 48,
            y,
          },
          {
            history: false,
            preferredType: "video",
            title: output.fileName.replace(/\.[^.]+$/, "") || "导演台视频",
          },
        );
        updateNodeData(videoId, {
          width: output.width,
          height: output.height,
          durationSeconds: output.durationSeconds,
        });
        addEdge(host.id, videoId);
        toast.success("视频已发送到画布", { id: toastId });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "视频发送失败", {
          id: toastId,
        });
      }
    },
    [addEdge, pushHistory, updateNodeData],
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }
      const type = event.data?.type;
      if (type === "storyai:director-ready") {
        setReady(true);
        return;
      }
      if (type === "storyai:director-close") {
        onClose();
        return;
      }
      if (type === "storyai:director-project-changed") {
        onProjectChange(event.data?.payload?.project);
        return;
      }
      if (type === "storyai:director-panorama-removed") {
        const edgeId =
          typeof event.data?.payload?.edgeId === "string"
            ? event.data.payload.edgeId.trim()
            : "";
        const sourceNodeId =
          typeof event.data?.payload?.sourceNodeId === "string"
            ? event.data.payload.sourceNodeId.trim()
            : "";
        if (edgeId && sourceNodeId) {
          onPanoramaRemoved({ edgeId, sourceNodeId });
        }
        return;
      }
      if (type === "storyai:director-captures-sent") {
        const captures = Array.isArray(event.data?.payload?.captures)
          ? event.data.payload.captures
              .filter(
                (capture: CapturePayload): capture is { dataUrl: string } =>
                  typeof capture?.dataUrl === "string" &&
                  capture.dataUrl.startsWith("data:image/"),
              )
              .map(
                (
                  capture: { dataUrl: string; fileName?: unknown },
                  index: number,
                ) => ({
                  dataUrl: capture.dataUrl,
                  fileName:
                    typeof capture.fileName === "string" &&
                    capture.fileName.trim()
                      ? capture.fileName.trim()
                      : `导演台截图-${index + 1}.png`,
                }),
              )
          : [];
        if (captures.length) void onCapturesSent(nodeId, captures);
        return;
      }
      if (type === "storyai:director-video-sent") {
        const blob = event.data?.payload?.blob;
        if (
          !(blob instanceof Blob) ||
          !blob.size ||
          !blob.type.startsWith("video/")
        ) {
          return;
        }
        const fileName =
          typeof event.data?.payload?.fileName === "string" &&
          event.data.payload.fileName.trim()
            ? event.data.payload.fileName.trim()
            : "导演台视频.mp4";
        const width = Number(event.data?.payload?.width);
        const height = Number(event.data?.payload?.height);
        const durationSeconds = Number(event.data?.payload?.durationSeconds);
        void onVideoSent(nodeId, {
          blob,
          fileName,
          width: Number.isFinite(width) && width > 0 ? width : 1280,
          height: Number.isFinite(height) && height > 0 ? height : 720,
          durationSeconds: Number.isFinite(durationSeconds)
            ? durationSeconds
            : 0,
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    nodeId,
    onCapturesSent,
    onClose,
    onPanoramaRemoved,
    onProjectChange,
    onVideoSent,
  ]);

  useEffect(() => {
    if (!ready || sessionSent.current) return;
    sessionSent.current = true;
    postToDesk("storyai:director-session", {
      instanceId: nodeId,
      theme: themeRef.current,
      project: projectRef.current,
    });
  }, [nodeId, postToDesk, ready]);

  useEffect(() => {
    if (!ready || !sessionSent.current) return;
    postToDesk("storyai:director-panoramas", { panoramas });
  }, [panoramas, postToDesk, ready]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      data-canvas-shortcuts-ignore
    >
      <iframe
        ref={iframeRef}
        title="3D导演台"
        src="/director/index.html"
        className="block h-full w-full border-0"
      />
    </div>
  );
}
