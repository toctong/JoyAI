import type { Queue } from "bullmq";
import type { AssetMirrorPayload } from "./processors/asset-mirror.processor";

/** Enqueue async TOS mirror; no-op when storage is off (caller should skip). */
export async function enqueueAssetMirror(
  queue: Queue,
  payload: AssetMirrorPayload,
) {
  await queue.add("mirror", payload, {
    attempts: 5,
    backoff: { type: "exponential", delay: 8_000 },
    removeOnComplete: 200,
    removeOnFail: 200,
  });
}

/** Fan-out many mirrors in parallel (image n>1). */
export async function enqueueAssetMirrors(
  queue: Queue,
  payloads: AssetMirrorPayload[],
) {
  if (!payloads.length) return;
  await Promise.all(payloads.map((payload) => enqueueAssetMirror(queue, payload)));
}
