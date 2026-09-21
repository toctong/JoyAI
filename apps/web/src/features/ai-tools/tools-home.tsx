"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AI_TOOL_CATEGORIES,
  AI_TOOLS,
  type AiToolCategory,
  type AiToolDef,
} from "./tool-catalog";
import "./ai-tools.css";

export function AiToolsHome() {
  const [category, setCategory] = useState<AiToolCategory | "all">("all");
  const tools = useMemo(
    () =>
      category === "all"
        ? AI_TOOLS
        : AI_TOOLS.filter((item) => item.category === category),
    [category],
  );

  return (
    <div className="joy-ai-tools">
      <div className="joy-ai-tools-inner">
        <header className="joy-ai-tools-toolbar">
          <div className="joy-ai-tools-tabs" role="tablist" aria-label="工具分类">
            <button
              type="button"
              role="tab"
              aria-selected={category === "all"}
              className={category === "all" ? "is-active" : undefined}
              onClick={() => setCategory("all")}
            >
              全部
            </button>
            {AI_TOOL_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={category === item.id}
                className={category === item.id ? "is-active" : undefined}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="joy-ai-tools-toolbar-hint">
            一个工具一种能力 · 结果写入资产库
          </p>
        </header>

        <div className="joy-ai-tools-grid">
          {tools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: AiToolDef }) {
  const disabled = tool.status === "coming_soon";
  const covers = tool.covers?.filter(Boolean) ?? [];
  const [back, mid, face] = [
    covers[0],
    covers[1] ?? covers[0],
    covers[2] ?? covers[1] ?? covers[0],
  ];
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
              <img className="joy-ai-tool-stack-layer is-back" src={back} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="joy-ai-tool-stack-layer is-mid" src={mid} alt="" />
              <div className="joy-ai-tool-stack-face is-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={face} alt="" />
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
      <div className="joy-ai-tool-card is-disabled" aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link href={`/tools/${tool.slug}`} className="joy-ai-tool-card">
      {body}
    </Link>
  );
}
