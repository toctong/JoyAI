"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  ImageIcon,
  Music,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "@/shared/lib/toast";
import { copyText } from "@/shared/lib/clipboard";
import { downloadAsset } from "@/shared/lib/download-asset";
import { cn } from "@/shared/lib/utils";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import {
  isJoyPhotoOpen,
  useDialogPhotoGuard,
} from "@/shared/ui/use-dialog-photo-guard";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { ExplorePlyrPlayer } from "@/features/explore/explore-plyr-player";
import { ExploreDialogSkeleton } from "@/features/explore/explore-skeleton";
import "@/features/explore/explore-detail-dialog.css";
import "./assets-detail-dialog.css";

function isVideoRefUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function isAudioRefUrl(url: string) {
  return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url);
}

export type AssetsPreviewItem = {
  id: string;
  kind: string;
  url: string;
  createdAt: string;
  mimeType?: string | null;
  jobId?: string | null;
  source?: string | null;
  meta?: Record<string, unknown> | null;
  originalName?: string | null;
  job?: {
    id: string;
    canvasProjectId?: string | null;
    canvasNodeId?: string | null;
    manjuProjectId?: string | null;
    modelName?: string | null;
    channelName?: string | null;
    prompt?: string | null;
    referenceUrls?: string[];
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
  const { photoOpen, onPhotoVisibleChange, guardOpenChange, contentProps } =
    useDialogPhotoGuard();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    onPhotoVisibleChange(false);
  }, [open, onPhotoVisibleChange]);

  useEffect(() => {
    setReady(false);
  }, [asset?.id, open]);

  useEffect(() => {
    if (!open || !asset || ready) return;
    if (asset.kind === "audio" || asset.kind === "text") {
      setReady(true);
      return;
    }
    const t = window.setTimeout(() => setReady(true), 8000);
    return () => window.clearTimeout(t);
  }, [open, asset, ready]);

  const markReady = useCallback(() => setReady(true), []);
  const isVideo = asset?.kind === "video";
  const isAudio = asset?.kind === "audio";
  const isDoc = asset?.kind === "text";
  const assetSource =
    asset?.source === "studio" ||
    asset?.source === "canvas" ||
    asset?.source === "manju" ||
    asset?.source === "tools" ||
    asset?.source === "upload"
      ? asset.source
      : asset && !asset.jobId && !asset.job
        ? "upload"
        : "studio";
  const isUpload = assetSource === "upload";
  const kindNoun = isVideo
    ? "视频"
    : isAudio
      ? "音频"
      : isDoc
        ? "文档"
        : "图片";
  const sourceLabel =
    assetSource === "upload"
      ? `上传${kindNoun}`
      : assetSource === "canvas"
        ? `画布${kindNoun}`
        : assetSource === "manju"
          ? `漫剧${kindNoun}`
          : assetSource === "tools"
            ? `工具${kindNoun}`
            : `创作${kindNoun}`;
  const prompt = asset?.job?.prompt?.trim() || "";
  const refUrls = asset?.job?.referenceUrls?.filter(Boolean) ?? [];
  const modelLabel = [asset?.job?.modelName, asset?.job?.channelName]
    .filter(Boolean)
    .join(" · ");
  const docPreview =
    typeof asset?.meta?.preview === "string" ? asset.meta.preview : "";
  const fileName =
    (typeof asset?.originalName === "string" && asset.originalName) ||
    (typeof asset?.meta?.originalName === "string"
      ? asset.meta.originalName
      : "") ||
    "";

  async function onCopyPrompt() {
    if (!prompt) {
      toast.error("没有可复制的提示词");
      return;
    }
    if (await copyText(prompt)) {
      toast.success("提示词已复制");
    } else {
      toast.error("复制失败");
    }
  }

  async function onDownload() {
    if (!asset?.url) return;
    try {
      const name =
        typeof asset.originalName === "string"
          ? asset.originalName
          : typeof asset.meta?.originalName === "string"
            ? asset.meta.originalName
            : undefined;
      await downloadAsset(asset.url, asset.kind, name);
      toast.success("已开始下载");
    } catch {
      toast.error("下载失败");
    }
  }

  return (
    <Dialog
      open={open}
      // Non-modal so PhotoView (body portal) is not aria-hidden/inert.
      // Overlay still blocks the page — do not toggle modal while open.
      modal={false}
      onOpenChange={(next) => guardOpenChange(next, onOpenChange)}
    >
      <DialogPortal>
        <DialogOverlay className="joy-explore-dialog-overlay" />
        <DialogPrimitive.Content
          className={cn(
            "joy-explore-dialog",
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "outline-none data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            photoOpen && "pointer-events-none",
          )}
          aria-describedby={undefined}
          onPointerDownOutside={(event) => {
            if (photoOpen || isJoyPhotoOpen()) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (photoOpen || isJoyPhotoOpen()) event.preventDefault();
          }}
          {...contentProps}
        >
          <DialogTitle className="sr-only">
            {isVideo
              ? "视频预览"
              : isAudio
                ? "音频预览"
                : isDoc
                  ? "文档预览"
                  : "图片预览"}
          </DialogTitle>

          <DialogClose className="joy-explore-dialog-close" aria-label="关闭">
            <X className="h-4 w-4" />
          </DialogClose>

          {asset ? (
            <JoyPhotoProvider onVisibleChange={onPhotoVisibleChange}>
            <div className="joy-explore-dialog-inner">
              <div className="joy-explore-dialog-media">
                <div className="joy-explore-dialog-stage">
                  {isVideo ? (
                    <video
                      src={asset.url}
                      muted
                      playsInline
                      autoPlay
                      loop
                      aria-hidden
                      className="joy-explore-dialog-blur"
                    />
                  ) : isAudio || isDoc ? (
                    <div className="joy-assets-dialog-file-bg" aria-hidden />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.url}
                      alt=""
                      aria-hidden
                      className="joy-explore-dialog-blur"
                    />
                  )}
                  <div className="joy-explore-dialog-fg">
                    {isVideo ? (
                      <ExplorePlyrPlayer
                        key={asset.id}
                        src={asset.url}
                        className="joy-explore-dialog-media-el"
                        onReady={markReady}
                        onError={markReady}
                      />
                    ) : isAudio ? (
                      <div className="joy-assets-dialog-file">
                        <Music className="h-10 w-10" />
                        <p>{fileName || "音频"}</p>
                        <audio
                          key={asset.id}
                          src={asset.url}
                          controls
                          className="joy-assets-dialog-audio"
                          onLoadedData={markReady}
                          onError={markReady}
                        />
                      </div>
                    ) : isDoc ? (
                      <div className="joy-assets-dialog-file">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/icons/doc-file.svg"
                          alt=""
                          className="joy-assets-doc-icon is-lg"
                        />
                        <p>{fileName || "文档"}</p>
                        {docPreview ? (
                          <pre className="joy-assets-dialog-preview">
                            {docPreview}
                          </pre>
                        ) : (
                          <a
                            href={asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="joy-assets-dialog-open"
                          >
                            打开文档
                          </a>
                        )}
                      </div>
                    ) : (
                      <PhotoView src={asset.url}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt=""
                          className="joy-explore-dialog-media-el"
                          style={{ cursor: "zoom-in" }}
                          onLoad={markReady}
                          onError={markReady}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </PhotoView>
                    )}
                  </div>
                </div>
              </div>

              <aside className="joy-explore-dialog-side joy-assets-dialog-side">
                <div className="joy-assets-dialog-kind">
                  {isVideo ? (
                    <Video className="h-3.5 w-3.5" />
                  ) : isAudio ? (
                    <Music className="h-3.5 w-3.5" />
                  ) : isDoc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/icons/doc-file.svg"
                      alt=""
                      className="joy-assets-doc-icon is-sm"
                    />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  <span>{sourceLabel}</span>
                </div>

                <div className="joy-assets-dialog-time">{createdLabel}</div>

                {modelLabel ? (
                  <div className="joy-explore-dialog-model">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{modelLabel}</span>
                  </div>
                ) : null}

                {!isUpload ? (
                  <>
                    <div className="joy-explore-dialog-prompt-head">
                      <span>提示词</span>
                      <button
                        type="button"
                        className="joy-explore-dialog-copy"
                        onClick={() => void onCopyPrompt()}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        复制
                      </button>
                    </div>

                    <div className="joy-explore-dialog-prompt">
                      {prompt || "（无提示词）"}
                    </div>

                    {refUrls.length > 0 ? (
                      <div className="joy-assets-dialog-refs">
                        <div className="joy-assets-dialog-refs-label">
                          参考 · {refUrls.length}
                        </div>
                        <div className="joy-assets-dialog-refs-grid">
                          {refUrls.map((url) => {
                            const video = isVideoRefUrl(url);
                            const audio = isAudioRefUrl(url);
                            if (video) {
                              return (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="joy-assets-dialog-ref is-video"
                                  aria-label="打开参考视频"
                                  title="参考视频"
                                >
                                  <JoyVideoPoster
                                    url={url}
                                    size="sm"
                                    fallback="video"
                                    className="size-full object-cover"
                                  />
                                </a>
                              );
                            }
                            if (audio) {
                              return (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="joy-assets-dialog-ref is-audio"
                                  aria-label="打开参考音频"
                                  title="参考音频"
                                >
                                  <Music className="joy-assets-dialog-ref-icon" />
                                </a>
                              );
                            }
                            return (
                              <PhotoView key={url} src={url}>
                                <button
                                  type="button"
                                  className="joy-assets-dialog-ref"
                                  aria-label="预览参考图"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" />
                                </button>
                              </PhotoView>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="joy-assets-dialog-upload-note">
                    用户上传的参考素材，无生成提示词
                  </p>
                )}

                <div className="joy-assets-dialog-actions">
                  <button
                    type="button"
                    className="joy-assets-dialog-btn is-primary"
                    onClick={() => void onDownload()}
                  >
                    <Download className="h-4 w-4" />
                    下载
                  </button>
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
                    <Link
                      href={locateHref}
                      className="joy-assets-dialog-btn"
                    >
                      <Crosshair className="h-4 w-4" />
                      在画布中定位
                    </Link>
                  ) : null}
                </div>
              </aside>
            </div>
            </JoyPhotoProvider>
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
