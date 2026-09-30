"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { useManjuProject, useManjuStore } from "../manju-store";
import { useManjuJobBridge } from "../use-manju-jobs";
import type { ManjuProjectDraft } from "../manju-types";

type StudioContextValue = {
  projectId: string;
  loading: boolean;
  saving: boolean;
  analyzing: boolean;
};

const ManjuStudioContext = createContext<StudioContextValue | null>(null);

/** Stable flags only — project data comes from the store so field edits don't fan out via context. */
export function useManjuStudioFlags() {
  const ctx = useContext(ManjuStudioContext);
  if (!ctx) {
    throw new Error("useManjuStudio must be used within ManjuStudioProvider");
  }
  return ctx;
}

export function useManjuStudio() {
  const ctx = useManjuStudioFlags();
  const project = useManjuProject(ctx.projectId);
  if (!project) {
    throw new Error("漫剧项目未加载");
  }
  return { ...ctx, project };
}

export function useManjuStudioOptional() {
  const ctx = useContext(ManjuStudioContext);
  const project = useManjuProject(ctx?.projectId);
  if (!ctx) return null;
  if (!project) return { ...ctx, project: null as ManjuProjectDraft | null };
  return { ...ctx, project };
}

export function ManjuStudioProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const project = useManjuProject(projectId);
  const loadProject = useManjuStore((s) => s.loadProject);
  const saving = useManjuStore((s) => Boolean(s.savingIds[projectId]));
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[projectId]));
  const [loading, setLoading] = useState(!project);

  useManjuJobBridge(projectId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadProject(projectId);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载项目失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, projectId]);

  const value = useMemo<StudioContextValue>(
    () => ({
      projectId,
      loading,
      saving,
      analyzing,
    }),
    [analyzing, loading, projectId, saving],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载漫剧工作室…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
        <p>项目不存在或已删除</p>
        <Button onClick={() => router.replace("/manju")}>返回项目列表</Button>
      </div>
    );
  }

  return (
    <ManjuStudioContext.Provider value={value}>
      {children}
    </ManjuStudioContext.Provider>
  );
}
