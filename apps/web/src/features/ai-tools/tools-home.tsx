"use client";

import { useMemo, useState } from "react";
import {
  AI_TOOL_CATEGORIES,
  AI_TOOLS,
  type AiToolCategory,
} from "./tool-catalog";
import { AiToolCard } from "./ai-tool-card";
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
        </header>

        <div className="joy-ai-tools-grid">
          {tools.map((tool, index) => (
            <AiToolCard key={tool.slug} tool={tool} priority={index < 6} />
          ))}
        </div>
      </div>
    </div>
  );
}
