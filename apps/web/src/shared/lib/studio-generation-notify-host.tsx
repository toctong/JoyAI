"use client";

import { useCallback } from "react";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import { notifyStudioGeneration } from "@/shared/lib/generation-notify";

export type StudioWatchMeta = {
  kind?: string;
  modelName?: string | null;
  prompt?: string | null;
};

type Watched = StudioWatchMeta;

const watched = new Map<string, Watched>();

function normalizeMeta(
  meta?: string | StudioWatchMeta,
): StudioWatchMeta {
  if (meta == null) return {};
  if (typeof meta === "string") return { kind: meta };
  return {
    kind: meta.kind,
    modelName: meta.modelName,
    prompt: meta.prompt,
  };
}

/** Track a studio job so completion can notify even after leaving /studio. */
export function watchStudioGeneration(
  jobId: string,
  meta?: string | StudioWatchMeta,
): void {
  const id = String(jobId ?? "").trim();
  if (!id) return;
  watched.set(id, normalizeMeta(meta));
}

export function unwatchStudioGeneration(jobId: string): void {
  const id = String(jobId ?? "").trim();
  if (!id) return;
  watched.delete(id);
}

function takeWatched(jobId: string): Watched | undefined {
  const id = String(jobId ?? "").trim();
  if (!id) return undefined;
  const item = watched.get(id);
  if (item) watched.delete(id);
  return item;
}

/**
 * App-shell listener: Socket/reconcile for watched studio jobs →
 * right-side panel (visible tab) or browser Notification (background).
 */
export function StudioGenerationNotifyHost() {
  const getBusyJobIds = useCallback(() => [...watched.keys()], []);

  useJobLifecycle({
    enabled: true,
    getBusyJobIds,
    onCompleted: (payload) => {
      const jobId = payload.jobId;
      if (!jobId) return;
      const item = takeWatched(jobId);
      if (!item) return;
      const assets = (payload.assets ?? [])
        .filter((a): a is { id: string; url: string; kind?: string } =>
          Boolean(a?.id && a?.url),
        )
        .map((a) => ({
          id: String(a.id),
          url: String(a.url),
          kind: a.kind,
        }));
      notifyStudioGeneration({
        jobId,
        ok: true,
        kind: item.kind,
        modelName: item.modelName,
        prompt: item.prompt,
        assets,
      });
    },
    onFailed: (payload) => {
      const jobId = payload.jobId;
      if (!jobId) return;
      if (payload.status === "cancelled") {
        takeWatched(jobId);
        return;
      }
      const item = takeWatched(jobId);
      if (!item) return;
      notifyStudioGeneration({
        jobId,
        ok: false,
        kind: item.kind,
        modelName: item.modelName,
        prompt: item.prompt,
        error: payload.error,
      });
    },
  });

  return null;
}
