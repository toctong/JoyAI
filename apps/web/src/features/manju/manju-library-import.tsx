"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import type { ManjuAssetDraft } from "./manju-types";
import "./manju-library-import.css";

type LibraryAsset = {
  id: string;
  kind: string;
  url: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
};

function displayName(asset: LibraryAsset): string {
  const raw = asset.meta?.originalName;
  if (typeof raw === "string" && raw.trim()) {
    return raw.replace(/\.[^.]+$/, "").trim() || raw.trim();
  }
  return `素材 ${asset.id.slice(0, 6)}`;
}

type Props = {
  kind: ManjuAssetDraft["kind"];
  disabled?: boolean;
  className?: string;
  onPick: (picked: {
    assetId: string;
    imageUrl: string;
    name: string;
  }) => void;
};

/** 从全局素材库引用图片进漫剧资产（不重新上传） */
export function ManjuLibraryImport({ kind, disabled, className, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LibraryAsset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await api<LibraryAsset[]>("/assets?take=120");
        if (cancelled) return;
        setItems(list.filter((a) => a.kind === "image" && a.url));
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载素材库失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedAsset = useMemo(
    () => items.find((a) => a.id === selected) ?? null,
    [items, selected],
  );

  const confirm = () => {
    if (!selectedAsset) return;
    onPick({
      assetId: selectedAsset.id,
      imageUrl: selectedAsset.url,
      name: displayName(selectedAsset),
    });
    setOpen(false);
    setSelected(null);
    toast.success("已从素材库导入参考图");
  };

  const kindLabel =
    kind === "character" ? "角色" : kind === "scene" ? "场景" : "道具";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("manju-asset-card__action", className)}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        素材库
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSelected(null);
        }}
      >
        <DialogContent className="manju-library-dialog">
          <DialogHeader className="shrink-0 space-y-0 pr-6 text-left">
            <DialogTitle>从素材库导入{kindLabel}参考图</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              素材库还没有图片。可先在「资产」页上传，或在此直接上传参考图。
            </p>
          ) : (
            <div className="manju-library-dialog__body">
              {items.map((asset) => {
                const name = displayName(asset);
                const on = selected === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={cn(
                      "manju-library-dialog__cell",
                      on && "is-selected",
                    )}
                    aria-pressed={on}
                    title={name}
                    onClick={() => setSelected(asset.id)}
                  >
                    <JoyAssetThumb
                      url={asset.url}
                      size="md"
                      className="manju-library-dialog__thumb"
                    />
                    <span className="manju-library-dialog__name">{name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="manju-library-dialog__footer">
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button disabled={!selectedAsset} onClick={confirm}>
              导入选中
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
