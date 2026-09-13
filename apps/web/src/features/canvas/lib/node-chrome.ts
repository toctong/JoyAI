import { cn } from "@/shared/lib/utils";

/** Shared selection / mention-highlight / focus-pulse ring for canvas nodes. */
export function nodeChromeClass(opts: {
  selected: boolean;
  highlighted?: boolean;
  pulsing?: boolean;
}) {
  return cn(
    opts.selected && "border-primary ring-1 ring-primary/40",
    !opts.selected && opts.highlighted && "border-amber-400/80 ring-2 ring-amber-400/35",
    !opts.selected && !opts.highlighted && "border-border",
    opts.pulsing && "animate-pulse ring-2 ring-sky-400/50",
  );
}
