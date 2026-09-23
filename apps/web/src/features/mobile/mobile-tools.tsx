"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Empty } from "antd-mobile";
import {
  AI_TOOL_CATEGORIES,
  AI_TOOLS,
  type AiToolCategory,
  type AiToolDef,
} from "@/features/ai-tools";
import { cn } from "@/shared/lib/utils";

export function MobileToolsPage() {
  const [category, setCategory] = useState<AiToolCategory | "all">("all");

  const tools = useMemo(() => {
    const list =
      category === "all"
        ? AI_TOOLS
        : AI_TOOLS.filter((item) => item.category === category);
    return [...list].sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "available" ? -1 : 1;
    });
  }, [category]);

  return (
    <div className="joy-m-tools">
      <div className="joy-m-explore-chips" role="tablist" aria-label="分类">
        <button
          type="button"
          role="tab"
          aria-selected={category === "all"}
          className={cn("joy-m-explore-chip", category === "all" && "is-active")}
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
            className={cn(
              "joy-m-explore-chip",
              category === item.id && "is-active",
            )}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tools.length === 0 ? (
        <Empty description="暂无工具" />
      ) : (
        <div className="joy-m-tools-grid">
          {tools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool }: { tool: AiToolDef }) {
  const disabled = tool.status === "coming_soon";
  const cover =
    tool.covers?.filter(Boolean).at(-1) ??
    tool.covers?.[0] ??
    null;

  const body = (
    <>
      <span
        className="joy-m-tools-card-preview"
        style={{ ["--tool-accent" as string]: tool.accent }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" draggable={false} />
        ) : (
          <span className="joy-m-tools-card-ph" />
        )}
        {tool.badge === "new" && !disabled ? (
          <span className="joy-m-tools-card-badge is-new">NEW</span>
        ) : null}
        {disabled ? (
          <span className="joy-m-tools-card-badge is-soon">即将上线</span>
        ) : null}
      </span>
      <span className="joy-m-tools-card-copy">
        <span className="joy-m-tools-card-name">{tool.name}</span>
        <span className="joy-m-tools-card-desc">{tool.description}</span>
      </span>
    </>
  );

  if (disabled) {
    return (
      <div className="joy-m-tools-card is-disabled" aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link href={`/m/tools/${tool.slug}`} className="joy-m-tools-card">
      {body}
    </Link>
  );
}
