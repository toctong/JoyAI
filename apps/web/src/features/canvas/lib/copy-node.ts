import type { CanvasNode } from "@joyai/shared";
import { groupIdOf } from "./align";

function nextGroupId() {
  return `g_${Math.random().toString(36).slice(2, 10)}`;
}

/** Drop in-flight jobs so a copy does not receive the original result. */
export function prepareCopiedData(
  data: Record<string, unknown>,
  groupId: string | null,
) {
  const next: Record<string, unknown> = { ...data, jobId: "" };
  const status = String(next.status ?? "");
  if (status === "queued" || status === "running" || status === "polling") {
    next.status = "idle";
    next.error = "";
  }
  if (groupId) next.groupId = groupId;
  else {
    delete next.groupId;
    delete next.groupName;
  }
  return next;
}

/**
 * Two or more copies that shared a group become a new group.
 * A single copy is detached so it does not stick to the original.
 */
export function copiedGroupId(
  sources: CanvasNode[],
  node: CanvasNode,
  cache: Map<string, string>,
) {
  const gid = groupIdOf(node);
  if (!gid) return null;
  const fellows = sources.filter((item) => groupIdOf(item) === gid).length;
  if (fellows < 2) return null;
  const existing = cache.get(gid);
  if (existing) return existing;
  const created = nextGroupId();
  cache.set(gid, created);
  return created;
}
