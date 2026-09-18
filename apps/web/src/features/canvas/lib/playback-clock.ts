/** Live video currentTime, kept out of the snapshot so playback does not autosave. */
const times = new Map<string, number>();

export function setPlaybackTime(nodeId: string, time: number) {
  if (!Number.isFinite(time)) return;
  times.set(nodeId, time);
}

export function getPlaybackTime(nodeId: string) {
  return times.get(nodeId) ?? 0;
}
