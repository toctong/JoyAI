"use client";

import { CanvasIconFolderPlus } from "./icons/canvas-icons";
import { ProjectCover } from "./project-cover";
import { cn } from "@/shared/lib/utils";
import "./folder-art.css";

type Props = {
  covers: string[];
};

const LAYERS = ["a", "b", "c", "d", "e", "f"] as const;

/** Folder preview: irregular overlapping poster stack. */
export function FolderArt({ covers }: Props) {
  const slots = covers.filter(Boolean).slice(0, LAYERS.length);
  const empty = slots.length === 0;
  const count = empty ? 3 : slots.length;

  return (
    <div
      className={cn(
        "joy-folder",
        empty && "is-empty",
        `is-n${count}`,
      )}
    >
      <div className="joy-folder__stack" aria-hidden>
        {empty
          ? LAYERS.slice(0, 3).map((layer) => (
              <span
                key={layer}
                className={cn("joy-folder__card", `is-${layer}`)}
              >
                <span className="joy-folder__tape" />
                <span className="joy-folder__sheet is-empty" />
              </span>
            ))
          : slots.map((url, index) => (
              <span
                key={`${url}-${index}`}
                className={cn("joy-folder__card", `is-${LAYERS[index]}`)}
              >
                <span className="joy-folder__tape" />
                <ProjectCover
                  url={url}
                  className="joy-folder__sheet"
                  emptyClassName="joy-folder__sheet is-empty"
                  showVideoMark={false}
                />
              </span>
            ))}
      </div>

      {empty ? (
        <div className="joy-folder__mark" aria-hidden>
          <CanvasIconFolderPlus />
        </div>
      ) : null}
    </div>
  );
}
