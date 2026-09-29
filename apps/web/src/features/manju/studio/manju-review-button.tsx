"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { useManjuStore } from "../manju-store";
import { submitWorkflowSkill } from "../lib/workflow-skill";
import { buildManjuReviewFacts } from "../lib/manju-review-facts";

type Props = {
  projectId: string;
  /** compact trigger for overview / script toolbar */
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  className?: string;
};

const SEV_LABEL = {
  error: "阻断",
  warn: "建议",
  info: "提示",
} as const;

export function ManjuReviewButton({
  projectId,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const flushSave = useManjuStore((s) => s.flushSave);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[projectId]));
  const [open, setOpen] = useState(false);

  const localFacts = useMemo(
    () => (project ? buildManjuReviewFacts(project) : []),
    [project],
  );
  const report = project?.lastReview ?? null;

  if (!project) return null;

  const runReview = async () => {
    try {
      setAnalyzing(projectId, true);
      await flushSave(projectId);
      await submitWorkflowSkill({
        project,
        skill: "manju_review",
      });
      setOpen(true);
      toast.success("已提交制作检查");
    } catch (e) {
      setAnalyzing(projectId, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={analyzing}
        onClick={() => {
          if (report?.findings?.length || report?.summary) {
            setOpen(true);
            return;
          }
          void runReview();
        }}
      >
        {analyzing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ClipboardCheck className="size-3.5" />
        )}
        {analyzing ? "检查中…" : "制作检查"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="manju-dialog max-w-lg gap-4 border-border bg-card p-5 shadow-none sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>制作检查报告</DialogTitle>
          </DialogHeader>

          {report?.summary ? (
            <p className="text-sm leading-relaxed text-foreground">
              {report.summary}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              尚未生成 AI 报告。下方为本地预检；点「重新检查」提交 AI 质检。
            </p>
          )}

          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {(report?.findings?.length
              ? report.findings
              : localFacts
            ).map((f, i) => (
              <div
                key={`${f.code}-${f.target}-${i}`}
                className={cn(
                  "rounded-lg border border-border px-3 py-2 text-xs leading-relaxed",
                  f.severity === "error" && "border-destructive/40 bg-destructive/5",
                  f.severity === "warn" && "bg-muted/40",
                )}
              >
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{SEV_LABEL[f.severity]}</span>
                  {f.target ? (
                    <span className="text-muted-foreground">{f.target}</span>
                  ) : null}
                  <span className="text-muted-foreground/70">{f.code}</span>
                </div>
                <p>{f.message}</p>
              </div>
            ))}
            {!report?.findings?.length && localFacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无明显问题</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={analyzing}
              onClick={() => void runReview()}
            >
              {analyzing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              重新检查
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
