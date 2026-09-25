"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DotLoading, Empty, Image } from "antd-mobile";
import {
  ChevronRight,
  Plus,
} from "lucide-react";
import { assetListImageUrl, tosVideoPosterUrl } from "@joyai/shared";
import { AI_TOOLS } from "@/features/ai-tools";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { api, isApiCancelError } from "@/shared/lib/api";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import { toast } from "@/shared/lib/toast";
import type { ExploreFeedItem, ExploreFeedResult } from "@/features/explore/types";

type Asset = { id: string; url: string; kind?: string };
type Job = {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  finishedAt?: string | null;
  input?: {
    prompt?: string;
    toolSlug?: string;
    canvasProjectId?: string;
    manjuProjectId?: string;
  };
  assets?: Asset[];
  canvasProjectId?: string | null;
};
type JobsPage = { items: Job[]; hasMore: boolean };

function toolCover(covers?: string[]) {
  const list = covers?.filter(Boolean) ?? [];
  const path = list.at(-1) ?? list[0] ?? null;
  return path ? staticAssetUrl(path) : null;
}
function isStudioFeedJob(job: Job) {
  if (job.canvasProjectId) return false;
  if (job.input?.canvasProjectId) return false;
  if (job.input?.manjuProjectId) return false;
  if (job.input?.toolSlug) return false;
  return job.kind === "image" || job.kind === "video";
}

function jobThumb(job: Job): string | null {
  const asset = job.assets?.[0];
  if (!asset?.url) return null;
  if (asset.kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(asset.url)) {
    return tosVideoPosterUrl(asset.url) || asset.url;
  }
  return assetListImageUrl({ url: asset.url, size: "sm" }) || asset.url;
}

function shortPrompt(job: Job) {
  const t = job.input?.prompt?.trim() || (job.kind === "video" ? "视频" : "图片");
  return t.length > 8 ? `${t.slice(0, 8)}…` : t;
}

function coverUrl(item: ExploreFeedItem): string {
  if (item.type === "video") {
    const thumb = item.thumbnailUrl?.trim() || "";
    const media = item.mediaUrl?.trim() || "";
    if (thumb && thumb !== media && !/\.(mp4|webm|mov)(\?|#|$)/i.test(thumb)) {
      return thumb;
    }
    return thumb || media;
  }
  return item.thumbnailUrl || item.mediaUrl || "";
}

export function MobileInspirePage() {
  const router = useRouter();

  const jobsQuery = useQuery({
    queryKey: ["m-inspire", "recent-jobs"],
    staleTime: 60 * 1000,
    queryFn: () => api<JobsPage>("/jobs?take=12&scope=studio"),
  });

  const feedQuery = useQuery({
    queryKey: ["m-inspire", "banner-feed"],
    staleTime: 10 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ limit: "6", featuredOnly: "true" });
      return api<ExploreFeedResult>(`/explore/feed?${qs}`, { signal });
    },
  });

  useEffect(() => {
    const err = jobsQuery.error || feedQuery.error;
    if (!err) return;
    if (isApiCancelError(err)) return;
    toast.error(err instanceof Error ? err.message : "加载失败");
  }, [jobsQuery.error, feedQuery.error]);

  const recentJobs = useMemo(
    () => (jobsQuery.data?.items ?? []).filter(isStudioFeedJob).slice(0, 10),
    [jobsQuery.data],
  );

  const bannerItem = feedQuery.data?.items?.[0];
  const bannerSrc = bannerItem ? coverUrl(bannerItem) : JOYAI_BRAND.heroBg;

  const hotTools = useMemo(
    () => AI_TOOLS.filter((t) => t.status === "available").slice(0, 8),
    [],
  );

  return (
    <div className="joy-m-home">
      {/* Banner */}
      <section className="joy-m-home-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bannerSrc}
          alt=""
          className="joy-m-home-banner-img"
          draggable={false}
        />
        <div className="joy-m-home-banner-shade" aria-hidden />
        <div className="joy-m-home-banner-glow" aria-hidden />
        <div className="joy-m-home-banner-copy">
          <div className="joy-m-home-banner-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={JOYAI_BRAND.logo} alt="" draggable={false} />
            <span>FrameRally</span>
          </div>
          <h2 className="joy-m-home-banner-title">AI 创作全面升级</h2>
          <div className="joy-m-home-banner-tags" aria-label="能力">
            <span>生图</span>
            <span>生视频</span>
            <span>一键同款</span>
          </div>
          <Link href="/m/studio" className="joy-m-home-banner-cta">
            立即创作
            <ChevronRight className="size-3.5" strokeWidth={2.4} />
          </Link>
        </div>
      </section>

      {/* Dual CTA */}
      <section className="joy-m-home-ctas">
        <Link href="/m/studio" className="joy-m-home-cta is-primary">
          <span className="joy-m-home-cta-ico is-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={JOYAI_BRAND.nav.studio} alt="" draggable={false} />
          </span>
          <span className="joy-m-home-cta-label">开始创作</span>
        </Link>
        <Link href="/m/explore" className="joy-m-home-cta is-secondary">
          <span className="joy-m-home-cta-ico is-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/video-gen.svg" alt="" draggable={false} />
          </span>
          <span className="joy-m-home-cta-label">探索同款</span>
        </Link>
      </section>

      {/* Recent */}
      <section className="joy-m-home-section">
        <div className="joy-m-home-section-head">
          <h3 className="joy-m-home-section-title">最近创作</h3>
          <Link href="/m/studio" className="joy-m-home-section-more">
            全部
            <ChevronRight className="size-3.5" strokeWidth={2.2} />
          </Link>
        </div>
        {jobsQuery.isPending ? (
          <div className="joy-m-home-recent-loading">
            <DotLoading color="primary" />
          </div>
        ) : recentJobs.length === 0 ? (
          <button
            type="button"
            className="joy-m-home-recent-empty"
            onClick={() => router.push("/m/studio")}
          >
            <Plus className="size-5" strokeWidth={2} />
            还没有作品，去创作第一张
          </button>
        ) : (
          <div className="joy-m-home-recent">
            {recentJobs.map((job) => {
              const thumb = jobThumb(job);
              return (
                <button
                  key={job.id}
                  type="button"
                  className="joy-m-home-recent-item"
                  onClick={() => router.push("/m/studio")}
                >
                  <span className="joy-m-home-recent-thumb">
                    {thumb ? (
                      <Image src={thumb} fit="cover" alt="" lazy />
                    ) : (
                      <span className="joy-m-home-recent-ph" />
                    )}
                    <span className="joy-m-home-recent-cap">
                      {shortPrompt(job)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Hot tools */}
      <section className="joy-m-home-section">
        <div className="joy-m-home-section-head">
          <h3 className="joy-m-home-section-title">热门工具</h3>
          <Link href="/m/tools" className="joy-m-home-section-more">
            全部
            <ChevronRight className="size-3.5" strokeWidth={2.2} />
          </Link>
        </div>
        <div className="joy-m-home-tools">
          {hotTools.map((tool) => {
            const cover = toolCover(tool.covers);
            return (
              <Link
                key={tool.slug}
                href={`/m/tools/${tool.slug}`}
                className="joy-m-home-tool"
              >
                <span
                  className="joy-m-home-tool-ico"
                  style={
                    cover
                      ? undefined
                      : { background: `color-mix(in oklab, ${tool.accent} 35%, var(--muted))` }
                  }
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" draggable={false} />
                  ) : null}
                </span>
                {tool.badge === "new" ? (
                  <span className="joy-m-home-tool-badge">NEW</span>
                ) : null}
                <span className="joy-m-home-tool-name">{tool.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured strip */}
      {bannerItem ? (
        <section className="joy-m-home-section">
          <div className="joy-m-home-section-head">
            <h3 className="joy-m-home-section-title">开启你的专属灵感</h3>
            <Link href="/m/explore" className="joy-m-home-section-more">
              更多
              <ChevronRight className="size-3.5" strokeWidth={2.2} />
            </Link>
          </div>
          <div className="joy-m-home-featured">
            {(feedQuery.data?.items ?? []).slice(0, 4).map((item) => {
              const src = coverUrl(item);
              return (
                <Link
                  key={item.id}
                  href="/m/explore"
                  className="joy-m-home-featured-card"
                >
                  {src ? (
                    <Image src={src} fit="cover" alt="" lazy />
                  ) : (
                    <span className="joy-m-home-featured-ph" />
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ) : feedQuery.isPending ? null : (
        <div className="joy-m-home-section">
          <Empty description="暂无精选灵感" />
        </div>
      )}
    </div>
  );
}
