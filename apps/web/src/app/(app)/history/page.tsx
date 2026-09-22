"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Crosshair } from "lucide-react";
import { api } from "@/shared/lib/api";
import { formatDurationMs } from "@/shared/lib/format-duration";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Job = {
  id: string;
  kind: string;
  status: string;
  progress?: number | null;
  error?: string | null;
  createdAt: string;
  durationMs?: number | null;
  modelName?: string | null;
  channelName?: string | null;
  canvasProjectId?: string | null;
  canvasNodeId?: string | null;
  input?: { prompt?: string; canvasProjectId?: string; canvasNodeId?: string };
  assets?: { id: string; url: string }[];
};

function isBusyStatus(status: string) {
  return status === "queued" || status === "running" || status === "polling";
}

function locateHref(job: Job) {
  const projectId = job.canvasProjectId || job.input?.canvasProjectId;
  if (!projectId) return null;
  const q = new URLSearchParams();
  if (job.canvasNodeId || job.input?.canvasNodeId) {
    q.set("nodeId", String(job.canvasNodeId || job.input?.canvasNodeId));
  }
  q.set("jobId", job.id);
  const assetId = job.assets?.[0]?.id;
  if (assetId) q.set("assetId", assetId);
  return `/canvas/${projectId}?${q.toString()}`;
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  async function load() {
    const res = await api<{ items: Job[] }>("/jobs?take=50");
    setJobs([...res.items].reverse());
  }

  useEffect(() => {
    void load();
  }, []);

  useJobLifecycle({
    getBusyJobIds: () =>
      jobsRef.current.filter((j) => isBusyStatus(j.status)).map((j) => j.id),
    onProgress: (payload) => {
      if (!payload.jobId) return;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === payload.jobId);
        if (idx < 0) {
          void load();
          return prev;
        }
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: payload.status ?? copy[idx].status,
          progress:
            typeof payload.progress === "number"
              ? payload.progress
              : copy[idx].progress,
        };
        return copy;
      });
    },
    onCompleted: (payload) => {
      const jobId = payload.jobId;
      if (!jobId) return;
      const assets = (payload.assets ?? [])
        .filter((a): a is { id: string; url: string } =>
          Boolean(a?.id && a?.url),
        )
        .map((a) => ({ id: a.id, url: String(a.url) }));
      let found = false;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === jobId);
        if (idx < 0) return prev;
        found = true;
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: "succeeded",
          progress: 100,
          assets: assets.length ? assets : copy[idx].assets,
          error: null,
        };
        return copy;
      });
      if (!found) void load();
    },
    onFailed: (payload) => {
      const jobId = payload.jobId;
      if (!jobId) return;
      let found = false;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === jobId);
        if (idx < 0) return prev;
        found = true;
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: payload.status === "cancelled" ? "cancelled" : "failed",
          error: payload.error ?? copy[idx].error ?? "生成失败",
        };
        return copy;
      });
      if (!found) void load();
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">历史</h1>
        <p className="mt-1 text-sm text-muted-foreground">生成任务时间线</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>任务</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无历史</p>
          ) : (
            jobs.map((job) => {
              const href = locateHref(job);
              return (
                <div
                  key={job.id}
                  className="rounded-md border border-border bg-muted/20 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5">
                      {job.kind}
                    </span>
                    <span>{job.status}</span>
                    {job.channelName ? <span>{job.channelName}</span> : null}
                    {job.modelName ? <span>{job.modelName}</span> : null}
                    {typeof job.durationMs === "number" ? (
                      <span>用时 {formatDurationMs(job.durationMs)}</span>
                    ) : null}
                    {typeof job.progress === "number" ? (
                      <span>{job.progress}%</span>
                    ) : null}
                    <span className="ml-auto">
                      {dayjs(job.createdAt).format("YYYY-MM-DD HH:mm")}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm">
                    {job.input?.prompt || "—"}
                  </p>
                  {job.error ? (
                    <p className="mt-1 text-xs text-destructive">{job.error}</p>
                  ) : null}
                  {job.assets && job.assets.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {job.assets.map((a) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={a.id}
                          src={a.url}
                          alt=""
                          className="h-14 w-14 rounded object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {href ? (
                    <Link
                      href={href}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      在画布中定位
                    </Link>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
