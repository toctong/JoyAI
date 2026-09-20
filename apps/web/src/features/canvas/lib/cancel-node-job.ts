import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";
import { isBusyStatus } from "../node-registry";

/** Interrupt an in-flight generation on a canvas node. */
export async function cancelNodeJob(nodeId: string): Promise<boolean> {
  const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
  if (!node) return false;

  const status = String(node.data.status ?? "");
  const jobId = String(node.data.jobId ?? "").trim();
  if (!isBusyStatus(status) && !jobId) return false;

  useCanvasStore.getState().updateNodeData(nodeId, {
    status: "idle",
    error: "",
    jobId: "",
    busyLabel: "",
  });

  if (!jobId) return true;

  try {
    await api(`/jobs/${jobId}/cancel`, { method: "POST" });
    toast.message("已中断生成");
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "中断失败");
    return false;
  }
}
