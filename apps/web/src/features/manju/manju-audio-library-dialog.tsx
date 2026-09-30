"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mic2, Volume2 } from "lucide-react";
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
import {
  fetchPublicTtsVoices,
  resolveTtsPreviewUrl,
  type PublicTtsVoice,
} from "@/shared/lib/tts-voices";
import "./manju-library-import.css";

type LibraryAsset = {
  id: string;
  kind: string;
  url: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
};

type TabId = "voices" | "assets";

function assetDisplayName(asset: LibraryAsset): string {
  const raw = asset.meta?.originalName;
  if (typeof raw === "string" && raw.trim()) {
    return raw.replace(/\.[^.]+$/, "").trim() || raw.trim();
  }
  return `音频 ${asset.id.slice(0, 6)}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (picked: { assetId?: string; url: string; name: string }) => void;
};

/** 从后台音色库（有试听）或全局资产库选择音频，写入角色音色 */
export function ManjuAudioLibraryDialog({
  open,
  onOpenChange,
  onPick,
}: Props) {
  const [tab, setTab] = useState<TabId>("voices");
  const [loading, setLoading] = useState(false);
  const [voices, setVoices] = useState<PublicTtsVoice[]>([]);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setSelected(null);
      try {
        const [voiceList, assetList] = await Promise.all([
          fetchPublicTtsVoices().catch(() => [] as PublicTtsVoice[]),
          api<LibraryAsset[]>("/assets?kind=audio&take=120").catch(
            () => [] as LibraryAsset[],
          ),
        ]);
        if (cancelled) return;
        const withPreview = (voiceList ?? []).filter((v) =>
          Boolean(resolveTtsPreviewUrl(v.previewAudioUrl)),
        );
        setVoices(withPreview);
        setAssets((assetList ?? []).filter((a) => a.kind === "audio" && a.url));
        setTab(withPreview.length ? "voices" : "assets");
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

  const selectedVoice = useMemo(
    () => voices.find((v) => v.id === selected) ?? null,
    [voices, selected],
  );
  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selected) ?? null,
    [assets, selected],
  );

  const confirm = () => {
    if (tab === "voices") {
      if (!selectedVoice) return;
      const url = resolveTtsPreviewUrl(selectedVoice.previewAudioUrl);
      if (!url) {
        toast.error("该音色缺少试听音频");
        return;
      }
      onPick({
        url,
        name: selectedVoice.label || selectedVoice.voiceId,
      });
      onOpenChange(false);
      setSelected(null);
      toast.success("已从音色库写入角色音频");
      return;
    }
    if (!selectedAsset) return;
    onPick({
      assetId: selectedAsset.id,
      url: selectedAsset.url,
      name: assetDisplayName(selectedAsset),
    });
    onOpenChange(false);
    setSelected(null);
    toast.success("已从资产库写入音色音频");
  };

  const canConfirm =
    tab === "voices" ? Boolean(selectedVoice) : Boolean(selectedAsset);

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
          <DialogTitle>从音频库选择</DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            className={cn(
              "h-8 rounded-md px-3 text-xs transition",
              tab === "voices"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setTab("voices");
              setSelected(null);
            }}
          >
            音色库 ({voices.length})
          </button>
          <button
            type="button"
            className={cn(
              "h-8 rounded-md px-3 text-xs transition",
              tab === "assets"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setTab("assets");
              setSelected(null);
            }}
          >
            资产库 ({assets.length})
          </button>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : tab === "voices" ? (
          voices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              暂无带试听的音色。请到后台「音色库」启用并生成/填写预览音频，或改用资产库。
            </p>
          ) : (
            <div className="manju-library-dialog__body">
              {voices.map((voice) => {
                const url = resolveTtsPreviewUrl(voice.previewAudioUrl);
                const on = selected === voice.id;
                const name = voice.label || voice.voiceId;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    className={cn(
                      "manju-library-dialog__cell",
                      on && "is-selected",
                    )}
                    aria-pressed={on}
                    title={voice.voiceId}
                    onClick={() => setSelected(voice.id)}
                  >
                    <span className="flex size-full flex-col items-center justify-center gap-2 bg-muted/40 p-2">
                      <Mic2 className="size-6 opacity-50" />
                      {on && url ? (
                        <audio
                          className="w-full max-w-full"
                          controls
                          src={url}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : null}
                    </span>
                    <span className="manju-library-dialog__name">{name}</span>
                  </button>
                );
              })}
            </div>
          )
        ) : assets.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            暂无音频资产。可先在「资产」页上传，或用 AI 配音生成。
          </p>
        ) : (
          <div className="manju-library-dialog__body">
            {assets.map((asset) => {
              const name = assetDisplayName(asset);
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
          <Button disabled={!canConfirm} onClick={confirm}>
            选用选中
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
