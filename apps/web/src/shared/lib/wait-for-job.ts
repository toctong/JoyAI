"use client";

import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";

type JobDetail = {
  id: string;
  status: string;
  error?: string | null;
  result?: { text?: string | null } | null;
  assets?: unknown;
};

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/**
 * Wait for a job terminal state via Socket.IO push.
 * One immediate GET for races where the job already finished; no interval polling.
 */
export function waitForJob(
  jobId: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<JobDetail> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const signal = opts?.signal;

  return new Promise<JobDetail>((resolve, reject) => {
    let settled = false;
    const socket = getJobsSocket();

    const cleanup = () => {
      socket.off("job:completed", onCompleted);
      socket.off("job:failed", onFailed);
      signal?.removeEventListener("abort", onAbort);
      window.clearTimeout(timer);
    };

    const finishOk = (job: JobDetail) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(job);
    };

    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onAbort = () => {
      finishErr(new DOMException("Aborted", "AbortError"));
    };

    const onCompleted = (payload: {
      jobId?: string;
      id?: string;
      job?: { id?: string };
      result?: JobDetail["result"];
      assets?: unknown;
    }) => {
      const id = String(payload.jobId ?? payload.job?.id ?? payload.id ?? "");
      if (id !== jobId) return;
      const result = payload.result ?? null;
      if (result?.text) {
        finishOk({
          id: jobId,
          status: "succeeded",
          result,
          assets: payload.assets,
        });
        return;
      }
      // Socket payload sometimes omits full result — one GET fill, no poll loop.
      void api<JobDetail>(`/jobs/${jobId}`)
        .then((detail) => {
          if (settled) return;
          if (detail.status === "succeeded") {
            finishOk(detail);
            return;
          }
          finishOk({
            id: jobId,
            status: "succeeded",
            result,
            assets: payload.assets,
          });
        })
        .catch(() => {
          finishOk({
            id: jobId,
            status: "succeeded",
            result,
            assets: payload.assets,
          });
        });
    };

    const onFailed = (payload: {
      jobId?: string;
      id?: string;
      job?: { id?: string; error?: string | null };
      error?: string;
      status?: string;
    }) => {
      const id = String(payload.jobId ?? payload.job?.id ?? payload.id ?? "");
      if (id !== jobId) return;
      const status = payload.status === "cancelled" ? "cancelled" : "failed";
      finishErr(
        new Error(
          String(payload.error ?? payload.job?.error ?? "").trim() ||
            (status === "cancelled" ? "已取消" : "任务失败"),
        ),
      );
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.on("job:completed", onCompleted);
    socket.on("job:failed", onFailed);

    const timer = window.setTimeout(() => {
      finishErr(new Error("等待任务超时，请稍后重试"));
    }, timeoutMs);

    // Race: job may have finished before listeners attached.
    void api<JobDetail>(`/jobs/${jobId}`)
      .then((detail) => {
        if (settled) return;
        if (!TERMINAL.has(detail.status)) return;
        if (detail.status === "succeeded") {
          finishOk(detail);
          return;
        }
        finishErr(
          new Error(
            String(detail.error ?? "").trim() ||
              (detail.status === "cancelled" ? "已取消" : "任务失败"),
          ),
        );
      })
      .catch(() => {
        /* socket path still active */
      });
  });
}
