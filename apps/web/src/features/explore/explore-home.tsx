"use client";

import { useRouter } from "next/navigation";
import { INSPIRATION_DEMO } from "@/shared/brand/joyai-brand";
import { InspirationMasonry } from "@/features/inspire/inspiration-masonry";
import "./explore-home.css";

export function ExploreHome() {
  const router = useRouter();

  return (
    <div className="joy-explore">
      <div className="joy-explore-inner">
        <header className="joy-explore-header">
          <h1 className="joy-explore-title">探索</h1>
          <p className="joy-explore-desc">发现灵感作品，一键做同款。</p>
        </header>
        <InspirationMasonry
          items={INSPIRATION_DEMO}
          onRemix={(prompt) =>
            router.push(`/studio?prompt=${encodeURIComponent(prompt)}`)
          }
        />
      </div>
    </div>
  );
}
