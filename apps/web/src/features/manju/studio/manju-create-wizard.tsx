"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { createManjuProject, projectFromDto } from "../manju-api";
import { useManjuStore } from "../manju-store";
import { MODE_OPTIONS, type ManjuGenMode } from "../manju-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
};

/**
 * Create wizard aligned with ArcReel Step1 basics: title + generation mode.
 */
export function ManjuCreateWizard({ open, onOpenChange, folderId }: Props) {
  const router = useRouter();
  const upsertProject = useManjuStore((s) => s.upsertProject);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<ManjuGenMode>("i2v");
  const [gridLayout, setGridLayout] = useState<"2x2" | "3x3">("2x2");
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    setCreating(true);
    try {
      const name =
        title.trim() ||
        `漫剧 ${new Date().toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      const dto = await createManjuProject(name, folderId ?? null);
      const project = projectFromDto(dto);
      project.settings = {
        ...project.settings,
        mode,
        gridLayout: mode === "grid" ? gridLayout : project.settings.gridLayout,
      };
      upsertProject(project);
      // Persist mode choice
      const { updateManjuProject, draftFromProject } = await import("../manju-api");
      await updateManjuProject(project.id, {
        title: project.title,
        draft: draftFromProject(project),
      });
      onOpenChange(false);
      setTitle("");
      setMode("i2v");
      router.push(`/manju/${project.id}/source`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建漫剧</DialogTitle>
        </DialogHeader>
        <div className="manju-create-wizard">
          <div className="space-y-2">
            <Label htmlFor="manju-create-title">项目名称</Label>
            <Input
              id="manju-create-title"
              value={title}
              placeholder="未命名漫剧"
              onChange={(e) => setTitle(e.target.value)}
              maxLength={48}
            />
          </div>
          <div className="space-y-2">
            <Label>生成模式</Label>
            <div className="manju-create-wizard__modes">
              {MODE_OPTIONS.filter((m) => m.available).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    "manju-create-wizard__mode",
                    mode === m.id && "is-active",
                  )}
                  onClick={() => setMode(m.id)}
                >
                  <strong>
                    {m.badge} · {m.title}
                  </strong>
                  <span>{m.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {mode === "grid" ? (
            <div className="space-y-2">
              <Label>宫格布局</Label>
              <div className="flex gap-2">
                {(["2x2", "3x3"] as const).map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant={gridLayout === g ? "default" : "outline"}
                    onClick={() => setGridLayout(g)}
                  >
                    {g}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={creating} onClick={() => void submit()}>
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : null}
            创建并进入剧本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
