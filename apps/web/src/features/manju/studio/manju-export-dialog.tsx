"use client";

import { useState } from "react";
import { Download, Film, FileJson, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetchBlob } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { draftFromProject } from "../manju-api";
import type { ManjuProjectDraft } from "../manju-types";

type Props = {
  project: ManjuProjectDraft;
  episodeId?: string | null;
  trigger?: React.ReactNode;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ManjuExportDialog({ project, episodeId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"json" | "jianying" | null>(null);

  const exportJson = () => {
    setBusy("json");
    try {
      const payload = {
        title: project.title,
        draft: draftFromProject(project),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const stem = (project.title || "manju").replace(/[\\/:*?"<>|]+/g, "_");
      downloadBlob(blob, `${stem}.json`);
      toast.success("已导出项目 JSON");
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  const exportJianying = async () => {
    setBusy("jianying");
    try {
      const q = episodeId ? `?episodeId=${encodeURIComponent(episodeId)}` : "";
      const blob = await apiFetchBlob(
        `/manju/projects/${project.id}/export/jianying${q}`,
      );
      const stem = (project.title || "manju").replace(/[\\/:*?"<>|]+/g, "_");
      downloadBlob(blob, `${stem}_jianying.zip`);
      toast.success("已下载剪映草稿包");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "剪映导出失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <Download className="size-3.5" />
            导出
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导出漫剧</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <button
            type="button"
            className="manju-export-option"
            disabled={busy !== null}
            onClick={exportJson}
          >
            <FileJson className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
              <strong className="text-sm font-medium">项目归档 JSON</strong>
              <em className="text-xs not-italic text-muted-foreground">
                完整草稿，可再导入
              </em>
            </span>
            {busy === "json" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
          </button>
          <button
            type="button"
            className="manju-export-option"
            disabled={busy !== null}
            onClick={() => void exportJianying()}
          >
            <Film className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
              <strong className="text-sm font-medium">剪映草稿包</strong>
              <em className="text-xs not-italic text-muted-foreground">
                media + draft_content.json（按镜头顺序）
              </em>
            </span>
            {busy === "jianying" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
