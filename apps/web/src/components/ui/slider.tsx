"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/shared/lib/utils";

type SliderProps = React.ComponentPropsWithoutRef<
  typeof SliderPrimitive.Root
> & {
  /** High-contrast track/thumb for dark chrome (studio toolbars, etc.). */
  tone?: "default" | "onDark";
};

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, tone = "default", ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        "relative h-1.5 w-full grow overflow-hidden rounded-full",
        tone === "onDark" ? "bg-white/20" : "bg-muted",
      )}
    >
      <SliderPrimitive.Range
        className={cn(
          "absolute h-full",
          tone === "onDark" ? "bg-[hsl(199_90%_52%)]" : "bg-foreground",
        )}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block rounded-full shadow-sm ring-offset-background transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        tone === "onDark"
          ? "size-3.5 border border-white/35 bg-white"
          : "size-4 border border-foreground/20 bg-background",
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
