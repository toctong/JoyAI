import { api } from "@/shared/lib/api";

/** 中断漫剧侧已提交的生成任务（图片 / 视频 / LLM 共用 cancel） */
export async function cancelManjuJob(jobId: string): Promise<void> {
  const id = jobId.trim();
  if (!id) return;
  await api(`/jobs/${id}/cancel`, { method: "POST" });
}
