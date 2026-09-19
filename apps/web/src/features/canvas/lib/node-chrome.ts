import { cn } from "@/shared/lib/utils";
import { resolveMediaTitle } from "./node-title";

/** Shared selection / mention-highlight / focus-pulse ring for canvas nodes. */
export function nodeChromeClass(opts: {
  selected: boolean;
  highlighted?: boolean;
  pulsing?: boolean;
  /** Media frame: no card fill when content exists. */
  framed?: boolean;
}) {
  return cn(
    opts.framed
      ? "border border-transparent bg-transparent shadow-none"
      : "border border-zinc-300 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.1)] dark:border-border dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
    opts.selected && "border-primary ring-2 ring-primary/45",
    !opts.selected &&
      opts.highlighted &&
      "border-amber-400/80 ring-2 ring-amber-400/35",
    opts.pulsing && "animate-pulse ring-2 ring-sky-400/50",
  );
}

export function nodeTitleLabel(type: string, data: Record<string, unknown>) {
  if (type === "text") {
    const custom = String(data.title ?? "").trim();
    if (custom) return custom;
    const text = String(data.text ?? "").trim();
    return text ? text.slice(0, 24) : "文本";
  }
  if (type === "prompt") {
    const custom = String(data.title ?? "").trim();
    if (custom) return custom;
    const prompt = String(data.prompt ?? "").trim();
    return prompt ? prompt.slice(0, 24) : "提示词";
  }
  if (
    type === "image" ||
    type === "video" ||
    type === "panorama" ||
    type === "audio"
  ) {
    const fallback =
      type === "image"
        ? "图像"
        : type === "video"
          ? "视频"
          : type === "panorama"
            ? "全景"
            : "音频";
    return resolveMediaTitle(data, { fallback });
  }
  if (type === "director") {
    const custom = String(data.title ?? "").trim();
    return custom || "导演台";
  }
  return String(data.title ?? "").trim() || type;
}
