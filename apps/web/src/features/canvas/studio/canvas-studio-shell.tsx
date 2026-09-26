"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import "./canvas-studio-shell.css";

export type StudioResultItem = {
  id: string;
  url: string;
  label?: string;
};

type Props = {
  open: boolean;
  title: ReactNode;
  subtitle?: string;
  /** Optional leading icon next to the title (e.g. crop glyph). */
  titleIcon?: ReactNode;
  /** Source image for the left rail "原图" thumb. */
  sourceUrl: string;
  results?: StudioResultItem[];
  activeResultId?: string | null;
  onSelectSource?: () => void;
  onSelectResult?: (id: string) => void;
  onClose: () => void;
  /** Dedicated header strip above the stage image (brush bar, crop tools, …). */
  stageTools?: ReactNode;
  stageHint?: string;
  center: ReactNode;
  sideTitle?: ReactNode;
  sideMeta?: string;
  sideHeadAction?: ReactNode;
  side: ReactNode;
  sideFoot?: ReactNode;
  footerHint?: string;
  footerActions?: ReactNode;
  className?: string;
};

export function CanvasStudioShell({
  open,
  title,
  subtitle,
  titleIcon,
  sourceUrl,
  results = [],
  activeResultId = null,
  onSelectSource,
  onSelectResult,
  onClose,
  stageTools,
  stageHint,
  center,
  sideTitle,
  sideMeta,
  sideHeadAction,
  side,
  sideFoot,
  footerHint,
  footerActions,
  className,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const viewingSource = !activeResultId;
  const dialogLabel =
    typeof title === "string" ? title : subtitle ? String(subtitle) : "工作室工具";

  return createPortal(
    <div
      className={cn("joy-studio-shell", className)}
      data-canvas-shortcuts-ignore
      data-canvas-no-zoom
      onPointerDown={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
    >
      <header className="joy-studio-shell__header">
        <div className="joy-studio-shell__title-row">
          {titleIcon ? (
            <span className="joy-studio-shell__title-icon">{titleIcon}</span>
          ) : null}
          <h2 className="joy-studio-shell__title">{title}</h2>
          {subtitle ? (
            <span className="joy-studio-shell__subtitle">{subtitle}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="joy-studio-shell__close"
          onClick={onClose}
        >
          Esc 关闭
          <span className="joy-studio-shell__close-x">
            <X className="size-3.5" />
          </span>
        </button>
      </header>

      <div className="joy-studio-shell__body">
        <aside className="joy-studio-shell__rail">
          <span className="joy-studio-shell__rail-label">原图</span>
          <button
            type="button"
            className={cn(
              "joy-studio-shell__thumb",
              viewingSource && "is-active",
            )}
            onClick={() => onSelectSource?.()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceUrl} alt="" draggable={false} />
            <span className="joy-studio-shell__thumb-cap">原图</span>
          </button>

          <span className="joy-studio-shell__rail-label">
            结果 {results.length}
          </span>
          {results.length === 0 ? (
            <p className="joy-studio-shell__rail-empty">
              生成结果会在这里陈列，可连续出图对比
            </p>
          ) : (
            results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "joy-studio-shell__thumb",
                  activeResultId === item.id && "is-active",
                )}
                onClick={() => onSelectResult?.(item.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" draggable={false} />
                <span className="joy-studio-shell__thumb-cap">
                  {item.label ?? `结果 ${index + 1}`}
                </span>
              </button>
            ))
          )}
        </aside>

        <section className="joy-studio-shell__center">
          {stageTools ? (
            <div className="joy-studio-shell__center-head">{stageTools}</div>
          ) : null}
          <div className="joy-studio-shell__stage">{center}</div>
          {stageHint ? (
            <p className="joy-studio-shell__center-foot">{stageHint}</p>
          ) : null}
        </section>

        <aside className="joy-studio-shell__side">
          {(sideTitle || sideHeadAction) && (
            <div className="joy-studio-shell__side-head">
              <div className="joy-studio-shell__side-head-main">
                {sideTitle ? (
                  <h3 className="joy-studio-shell__side-title">{sideTitle}</h3>
                ) : null}
                {sideMeta ? (
                  <p className="joy-studio-shell__side-meta">{sideMeta}</p>
                ) : null}
              </div>
              {sideHeadAction ? (
                <div className="joy-studio-shell__side-head-action">
                  {sideHeadAction}
                </div>
              ) : null}
            </div>
          )}
          <div className="joy-studio-shell__side-body">{side}</div>
          {sideFoot ? (
            <div className="joy-studio-shell__side-foot">{sideFoot}</div>
          ) : null}
        </aside>
      </div>

      <footer className="joy-studio-shell__footer">
        <p className="joy-studio-shell__footer-hint">{footerHint ?? ""}</p>
        <div className="joy-studio-shell__footer-actions">{footerActions}</div>
      </footer>
    </div>,
    document.body,
  );
}
