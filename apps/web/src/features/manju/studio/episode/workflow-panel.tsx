"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";

export type ManjuWorkflowSummary = {
  nextAction: string;
  nextActionLabel?: string;
  blockers: string[];
  staleShotIds: string[];
  counts?: {
    assets: number;
    assetsWithImage: number;
    shots: number;
    storyboards: number;
    videos: number;
  };
};

const BLOCKER_LABELS: Record<string, string> = {
  no_script: "还没有剧本正文",
  no_assets: "尚未创建角色 / 场景 / 道具",
  no_asset_images: "资产还没有参考图",
  script_unconfirmed: "分镜脚本尚未确认",
  storyboard_incomplete: "部分镜头缺少分镜图",
  video_incomplete: "部分镜头缺少视频",
};

const ACTION_LABELS: Record<string, string> = {
  import_script: "导入或编写剧本",
  analyze_assets: "分析角色 / 场景 / 道具",
  confirm_script: "确认分镜脚本",
  generate_storyboard: "生成分镜图",
  generate_video: "生成镜头视频",
  preview: "预览与导出",
  idle: "暂无待办",
};

type Props = {
  projectId: string;
  onConfirmScript?: () => void;
  className?: string;
};

export function ManjuWorkflowPanel({
  projectId,
  onConfirmScript,
  className,
}: Props) {
  const [summary, setSummary] = useState<ManjuWorkflowSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ManjuWorkflowSummary>(
        `/manju/projects/${projectId}/workflow`,
      );
      setSummary(data);
    } catch (e) {
      setSummary(null);
      toast.error(e instanceof Error ? e.message : "工作流状态加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const label =
    summary?.nextActionLabel ||
    (summary ? ACTION_LABELS[summary.nextAction] ?? summary.nextAction : "");

  return (
    <div className={cn("manju-workflow-panel", className)}>
      <div className="manju-workflow-panel__main">
        {loading ? (
          <span className="manju-workflow-panel__muted inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" />
            同步工作流…
          </span>
        ) : summary ? (
          <>
            <span className="manju-workflow-panel__next">
              下一步
              <ArrowRight className="size-3.5 opacity-60" />
              <strong>{label}</strong>
            </span>
            {summary.blockers.length > 0 ? (
              <ul className="manju-workflow-panel__blockers">
                {summary.blockers.slice(0, 3).map((b) => (
                  <li key={b}>
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                    {BLOCKER_LABELS[b] ?? b}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="manju-workflow-panel__ok inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                无阻塞项
              </span>
            )}
            {summary.staleShotIds.length > 0 ? (
              <span className="manju-workflow-panel__stale">
                {summary.staleShotIds.length} 镜素材已过期
              </span>
            ) : null}
          </>
        ) : (
          <span className="manju-workflow-panel__muted">工作流不可用</span>
        )}
      </div>
      <div className="manju-workflow-panel__actions">
        {summary?.nextAction === "confirm_script" && onConfirmScript ? (
          <Button size="sm" onClick={onConfirmScript}>
            确认脚本
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void refresh()}
          disabled={loading}
        >
          刷新
        </Button>
      </div>
    </div>
  );
}
