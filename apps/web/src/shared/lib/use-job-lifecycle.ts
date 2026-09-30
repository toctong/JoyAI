"use client";

import { useEffect, useRef } from "react";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";

export type JobLifecycleAsset = {
  id: string;
  url?: string | null;
  kind?: string;
};

export type JobProgressPayload = {
  jobId?: string;
  status?: string;
  progress?: number;
  job?: { id?: string; status?: string };
};

export type JobSlotFailure = { index: number; error: string };

export type JobCompletedPayload = {
  jobId?: string;
  id?: string;
  status?: string;
  assets?: JobLifecycleAsset[];
  requested?: number;
  failures?: JobSlotFailure[];
  result?: {
    text?: string;
    purpose?: string;
    manjuProjectId?: string | null;
    scriptWrite?: {
      reply?: string;
      script?: string;
      hook?: string;
    };
    analyze?: unknown;
    [key: string]: unknown;
  };
  job?: { id?: string; assets?: JobLifecycleAsset[] };
};

export type JobFailedPayload = {
  jobId?: string;
  id?: string;
  error?: string;
  status?: string;
  requested?: number;
  purpose?: string;
  kind?: string;
  job?: {
    id?: string;
    error?: string | null;
    status?: string;
    input?: { purpose?: string } | null;
  };
};

export type AssetUpdatedPayload = {
  asset?: {
    id?: string;
    url?: string | null;
    [key: string]: unknown;
  };
  jobId?: string | null;
};

type JobDetail = {
  id: string;
  status: string;
  error?: string | null;
  assets?: JobLifecycleAsset[];
  result?: JobCompletedPayload["result"];
};

export function resolveJobLifecycleId(payload: {
  jobId?: string;
  id?: string;
  job?: { id?: string };
}): string | null {
  const id = String(payload.jobId ?? payload.job?.id ?? payload.id ?? "").trim();
  return id || null;
}

export type UseJobLifecycleOptions = {
  /** When false, no socket listeners and no polling. Default true. */
  enabled?: boolean;
  /** Latest busy job ids (read from store/state each tick). */
  getBusyJobIds: () => string[];
  onProgress?: (payload: JobProgressPayload) => void;
  onCompleted?: (payload: JobCompletedPayload) => void;
  onFailed?: (payload: JobFailedPayload) => void;
  onAssetUpdated?: (payload: AssetUpdatedPayload) => void;
  /**
   * Fallback GET reconcile interval while socket is disconnected.
   * Connected sockets rely on push; interval becomes a rare safety net.
   */
  pollMs?: number;
};

/** While disconnected, reconcile often. While connected, rare safety only. */
const DISCONNECTED_POLL_MS = 4_000;
const CONNECTED_SAFETY_MS = 60_000;
const HANDLED_CAP = 400;

/**
 * Shared job lifecycle: Socket.IO push first.
 * HTTP GET /jobs/:id only as reconnect / disconnect fallback — avoids stacked
 * list polling that freezes heavy pages.
 */
export function useJobLifecycle(options: UseJobLifecycleOptions) {
  const {
    enabled = true,
    getBusyJobIds,
    onProgress,
    onCompleted,
    onFailed,
    onAssetUpdated,
    pollMs = DISCONNECTED_POLL_MS,
  } = options;

  const getBusyRef = useRef(getBusyJobIds);
  const onProgressRef = useRef(onProgress);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);
  const onAssetUpdatedRef = useRef(onAssetUpdated);
  getBusyRef.current = getBusyJobIds;
  onProgressRef.current = onProgress;
  onCompletedRef.current = onCompleted;
  onFailedRef.current = onFailed;
  onAssetUpdatedRef.current = onAssetUpdated;

  const handledRef = useRef<Set<string>>(new Set());
  const handledOrderRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const handled = handledRef.current;
    const order = handledOrderRef.current;

    function markTerminal(jobId: string): boolean {
      if (handled.has(jobId)) return false;
      handled.add(jobId);
      order.push(jobId);
      while (order.length > HANDLED_CAP) {
        const old = order.shift();
        if (old) handled.delete(old);
      }
      return true;
    }

    function emitCompleted(payload: JobCompletedPayload) {
      const jobId = resolveJobLifecycleId(payload);
      if (!jobId) return;
      if (!markTerminal(jobId)) return;
      onCompletedRef.current?.({ ...payload, jobId });
    }

    function emitFailed(payload: JobFailedPayload) {
      const jobId = resolveJobLifecycleId(payload);
      if (!jobId) return;
      if (!markTerminal(jobId)) return;
      onFailedRef.current?.({ ...payload, jobId });
    }

    const socket = getJobsSocket();

    const handleProgress = (payload: JobProgressPayload) => {
      onProgressRef.current?.(payload);
    };
    const handleCompleted = (payload: JobCompletedPayload) => {
      emitCompleted(payload);
    };
    const handleFailed = (payload: JobFailedPayload) => {
      emitFailed(payload);
    };
    const handleAssetUpdated = (payload: AssetUpdatedPayload) => {
      onAssetUpdatedRef.current?.(payload);
    };

    socket.on("job:progress", handleProgress);
    socket.on("job:completed", handleCompleted);
    socket.on("job:failed", handleFailed);
    socket.on("asset:updated", handleAssetUpdated);

    let cancelled = false;
    let timer: number | null = null;

    async function reconcileOne(jobId: string) {
      if (cancelled || handled.has(jobId)) return;
      try {
        const job = await api<JobDetail>(`/jobs/${jobId}`);
        if (cancelled || handled.has(jobId)) return;
        if (job.status === "succeeded") {
          emitCompleted({
            jobId: job.id,
            status: "succeeded",
            assets: job.assets,
            result: job.result,
          });
        } else if (job.status === "failed" || job.status === "cancelled") {
          emitFailed({
            jobId: job.id,
            status: job.status,
            error: job.error ?? undefined,
          });
        }
      } catch {
        /* ignore transient */
      }
    }

    async function reconcileBusy() {
      const ids = [
        ...new Set(
          getBusyRef
            .current()
            .map((id) => String(id ?? "").trim())
            .filter(Boolean),
        ),
      ].filter((id) => !handled.has(id));
      if (!ids.length) return;
      await Promise.all(ids.map((id) => reconcileOne(id)));
    }

    function scheduleReconcileLoop() {
      if (timer != null) window.clearInterval(timer);
      const ms = socket.connected
        ? Math.max(pollMs, CONNECTED_SAFETY_MS)
        : Math.min(pollMs, DISCONNECTED_POLL_MS);
      timer = window.setInterval(() => void reconcileBusy(), ms);
    }

    const onConnect = () => {
      void reconcileBusy();
      scheduleReconcileLoop();
    };
    const onDisconnect = () => {
      scheduleReconcileLoop();
    };

    void reconcileBusy();
    scheduleReconcileLoop();
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
      socket.off("job:progress", handleProgress);
      socket.off("job:completed", handleCompleted);
      socket.off("job:failed", handleFailed);
      socket.off("asset:updated", handleAssetUpdated);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [enabled, pollMs]);
}
