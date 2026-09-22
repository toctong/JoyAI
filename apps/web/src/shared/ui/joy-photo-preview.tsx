"use client";

import type { ReactNode } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Download, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { downloadAsset } from "@/shared/lib/download-asset";
import { toast } from "@/shared/lib/toast";
import "./joy-photo-preview.css";

export { PhotoView };

type Props = {
  children: ReactNode;
  className?: string;
  onVisibleChange?: (visible: boolean) => void;
};

/** Photo lightbox: click opens preview; download lives in the toolbar only. */
export function JoyPhotoProvider({
  children,
  className,
  onVisibleChange,
}: Props) {
  return (
    <PhotoProvider
      className={className}
      onVisibleChange={(visible) => {
        if (visible) {
          document.documentElement.setAttribute("data-joy-photo-open", "1");
        } else {
          document.documentElement.removeAttribute("data-joy-photo-open");
        }
        onVisibleChange?.(visible);
      }}
      toolbarRender={({ images, index, onScale, scale, onRotate, rotate }) => {
        const src = images[index]?.src;
        return (
          <div className="joy-photo-toolbar">
            <button
              type="button"
              className="joy-photo-tool"
              aria-label="放大"
              title="放大"
              onClick={() => onScale(scale + 0.5)}
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="joy-photo-tool"
              aria-label="缩小"
              title="缩小"
              onClick={() => onScale(Math.max(0.5, scale - 0.5))}
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="joy-photo-tool"
              aria-label="旋转"
              title="旋转"
              onClick={() => onRotate(rotate + 90)}
            >
              <RotateCw className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="joy-photo-tool"
              aria-label="下载"
              title="下载"
              disabled={!src}
              onClick={() => {
                if (!src) return;
                void downloadAsset(src).catch(() =>
                  toast.error("下载失败"),
                );
              }}
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        );
      }}
    >
      {children}
    </PhotoProvider>
  );
}
