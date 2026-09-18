"use client";

import {
  CanvasIconFolderPlus,
} from "./icons/canvas-icons";
import { useId } from "react";
import { cn } from "@/shared/lib/utils";
import "./folder-art.css";

type Props = {
  covers: string[];
};

/** Jimeng-like folder preview: plate + fanned cards + frosted flap */
export function FolderArt({ covers }: Props) {
  const uid = useId().replace(/:/g, "");
  const plateId = `folder-plate-${uid}`;
  const slots = covers.slice(0, 3);
  const empty = slots.length === 0;
  const layers = empty ? [null, null, null] : padCovers(slots);

  return (
    <div className={cn("joy-folder", empty && "is-empty")}>
      <svg
        className="joy-folder__plate"
        viewBox="0 0 273 217"
        fill="none"
        aria-hidden
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id={plateId}
            x1="136.5"
            y1="0"
            x2="136.5"
            y2="217"
            gradientUnits="userSpaceOnUse"
          >
            <stop className="joy-folder__plate-a" stopColor="#262626" />
            <stop
              className="joy-folder__plate-b"
              offset="1"
              stopColor="#171717"
            />
          </linearGradient>
        </defs>
        <rect
          x="0.5"
          y="0.5"
          width="272"
          height="216"
          rx="15.5"
          fill={`url(#${plateId})`}
          stroke="#fff"
          strokeOpacity="0.1"
        />
      </svg>

      <div className="joy-folder__fan" aria-hidden>
        {layers.map((url, i) => {
          const pos = i === 0 ? "l" : i === 1 ? "c" : "r";
          if (url) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                className={cn("joy-folder__sheet", `is-${pos}`)}
                draggable={false}
              />
            );
          }
          return (
            <div
              key={`blank-${i}`}
              className={cn("joy-folder__sheet", "is-blank", `is-${pos}`)}
            />
          );
        })}
      </div>

      <div className="joy-folder__flap" aria-hidden>
        <svg
          className="joy-folder__flap-shape"
          viewBox="0 0 200 120"
          preserveAspectRatio="none"
        >
          <path
            d="M14 34
               C14 24 22 18 34 18
               H78
               C88 18 94 24 98 32
               L108 46
               H186
               C194 46 200 52 200 60
               V108
               C200 116 194 120 186 120
               H14
               C6 120 0 116 0 108
               V48
               C0 40 6 34 14 34
               Z"
          />
        </svg>
      </div>

      {empty ? (
        <div className="joy-folder__mark" aria-hidden>
          <CanvasIconFolderPlus />
        </div>
      ) : null}
    </div>
  );
}

function padCovers(slots: string[]) {
  if (slots.length >= 3) return slots.slice(0, 3);
  if (slots.length === 2) return [slots[0], slots[1], slots[0]];
  return [null, slots[0], null] as (string | null)[];
}
