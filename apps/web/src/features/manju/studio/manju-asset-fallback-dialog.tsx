"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "../manju-store";
import {
  extractCharacterNamesFromScript,
  newCharacterNamesNotInAssets,
} from "../lib/continue-episode";
import { manjuStudioHref } from "./manju-studio-routes";
import { cn } from "@/shared/lib/utils";

type Tab = "extract" | "paste";

type Props = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开时用于抽取的脚本文本；默认用项目 scriptText */
  scriptText?: string;
};

/**
 * AI 解析资产失败或资产为空时的兜底：从剧本抽角色名 / 粘贴名单 / 跳过。
 */
export function ManjuAssetFallbackDialog({
  projectId,
  open,
  onOpenChange,
  scriptText,
}: Props) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const addAsset = useManjuStore((s) => s.addAsset);
  const renameAsset = useManjuStore((s) => s.renameAsset);
  const [tab, setTab] = useState<Tab>("extract");
  const [paste, setPaste] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const source = (scriptText ?? project?.scriptText ?? "").trim();

  const extracted = useMemo(() => {
    if (!project || !source) return [] as string[];
    return newCharacterNamesNotInAssets(source, project.assets);
  }, [project, source]);

  useEffect(() => {
    if (!open) return;
    setTab(extracted.length > 0 ? "extract" : "paste");
    setPicked(new Set(extracted.slice(0, 12)));
    setPaste("");
  }, [open, extracted]);

  if (!project) return null;

  const parsePasteNames = (raw: string) =>
    raw
      .split(/[,，、\n;/|]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 1 && s.length <= 12);

  const applyNames = (names: string[]) => {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) {
      toast.message("没有可添加的角色名");
      return;
    }
    const existing = new Set(
      project.assets
        .filter((a) => a.kind === "character")
        .flatMap((a) => [a.name.trim(), ...(a.aliases ?? [])].filter(Boolean)),
    );
    let added = 0;
    for (const name of unique) {
      if (existing.has(name)) continue;
      const id = addAsset(projectId, "character");
      renameAsset(projectId, id, name);
      existing.add(name);
      added += 1;
    }
    if (added === 0) {
      toast.message("这些角色已在资产库中");
    } else {
      toast.success(`已添加 ${added} 个角色（可稍后补参考图）`);
    }
    onOpenChange(false);
  };

  const toggle = (name: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>手动登记角色</DialogTitle>
          <DialogDescription>
            AI 解析失败或结果为空时，可从剧本抽取对白角色名，或粘贴名单快速入库。
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "extract" ? "default" : "outline"}
            className="h-8"
            onClick={() => setTab("extract")}
          >
            从剧本抽取
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "paste" ? "default" : "outline"}
            className="h-8"
            onClick={() => setTab("paste")}
          >
            粘贴名单
          </Button>
        </div>

        {tab === "extract" ? (
          <div className="space-y-2">
            {extracted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                未从对白行识别到新角色。可改用粘贴名单，或先补剧本后再试。
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {extracted.map((name) => {
                  const on = picked.has(name);
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/40 text-foreground",
                        )}
                        onClick={() => toggle(name)}
                      >
                        {name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="manju-asset-fallback-paste">角色名</Label>
            <Textarea
              id="manju-asset-fallback-paste"
              rows={4}
              placeholder={"阿呆、李伯、王婶\n或每行一个名字"}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            className="sm:mr-auto"
          >
            <a href={manjuStudioHref(projectId, "characters")}>去角色页</a>
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              稍后补
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (tab === "extract") {
                  applyNames([...picked]);
                } else {
                  applyNames(parsePasteNames(paste));
                }
              }}
            >
              加入资产
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 供 use-manju-jobs 在 analyze 失败时广播 */
export const MANJU_ASSET_FALLBACK_EVENT = "manju:asset-fallback";

export function requestManjuAssetFallback(projectId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(MANJU_ASSET_FALLBACK_EVENT, { detail: { projectId } }),
  );
}
