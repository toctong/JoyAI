"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Heart,
  MoreHorizontal,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "@/shared/lib/toast";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import { ExplorePlyrPlayer } from "./explore-plyr-player";
import { ExploreDialogSkeleton } from "./explore-skeleton";
import type { ExploreFeedItem } from "./types";
import "./explore-detail-dialog.css";

type Props = {
  item: ExploreFeedItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemix: (item: ExploreFeedItem) => void;
};

function formatModelLabel(modelId: string | null) {
  if (!modelId) return "未知模型";
  return modelId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      if (part.toLowerCase() === "gpt") return "GPT";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function ExploreDetailDialog({
  item,
  open,
  onOpenChange,
  onRemix,
}: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    setReady(false);
  }, [item?.id, open]);

  useEffect(() => {
    if (!open || !item || ready) return;
    const t = window.setTimeout(() => setReady(true), 8000);
    return () => window.clearTimeout(t);
  }, [open, item, ready]);

  const markReady = useCallback(() => setReady(true), []);

  async function copyPrompt() {
    const text = item?.prompt?.trim();
    if (!text) {
      toast.error("没有可复制的提示词");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("提示词已复制");
    } catch {
      toast.error("复制失败");
    }
  }

  const isVideo = item?.type === "video";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="joy-explore-dialog-overlay" />
        <DialogPrimitive.Content
          className={cn(
            "joy-explore-dialog",
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "outline-none data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {item?.title || "作品详情"}
          </DialogTitle>

          <DialogClose className="joy-explore-dialog-close" aria-label="关闭">
            <X className="h-4 w-4" />
          </DialogClose>

          {item ? (
            <div className="joy-explore-dialog-inner">
              <div className="joy-explore-dialog-media">
                <div className="joy-explore-dialog-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnailUrl || item.mediaUrl}
                    alt=""
                    aria-hidden
                    className="joy-explore-dialog-blur"
                  />
                  <div className="joy-explore-dialog-fg">
                    {isVideo ? (
                      <ExplorePlyrPlayer
                        key={item.id}
                        src={item.mediaUrl}
                        poster={item.thumbnailUrl}
                        className="joy-explore-dialog-media-el"
                        onReady={markReady}
                        onError={markReady}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.mediaUrl}
                        alt={item.title}
                        className="joy-explore-dialog-media-el"
                        onLoad={markReady}
                        onError={markReady}
                      />
                    )}
                  </div>
                </div>
              </div>

              <aside className="joy-explore-dialog-side">
                <div className="joy-explore-dialog-side-top">
                  <div className="joy-explore-dialog-user">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.author.avatarUrl || JOYAI_BRAND.remote.avatar}
                      alt=""
                      className="joy-explore-dialog-avatar"
                    />
                    <span className="joy-explore-dialog-name">
                      {item.author.nickname}
                    </span>
                  </div>
                  <div className="joy-explore-dialog-actions">
                    <span className="joy-explore-dialog-like" title="点赞">
                      <Heart className="h-4 w-4" />
                      <span>{item.likeCount}</span>
                    </span>
                    <button
                      type="button"
                      className="joy-explore-dialog-more"
                      aria-label="更多"
                      onClick={() => toast.message("更多操作即将上线")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {item.modelId ? (
                  <div className="joy-explore-dialog-model">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{formatModelLabel(item.modelId)}</span>
                  </div>
                ) : null}

                <div className="joy-explore-dialog-prompt-head">
                  <span>提示词</span>
                  <button
                    type="button"
                    className="joy-explore-dialog-copy"
                    onClick={() => void copyPrompt()}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                </div>

                <div className="joy-explore-dialog-prompt">
                  {item.prompt || "（无提示词）"}
                </div>

                <p className="joy-explore-dialog-recreate">
                  <WandSparkles className="h-3.5 w-3.5" />
                  <span>
                    被「一键同款」复刻次数：
                    <em>{item.recreateCount ?? 0}</em>
                  </span>
                </p>

                <button
                  type="button"
                  className="joy-explore-dialog-remix"
                  onClick={() => onRemix(item)}
                >
                  <WandSparkles className="h-4 w-4" />
                  一键同款
                </button>
              </aside>
            </div>
          ) : null}

          {!ready ? (
            <div className="joy-explore-dialog-skel-layer">
              <ExploreDialogSkeleton />
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
