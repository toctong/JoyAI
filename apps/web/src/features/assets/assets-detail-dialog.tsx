"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Crosshair, ExternalLink, ImageIcon, Video, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/shared/lib/utils";
import { ExplorePlyrPlayer } from "@/features/explore/explore-plyr-player";
import { ExploreDialogSkeleton } from "@/features/explore/explore-skeleton";
import "@/features/explore/explore-detail-dialog.css";
import "./assets-detail-dialog.css";

export type AssetsPreviewItem = {
  id: string;
  kind: string;
  url: string;
  createdAt: string;
  mimeType?: string | null;
  job?: {
    id: string;
    canvasProjectId?: string | null;
    canvasNodeId?: string | null;
  } | null;
};

type Props = {
  asset: AssetsPreviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createdLabel: string;
  locateHref: string | null;
};

export function AssetsDetailDialog({
  asset,
  open,
  onOpenChange,
  createdLabel,
  locateHref,
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
  }, [asset?.id, open]);

  useEffect(() => {
    if (!open || !asset || ready) return;
    const t = window.setTimeout(() => setReady(true), 8000);
    return () => window.clearTimeout(t);
  }, [open, asset, ready]);

  const markReady = useCallback(() => setReady(true), []);
  const isVideo = asset?.kind === "video";

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
            {isVideo ? "视频预览" : "图片预览"}
          </DialogTitle>

          <DialogClose className="joy-explore-dialog-close" aria-label="关闭">
            <X className="h-4 w-4" />
          </DialogClose>

          {asset ? (
            <div className="joy-explore-dialog-inner">
              <div className="joy-explore-dialog-media">
                <div className="joy-explore-dialog-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt=""
                    aria-hidden
                    className="joy-explore-dialog-blur"
                  />
                  <div className="joy-explore-dialog-fg">
                    {isVideo ? (
                      <ExplorePlyrPlayer
                        key={asset.id}
                        src={asset.url}
                        className="joy-explore-dialog-media-el"
                        onReady={markReady}
                        onError={markReady}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.url}
                        alt=""
                        className="joy-explore-dialog-media-el"
                        onLoad={markReady}
                        onError={markReady}
                      />
                    )}
                  </div>
                </div>
              </div>

              <aside className="joy-explore-dialog-side joy-assets-dialog-side">
                <div className="joy-assets-dialog-kind">
                  {isVideo ? (
                    <Video className="h-3.5 w-3.5" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  <span>{isVideo ? "视频" : "图片"}</span>
                </div>

                <dl className="joy-assets-dialog-meta">
                  <div>
                    <dt>创建时间</dt>
                    <dd>{createdLabel}</dd>
                  </div>
                  {asset.mimeType ? (
                    <div>
                      <dt>类型</dt>
                      <dd className="joy-assets-dialog-mono">{asset.mimeType}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="joy-assets-dialog-actions">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="joy-assets-dialog-btn"
                  >
                    <ExternalLink className="h-4 w-4" />
                    新窗口打开
                  </a>
                  {locateHref ? (
                    <Link href={locateHref} className="joy-assets-dialog-btn is-primary">
                      <Crosshair className="h-4 w-4" />
                      在画布中定位
                    </Link>
                  ) : null}
                </div>
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
