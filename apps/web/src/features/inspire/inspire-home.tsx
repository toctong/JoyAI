"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import "./inspire-home.css";

const CreationComposer = dynamic(
  () =>
    import("@/features/studio/creation-composer").then((m) => m.CreationComposer),
  {
    ssr: false,
    loading: () => (
      <div
        className="joy-home-composer-skeleton"
        aria-hidden
        style={{
          minHeight: 160,
          borderRadius: 24,
          background: "rgba(255,255,255,0.08)",
        }}
      />
    ),
  },
);

export function InspireHome() {
  const router = useRouter();

  return (
    <div className="joy-home h-full">
      <div className="joy-home-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={JOYAI_BRAND.heroBg} alt="" className="joy-home-hero-bg" />
        <div className="joy-home-hero-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={JOYAI_BRAND.mascot}
            alt="JOY"
            className="joy-home-mascot"
          />
          <h1 className="joy-home-title">
            与 <span>JoyAI</span> 一起
            <br />
            开启你的创意世界!
          </h1>

          <div className="joy-home-composer">
            <CreationComposer
              variant="hero"
              onSubmitted={() => router.push("/studio")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
