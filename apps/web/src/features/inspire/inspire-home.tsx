"use client";

import { InspireBannerCarousel } from "./inspire-banner-carousel";
import { InspireToolSpotlight } from "./inspire-tool-spotlight";
import { InspireRecentProjects } from "./inspire-recent-projects";
import "./inspire-home.css";

/** Inspire home — promo carousel + tools + recent projects. */
export function InspireHome() {
  return (
    <div className="joy-inspire">
      <div className="joy-inspire-inner">
        <header className="joy-inspire-hero">
          <InspireBannerCarousel />
        </header>

        <InspireToolSpotlight />

        <InspireRecentProjects />
      </div>
    </div>
  );
}
