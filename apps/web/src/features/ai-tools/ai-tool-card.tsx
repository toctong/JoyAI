"use client";

import Link from "next/link";
import { useState } from "react";
import type { AiToolDef } from "./tool-catalog";
import { staticAssetUrl } from "@/shared/lib/static-asset";

type Props = {
  tool: AiToolDef;
  priority?: boolean;
};

/** Catalog / inspire spotlight card — stacked cover preview. */
export function AiToolCard({ tool, priority }: Props) {
  const disabled = tool.status === "coming_soon";
  const covers = (tool.covers?.filter(Boolean) ?? []).map(staticAssetUrl);
  const [back, mid, face] = [
    covers[0],
    covers[1] ?? covers[0],
    covers[2] ?? covers[1] ?? covers[0],
  ];
  // One URL per card until hover → ~⅓ CDN requests; browser caches face for layers.
  const [stackDeep, setStackDeep] = useState(false);
  const revealStack = () => setStackDeep(true);
  const backSrc = stackDeep ? back : face;
  const midSrc = stackDeep ? mid : face;

  const body = (
    <>
      <div className="joy-ai-tool-card-copy">
        <div className="joy-ai-tool-card-title-row">
          <h3 className="joy-ai-tool-card-title">{tool.name}</h3>
          {tool.badge === "new" && !disabled ? (
            <span className="joy-ai-tool-badge is-new">NEW</span>
          ) : null}
          {disabled ? (
            <span className="joy-ai-tool-badge is-soon">即将上线</span>
          ) : null}
        </div>
        <p className="joy-ai-tool-card-desc">{tool.description}</p>
      </div>
      <div
        className="joy-ai-tool-card-preview"
        style={{ ["--tool-accent" as string]: tool.accent }}
        aria-hidden
      >
        <div className={face ? "joy-ai-tool-stack is-photo" : "joy-ai-tool-stack"}>
          {face ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="joy-ai-tool-stack-layer is-back"
                src={backSrc}
                alt=""
                loading="lazy"
                decoding="async"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="joy-ai-tool-stack-layer is-mid"
                src={midSrc}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <div className="joy-ai-tool-stack-face is-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={face}
                  alt=""
                  loading={priority ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={priority ? "high" : "auto"}
                />
              </div>
            </>
          ) : (
            <>
              <span className="joy-ai-tool-stack-layer is-back" />
              <span className="joy-ai-tool-stack-layer is-mid" />
              <div className="joy-ai-tool-stack-face">
                {Array.from({ length: 9 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (disabled) {
    return (
      <div
        className="joy-ai-tool-card is-disabled"
        aria-disabled
        onMouseEnter={revealStack}
        onFocus={revealStack}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="joy-ai-tool-card"
      onMouseEnter={revealStack}
      onFocus={revealStack}
    >
      {body}
    </Link>
  );
}
