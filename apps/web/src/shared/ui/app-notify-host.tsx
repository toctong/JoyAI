"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import {
  useAppNotifyStore,
  type AppNotifyItem,
} from "@/shared/lib/app-notify-store";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { cn } from "@/shared/lib/utils";
import "./app-notify.css";

function ToneIcon({ tone }: { tone: "success" | "error" | "info" }) {
  if (tone === "success") {
    return <CheckCircle2 className="joy-app-notify-icon is-success" aria-hidden />;
  }
  if (tone === "error") {
    return <CircleAlert className="joy-app-notify-icon is-error" aria-hidden />;
  }
  return <Info className="joy-app-notify-icon is-info" aria-hidden />;
}

function NotifyCard({ item }: { item: AppNotifyItem }) {
  const dismiss = useAppNotifyStore((s) => s.dismiss);

  useEffect(() => {
    if (item.durationMs <= 0) return;
    const t = window.setTimeout(() => dismiss(item.id), item.durationMs);
    return () => window.clearTimeout(t);
  }, [item.id, item.durationMs, dismiss]);

  return (
    <article
      className={cn("joy-app-notify-card", `is-${item.tone}`)}
      role="status"
      aria-live="polite"
    >
      <div className="joy-app-notify-head">
        <ToneIcon tone={item.tone} />
        <div className="joy-app-notify-copy">
          <h3 className="joy-app-notify-title">{item.title}</h3>
          {item.lines.map((line, index) => (
            <p key={`${item.id}-line-${index}`} className="joy-app-notify-line">
              {line}
            </p>
          ))}
        </div>
        <button
          type="button"
          className="joy-app-notify-close"
          aria-label="关闭通知"
          onClick={() => dismiss(item.id)}
        >
          <X className="size-[var(--joy-icon-sm)]" />
        </button>
      </div>

      {item.assets && item.assets.length > 0 ? (
        <div className="joy-app-notify-thumbs">
          {item.assets.map((asset) => {
            const isVideo =
              asset.kind === "video" ||
              /\.(mp4|webm|mov)(\?|$)/i.test(asset.url);
            return (
              <div key={asset.id} className="joy-app-notify-thumb">
                {isVideo ? (
                  <JoyVideoPoster
                    url={asset.url}
                    size="sm"
                    className="size-full object-cover"
                  />
                ) : (
                  <JoyAssetThumb
                    url={asset.url}
                    size="sm"
                    className="size-full object-cover"
                    alt=""
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {item.href ? (
        <div className="joy-app-notify-actions">
          <Link
            href={item.href}
            className="joy-app-notify-action"
            onClick={() => dismiss(item.id)}
          >
            {item.actionLabel ?? "查看"}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export function AppNotifyHost() {
  // Select the array itself — do not `.map()` inside the selector
  // (new array each call breaks useSyncExternalStore / getServerSnapshot).
  const items = useAppNotifyStore((s) => s.items);
  if (!items.length) return null;

  return (
    <div className="joy-app-notify-host" aria-label="应用通知">
      {items.map((item) => (
        <NotifyCard key={item.id} item={item} />
      ))}
    </div>
  );
}
