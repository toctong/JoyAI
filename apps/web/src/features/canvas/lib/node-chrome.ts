import { cn } from "@/shared/lib/utils";

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
      ? "border-transparent bg-transparent shadow-none"
      : "border-border bg-card shadow-none",
    opts.selected && "border-primary ring-2 ring-primary/45",
    !opts.selected &&
      opts.highlighted &&
      "border-amber-400/80 ring-2 ring-amber-400/35",
    !opts.selected && !opts.highlighted && !opts.framed && "border-border",
    opts.pulsing && "animate-pulse ring-2 ring-sky-400/50",
  );
}

export function nodeTitleLabel(type: string, data: Record<string, unknown>) {
  const custom = String(data.title ?? "").trim();
  if (custom) return custom;
  if (type === "text") {
    const text = String(data.text ?? "").trim();
    return text ? text.slice(0, 24) : "文本";
  }
  if (type === "prompt") {
    const prompt = String(data.prompt ?? "").trim();
    return prompt ? prompt.slice(0, 24) : "提示词";
  }
  if (type === "image") return "图像";
  if (type === "video") return "视频";
  if (type === "panorama") return "全景";
  if (type === "audio") return "音频";
  if (type === "director") return "导演台";
  return type;
}
