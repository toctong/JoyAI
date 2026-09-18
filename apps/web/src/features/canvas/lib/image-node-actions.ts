import { useCanvasStore } from "../store";
import { toast } from "@/shared/lib/toast";

/** Copy prompt stored on the node, then fall back to upstream prompt edges. */
export function copyUpstreamPrompt(nodeId: string) {
  const { nodes, edges } = useCanvasStore.getState();
  const node = nodes.find((item) => item.id === nodeId);
  const own = String(node?.data.prompt ?? node?.data.panoramaSourcePrompt ?? "")
    .trim();
  if (own) {
    void navigator.clipboard.writeText(own).then(
      () => toast.success("已复制提示词"),
      () => toast.error("复制失败"),
    );
    return;
  }
  const texts = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodes.find((item) => item.id === edge.source))
    .filter((item) => item?.type === "prompt")
    .map((item) => String(item?.data.prompt ?? "").trim())
    .filter(Boolean);
  if (!texts.length) {
    toast.message("没有可复制的提示词");
    return;
  }
  void navigator.clipboard.writeText(texts.join("\n\n")).then(
    () => toast.success("已复制提示词"),
    () => toast.error("复制失败"),
  );
}

export function toggleFreeResize(nodeId: string) {
  const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
  if (!node) return;
  const next = !node.data.freeResize;
  useCanvasStore.getState().pushHistory();
  useCanvasStore.getState().updateNodeData(nodeId, { freeResize: next });
  toast.success(next ? "已改为自由缩放" : "已锁定宽高比");
}
