import type { ModelCapabilities, ModelPricing } from "./model-meta";

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}

function y(n: number): string {
  return `¥${trimNum(n)}`;
}

/** Single-line summary (tooltips / compact). Prefer formatModelPriceLines in UI. */
export function formatModelPrice(pricing?: ModelPricing | null): string {
  const lines = formatModelPriceLines(pricing);
  if (!lines.length) return "—";
  if (lines.length === 1) return lines[0]!;
  return `${lines[0]} 等${lines.length}档`;
}

/** All price tiers as separate lines for list / detail. */
export function formatModelPriceLines(pricing?: ModelPricing | null): string[] {
  if (!pricing) return [];

  if (pricing.tiers?.length) {
    return pricing.tiers.map((t) => {
      const tag = t.resolution ?? t.label;
      if (t.perSecond != null) return `${y(t.perSecond)}/秒 · ${tag}`;
      if (t.perImage != null) return `${y(t.perImage)}/张 · ${tag}`;
      if (t.perVideo != null) return `${y(t.perVideo)}/条 · ${tag}`;
      return tag;
    });
  }

  switch (pricing.billing) {
    case "token": {
      const parts = [
        pricing.inputPer1M != null ? `${y(pricing.inputPer1M)}/1M入` : null,
        pricing.outputPer1M != null ? `${y(pricing.outputPer1M)}/1M出` : null,
      ].filter(Boolean) as string[];
      return parts.length ? [parts.join(" · ")] : [];
    }
    case "per_image":
      return pricing.perImage != null ? [`${y(pricing.perImage)}/张`] : [];
    case "per_second":
      return pricing.perSecond != null ? [`${y(pricing.perSecond)}/秒`] : [];
    case "per_video":
      return pricing.perVideo != null ? [`${y(pricing.perVideo)}/条`] : [];
    case "tiered": {
      if (pricing.perImage != null) return [`${y(pricing.perImage)}/张起`];
      if (pricing.perSecond != null) return [`${y(pricing.perSecond)}/秒起`];
      if (pricing.perVideo != null) return [`${y(pricing.perVideo)}/条起`];
      return ["分档计价"];
    }
    default:
      return [];
  }
}

export function formatCapabilities(
  caps?: ModelCapabilities | null,
): { input: string; output: string; features: string[] } {
  if (!caps) return { input: "—", output: "—", features: [] };
  const map: Record<string, string> = {
    text: "文",
    image: "图",
    video: "视",
    audio: "音",
  };
  return {
    input: (caps.input ?? []).map((m) => map[m] ?? m).join("/") || "—",
    output: (caps.output ?? []).map((m) => map[m] ?? m).join("/") || "—",
    features: caps.features ?? [],
  };
}

/** Structured capability chips for admin list / detail. */
export function formatCapabilityDetails(
  caps?: ModelCapabilities | null,
): string[] {
  if (!caps) return [];
  const lines: string[] = [];
  const { input, output } = formatCapabilities(caps);
  lines.push(`${input}→${output}`);

  const refs: string[] = [];
  if (caps.maxRefImages != null && caps.maxRefImages > 0) {
    refs.push(`图×${caps.maxRefImages}`);
  }
  if (caps.maxRefVideos != null && caps.maxRefVideos > 0) {
    refs.push(`视×${caps.maxRefVideos}`);
  }
  if (caps.maxRefAudios != null && caps.maxRefAudios > 0) {
    refs.push(`音×${caps.maxRefAudios}`);
  }
  if (refs.length) lines.push(`参考 ${refs.join(" · ")}`);

  if (caps.maxDurationSec != null) lines.push(`最长 ${caps.maxDurationSec}s`);

  if (caps.resolutions?.length) {
    lines.push(`分辨率 ${caps.resolutions.join(" / ")}`);
  }
  if (caps.sizes?.length) {
    lines.push(`尺寸 ${caps.sizes.join(" / ")}`);
  }
  if (caps.ratios?.length) {
    lines.push(`比例 ${caps.ratios.join(" / ")}`);
  }

  return lines;
}
