"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Play,
  ArrowUp,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { tosThumbUrl } from "@/shared/lib/media-url";
import { ExplorePlyrPlayer } from "@/features/explore/explore-plyr-player";
import { stopAllVideoHoverPreviews } from "@/shared/lib/video-feed-preview";
import "./inspire-works-detail.css";

export type InspireWorkDetailItem = {
  id: number;
  title: string;
  coverUrl: string;
  videoUrl: string;
  authorName: string;
  authorAvatar: string;
  likeCount: number;
  isPublic: boolean;
  description?: string;
};

type Props = {
  works: InspireWorkDetailItem[];
  activeId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActiveChange: (id: number) => void;
};

export function InspireWorksDetail({
  works,
  activeId,
  open,
  onOpenChange,
  onActiveChange,
}: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [watching, setWatching] = useState(false);

  const index = Math.max(
    0,
    works.findIndex((w) => w.id === activeId),
  );
  const current = works[index] ?? null;

  useEffect(() => {
    if (!open) return;
    stopAllVideoHoverPreviews();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    setWatching(false);
  }, [activeId, open]);

  useEffect(() => {
    if (!open || !current) return;
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-work-id="${current.id}"]`,
    );
    el?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [open, current?.id]);

  function close() {
    onOpenChange(false);
  }

  function go(delta: number) {
    if (works.length === 0) return;
    const next = (index + delta + works.length) % works.length;
    const item = works[next];
    if (item) onActiveChange(item.id);
  }

  function scrollStrip(delta: number) {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: delta * Math.min(320, el.clientWidth * 0.6), behavior: "smooth" });
  }

  if (!current) return null;

  const blurSrc = current.coverUrl || undefined;
  const canWatch = Boolean(current.videoUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="joy-inspire-wd-overlay" />
        <DialogPrimitive.Content
          className={cn(
            "joy-inspire-wd",
            "fixed inset-0 z-50 outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">
            {current.authorName} · {current.title}
          </DialogTitle>

          {blurSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={blurSrc}
              alt=""
              className="joy-inspire-wd-blur"
              draggable={false}
            />
          ) : null}
          <div className="joy-inspire-wd-veil" aria-hidden />

          <header className="joy-inspire-wd-top">
            <button
              type="button"
              className="joy-inspire-wd-back"
              onClick={close}
            >
              <ChevronLeft className="joy-inspire-wd-back-icon" aria-hidden />
              返回
            </button>
            <div className="joy-inspire-wd-who">
              {current.authorAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.authorAvatar}
                  alt=""
                  className="joy-inspire-wd-avatar"
                />
              ) : (
                <span className="joy-inspire-wd-avatar is-empty" />
              )}
              <span className="joy-inspire-wd-who-text">
                <span className="joy-inspire-wd-author">
                  {current.authorName}
                </span>
                <span className="joy-inspire-wd-title">
                  《{current.title}》
                </span>
              </span>
            </div>
          </header>

          <div className="joy-inspire-wd-main">
            <div className="joy-inspire-wd-stage">
              {watching && canWatch ? (
                <ExplorePlyrPlayer
                  key={current.id}
                  src={current.videoUrl}
                  poster={current.coverUrl || null}
                  className="joy-inspire-wd-player"
                />
              ) : current.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.coverUrl}
                  alt=""
                  className="joy-inspire-wd-poster"
                  draggable={false}
                />
              ) : canWatch ? (
                <video
                  className="joy-inspire-wd-poster"
                  src={current.videoUrl}
                  muted
                  playsInline
                  loop
                  autoPlay
                  preload="metadata"
                />
              ) : (
                <div className="joy-inspire-wd-empty" />
              )}
            </div>

            <div className="joy-inspire-wd-actions">
              <button
                type="button"
                className="joy-inspire-wd-watch"
                disabled={!canWatch}
                onClick={() => {
                  if (!canWatch) {
                    toast.error("暂无视频");
                    return;
                  }
                  setWatching(true);
                }}
              >
                <Play className="joy-inspire-wd-watch-icon" aria-hidden />
                立即观看
              </button>
              <button
                type="button"
                className="joy-inspire-wd-process"
                onClick={() => toast.message("暂无制作过程")}
              >
                <LayoutGrid
                  className="joy-inspire-wd-process-icon"
                  aria-hidden
                />
                查看制作过程
              </button>
            </div>
          </div>

          <div className="joy-inspire-wd-bottom">
            <button
              type="button"
              className="joy-inspire-wd-strip-nav"
              aria-label="上一个"
              onClick={() => {
                go(-1);
                scrollStrip(-1);
              }}
            >
              <ChevronLeft />
            </button>

            <div className="joy-inspire-wd-strip" ref={stripRef}>
              {works.map((w) => {
                const on = w.id === current.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    data-work-id={w.id}
                    className={cn(
                      "joy-inspire-wd-thumb",
                      on && "is-on",
                    )}
                    onClick={() => onActiveChange(w.id)}
                    aria-current={on ? "true" : undefined}
                  >
                    {w.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tosThumbUrl(w.coverUrl, "sm") || w.coverUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="joy-inspire-wd-thumb-empty" />
                    )}
                    <span className="joy-inspire-wd-thumb-cap">{w.title}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="joy-inspire-wd-strip-nav"
              aria-label="下一个"
              onClick={() => {
                go(1);
                scrollStrip(1);
              }}
            >
              <ChevronRight />
            </button>

            <button
              type="button"
              className="joy-inspire-wd-up"
              aria-label="关闭"
              onClick={close}
            >
              <ArrowUp />
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
