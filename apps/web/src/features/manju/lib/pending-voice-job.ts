/** TTS 配音任务：完成后写入角色 detail.voiceAudioUrl（不走 imageUrl） */

type PendingVoiceJob = {
  projectId: string;
  assetId: string;
};

const pending = new Map<string, PendingVoiceJob>();

export function registerVoiceJob(
  jobId: string,
  meta: PendingVoiceJob,
): void {
  pending.set(jobId, meta);
}

export function peekVoiceJob(jobId: string): PendingVoiceJob | undefined {
  return pending.get(jobId);
}

export function takeVoiceJob(jobId: string): PendingVoiceJob | undefined {
  const hit = pending.get(jobId);
  if (hit) pending.delete(jobId);
  return hit;
}
