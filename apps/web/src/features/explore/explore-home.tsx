"use client";

import { useRouter } from "next/navigation";
import { Compass, Sparkles } from "lucide-react";
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

        <div className="joy-explore-empty">
          <Compass className="joy-explore-empty-icon" aria-hidden />
          <h2 className="joy-explore-empty-title">灵感广场即将上线</h2>
          <p className="joy-explore-empty-desc">
            社区精选作品会在这里展示。你可以先去创作页生成自己的作品。
          </p>
          <button
            type="button"
            className="joy-explore-empty-cta"
            onClick={() => router.push("/studio")}
          >
            <Sparkles className="h-4 w-4" />
            去创作
          </button>
        </div>
      </div>
    </div>
  );
}
