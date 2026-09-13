"use client";

import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import type { InspirationDemo } from "@/shared/brand/joyai-brand";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import "./inspiration-masonry.css";

type Props = {
  items: InspirationDemo[];
  onRemix: (prompt: string) => void;
};

export function InspirationMasonry({ items, onRemix }: Props) {
  return (
    <PhotoProvider>
      <div className="joy-masonry">
        {items.map((card) => (
          <article
            key={card.id}
            className={cn(
              "joy-masonry-item group",
              card.span === 2 && "is-span-2",
              card.aspect === "tall" && "is-tall",
              card.aspect === "wide" && "is-wide",
              card.aspect === "square" && "is-square",
            )}
          >
            <PhotoView src={card.image}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.image} alt={card.title} className="joy-masonry-img" />
            </PhotoView>
            <div className="joy-masonry-cover">
              <div className="joy-masonry-footer">
                <div className="joy-masonry-author">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={JOYAI_BRAND.remote.avatar}
                    alt=""
                    className="joy-masonry-avatar"
                  />
                  <span>{card.author}</span>
                </div>
                <button
                  type="button"
                  className="joy-masonry-remix"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemix(card.prompt);
                  }}
                >
                  做同款
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </PhotoProvider>
  );
}
