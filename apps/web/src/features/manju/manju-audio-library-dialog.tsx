"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
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
  return `音频 ${asset.id.slice(0, 6)}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (picked: { assetId: string; url: string; name: string }) => void;
};

/** 从全局资产库选择音频，写入角色音色 */
export function ManjuAudioLibraryDialog({
  open,
  onOpenChange,
  onPick,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LibraryAsset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await api<LibraryAsset[]>("/assets?kind=audio&take=120");
        if (cancelled) return;
        setItems((list ?? []).filter((a) => a.kind === "audio" && a.url));
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载音频库失败");
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
      url: selectedAsset.url,
      name: displayName(selectedAsset),
    });
    onOpenChange(false);
    setSelected(null);
    toast.success("已从资产库写入音色音频");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSelected(null);
      }}
    >
      <DialogContent className="manju-library-dialog">
        <DialogHeader className="shrink-0 space-y-0 pr-6 text-left">
          <DialogTitle>从资产库选择音色音频</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            暂无音频资产。可先在「资产」页上传，或用 AI 配音生成。
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
                  <span className="flex size-full flex-col items-center justify-center gap-2 bg-muted/40 p-2">
                    <Volume2 className="size-6 opacity-50" />
                    {on ? (
                      <audio
                        className="w-full max-w-full"
                        controls
                        src={asset.url}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : null}
                  </span>
                  <span className="manju-library-dialog__name">{name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="manju-library-dialog__footer">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!selectedAsset} onClick={confirm}>
            选用选中
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
