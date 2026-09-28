"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  AI_TOOLS,
  getAiTool,
  type AiToolDef,
} from "@/features/ai-tools/tool-catalog";
import { AiToolCard } from "@/features/ai-tools/ai-tool-card";
import "@/features/ai-tools/ai-tools.css";
import "./inspire-tool-spotlight.css";

/** Featured tools under inspire carousel (matches reference cards). */
const SPOTLIGHT_SLUGS = [
  "motion-mimic",
  "image-reverse",
  "character-sheet",
  "lineart",
] as const;

const PREVIEW_COUNT = 6;
const EXPANDED_COUNT = 12;

export function InspireToolSpotlight() {
  const [expanded, setExpanded] = useState(false);

  const spotlight = useMemo(() => {
    const primary = SPOTLIGHT_SLUGS.map((slug) => getAiTool(slug)).filter(
      (t): t is AiToolDef => Boolean(t),
    );
    const rest = AI_TOOLS.filter(
      (t) =>
        t.status === "available" &&
        !SPOTLIGHT_SLUGS.includes(t.slug as (typeof SPOTLIGHT_SLUGS)[number]),
    );
    return [...primary, ...rest];
  }, []);

  const visible = expanded
    ? spotlight.slice(0, EXPANDED_COUNT)
    : spotlight.slice(0, PREVIEW_COUNT);
  const canExpand = spotlight.length > PREVIEW_COUNT;

  return (
    <section className="joy-inspire-tools" aria-label="精选工具">
      <div className="joy-inspire-tools-grid">
        {visible.map((tool, index) => (
          <AiToolCard
            key={tool.slug}
            tool={tool}
            priority={index < PREVIEW_COUNT}
          />
        ))}
      </div>

      <div className="joy-inspire-tools-more">
        {canExpand ? (
          <button
            type="button"
            className={cn(
              "joy-inspire-tools-more-btn",
              expanded && "is-expanded",
            )}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span>{expanded ? "收起" : "查看更多"}</span>
            <ChevronDown className="joy-inspire-tools-more-icon" />
          </button>
        ) : null}
        <Link href="/tools" className="joy-inspire-tools-all">
          全部工具
        </Link>
      </div>
    </section>
  );
}
