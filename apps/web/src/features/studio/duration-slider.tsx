"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/shared/lib/utils";

function snapToOption(raw: number, options: number[]) {
  let best = options[0]!;
  let bestDist = Math.abs(raw - best);
  for (const o of options) {
    const d = Math.abs(raw - o);
    if (d < bestDist) {
      best = o;
      bestDist = d;
    }
  }
  return best;
}

/** Even scale labels under the track (marketplace style). */
function scaleLabels(options: number[]): number[] {
  if (options.length <= 8) return options;
  const min = options[0]!;
  const max = options[options.length - 1]!;
  const span = max - min;
  const rough = span / 6;
  const nice = [1, 2, 5, 10, 15, 20, 30].find((s) => s >= rough) ?? Math.ceil(rough);
  const out: number[] = [min];
  for (let v = Math.ceil(min / nice) * nice; v < max; v += nice) {
    if (v > min && options.includes(v)) out.push(v);
  }
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

type Props = {
  options: number[];
  value: number;
  onChange: (next: number) => void;
  className?: string;
};

export function DurationSlider({ options, value, onChange, className }: Props) {
  if (options.length === 0) return null;
  const min = options[0]!;
  const max = options[options.length - 1]!;
  const labels = scaleLabels(options);
  const pct = (sec: number) =>
    max === min ? 0 : ((sec - min) / (max - min)) * 100;

  return (
    <div className={cn("joy-duration-slider", className)}>
      <div className="joy-duration-slider-rail">
        <SliderPrimitive.Root
          className="joy-duration-slider-root"
          min={min}
          max={max}
          step={1}
          value={[value]}
          onValueChange={([raw]) => {
            onChange(snapToOption(raw ?? value, options));
          }}
          aria-label="视频时长"
        >
          <SliderPrimitive.Track className="joy-duration-slider-track">
            <SliderPrimitive.Range className="joy-duration-slider-range" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="joy-duration-slider-thumb" />
        </SliderPrimitive.Root>
        <div className="joy-duration-slider-ticks" aria-hidden>
          {options.map((sec) => (
            <span
              key={sec}
              className="joy-duration-slider-tick"
              style={{ left: `${pct(sec)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="joy-duration-slider-labels" aria-hidden>
        {labels.map((sec) => (
          <span
            key={sec}
            className="joy-duration-slider-label"
            style={{ left: `${pct(sec)}%` }}
          >
            {sec}
          </span>
        ))}
      </div>
    </div>
  );
}
