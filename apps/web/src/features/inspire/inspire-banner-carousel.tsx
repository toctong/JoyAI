"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCreative } from "swiper/modules";
import type { Swiper as SwiperInstance } from "swiper";
import { api, isApiCancelError } from "@/shared/lib/api";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import { cn } from "@/shared/lib/utils";
import { releaseHtmlMedia } from "@/shared/lib/release-media";
import "swiper/css";
import "swiper/css/effect-creative";
import "./inspire-banner-carousel.css";

export type InspireBannerItem = {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string;
  coverKind: "image" | "video";
  posterUrl?: string | null;
  ctaLabel: string | null;
  href: string | null;
  sortOrder: number;
};

type SlideItem = InspireBannerItem & { _key: string };

function resolveUrl(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return staticAssetUrl(u.startsWith("/") ? u : `/${u}`);
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function syncVideos(swiper: SwiperInstance) {
  for (const slide of swiper.slides) {
    const video = slide.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) continue;
    if (slide.classList.contains("swiper-slide-active")) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }
}

/**
 * Keep active index in the middle copy of the 5× strip so drag always has
 * runway both ways (button clicks already snap; drag must too).
 */
function snapToMiddleBand(swiper: SwiperInstance, count: number) {
  if (count < 2) return;
  const i = swiper.activeIndex;
  const target = (i % count) + count * 2;
  if (i !== target) {
    swiper.slideTo(target, 0, false);
  }
}

function BannerCard({ item }: { item: InspireBannerItem }) {
  const cover = resolveUrl(item.coverUrl);
  const poster = item.posterUrl ? resolveUrl(item.posterUrl) : "";
  const href = item.href?.trim() || "";
  const cta = item.ctaLabel?.trim() || "了解更多";
  const isVideo = item.coverKind === "video";

  const body = (
    <>
      <div className="joy-inspire-carousel__media" aria-hidden>
        {isVideo ? (
          <>
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={poster}
                alt=""
                className="joy-inspire-carousel__cover"
                draggable={false}
                decoding="async"
              />
            ) : null}
            <video
              src={cover}
              poster={poster || undefined}
              muted
              loop
              playsInline
              preload="metadata"
              className="joy-inspire-carousel__cover joy-inspire-carousel__video"
            />
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="joy-inspire-carousel__cover"
            draggable={false}
            decoding="async"
          />
        )}
        <div className="joy-inspire-carousel__veil" />
        <div className="joy-inspire-carousel__dim" />
      </div>
      <div className="joy-inspire-carousel__copy">
        <h2>{item.title}</h2>
        {item.subtitle ? <p>{item.subtitle}</p> : null}
        {href ? (
          <span className="joy-inspire-carousel__cta">
            <Play className="size-3.5 fill-current" aria-hidden />
            {cta}
          </span>
        ) : null}
      </div>
    </>
  );

  if (!href) {
    return <div className="joy-inspire-carousel__card">{body}</div>;
  }

  if (isExternalHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="joy-inspire-carousel__card"
      >
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className="joy-inspire-carousel__card">
      {body}
    </Link>
  );
}

type SwiperPaneProps = {
  items: InspireBannerItem[];
  slides: SlideItem[];
  initialSlide: number;
  multi: boolean;
  countRef: MutableRefObject<number>;
  swiperRef: MutableRefObject<SwiperInstance | null>;
  onActiveChange: (index: number) => void;
};

const BannerSwiperPane = memo(function BannerSwiperPane({
  items,
  slides,
  initialSlide,
  multi,
  countRef,
  swiperRef,
  onActiveChange,
}: SwiperPaneProps) {
  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;

  return (
    <Swiper
      className="joy-inspire-carousel__swiper"
      modules={[EffectCreative, Autoplay]}
      effect="creative"
      grabCursor
      centeredSlides
      slidesPerView="auto"
      spaceBetween={0}
      speed={480}
      initialSlide={initialSlide}
      loop={false}
      rewind={false}
      slideToClickedSlide={false}
      watchSlidesProgress
      resistanceRatio={0.7}
      creativeEffect={{
        /*
         * limitProgress 2 keeps the next-in-line slide already transformed
         * off-stage (clipped), so swipe never pops a blank then补一张图.
         */
        limitProgress: 2,
        perspective: true,
        shadowPerProgress: false,
        prev: {
          translate: ["-76%", 0, -160],
          rotate: [0, 18, 0],
          scale: 0.86,
        },
        next: {
          translate: ["76%", 0, -160],
          rotate: [0, -18, 0],
          scale: 0.86,
        },
      }}
      autoplay={
        multi
          ? {
              delay: 5600,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
            }
          : false
      }
      onSwiper={(swiper) => {
        swiperRef.current = swiper;
        const n = Math.max(items.length, 1);
        onActiveRef.current(swiper.activeIndex % n);
        syncVideos(swiper);
      }}
      onClick={(swiper, event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        // Nav / dots live outside slides
        if (target.closest(".joy-inspire-carousel__nav")) return;
        const slide = target.closest(".swiper-slide");
        if (!slide) return;
        if (slide.classList.contains("swiper-slide-prev")) {
          swiper.slidePrev();
          return;
        }
        if (slide.classList.contains("swiper-slide-next")) {
          swiper.slideNext();
        }
      }}
      onTouchStart={(swiper) => {
        // Drag path never hit button snap — snap before the gesture.
        snapToMiddleBand(swiper, countRef.current);
      }}
      onSliderFirstMove={(swiper) => {
        snapToMiddleBand(swiper, countRef.current);
      }}
      onSlideChangeTransitionStart={(swiper) => {
        const n = countRef.current;
        if (n) onActiveRef.current(swiper.activeIndex % n);
      }}
      onSlideChangeTransitionEnd={(swiper) => {
        snapToMiddleBand(swiper, countRef.current);
        const n = countRef.current;
        if (n) onActiveRef.current(swiper.activeIndex % n);
        // Parent pauses media while scrolled away (`.is-away`).
        if (!swiper.el?.closest(".joy-inspire-carousel.is-away")) {
          syncVideos(swiper);
        }
      }}
      onTransitionEnd={(swiper) => {
        // Catch drag-release snaps that don't fire slideChangeTransitionEnd.
        snapToMiddleBand(swiper, countRef.current);
      }}
    >
      {slides.map((item) => (
        <SwiperSlide key={item._key} className="joy-inspire-carousel__slide">
          <BannerCard item={item} />
        </SwiperSlide>
      ))}
    </Swiper>
  );
});

function stepSlide(
  swiper: SwiperInstance | null,
  count: number,
  dir: -1 | 1,
) {
  if (!swiper || count < 2) return;
  snapToMiddleBand(swiper, count);
  // Double rAF: let the silent band jump paint before animating
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (dir < 0) swiper.slidePrev();
      else swiper.slideNext();
    });
  });
}

function pauseCarouselMedia(swiper: SwiperInstance | null) {
  if (!swiper?.el) return;
  swiper.el.querySelectorAll("video").forEach((node) => {
    if (node instanceof HTMLVideoElement) {
      try {
        node.pause();
      } catch {
        /* ignore */
      }
    }
  });
  try {
    swiper.autoplay?.stop();
  } catch {
    /* ignore */
  }
}

function resumeCarouselMedia(swiper: SwiperInstance | null, multi: boolean) {
  if (!swiper) return;
  syncVideos(swiper);
  if (multi) {
    try {
      swiper.autoplay?.start();
    } catch {
      /* ignore */
    }
  }
}

/** Stacked 3D promo carousel for inspire home. */
export function InspireBannerCarousel() {
  const [items, setItems] = useState<InspireBannerItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const swiperRef = useRef<SwiperInstance | null>(null);
  const countRef = useRef(0);
  const multiRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api<InspireBannerItem[]>("/inspire/banners");
        if (cancelled) return;
        setItems(rows);
        setActive(0);
      } catch (e) {
        if (cancelled || isApiCancelError(e)) return;
        setItems([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      const root = swiperRef.current?.el;
      if (!root) return;
      root.querySelectorAll("video").forEach((node) => {
        if (node instanceof HTMLVideoElement) releaseHtmlMedia(node);
      });
    };
  }, []);

  const multi = items.length > 1;
  countRef.current = items.length;
  multiRef.current = multi;

  /** Pause 3D autoplay + videos while scrolled off the inspire pane. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver !== "function") return;
    const scrollRoot = el.closest(".joy-inspire-inner");
    const io = new IntersectionObserver(
      (entries) => {
        const visible = Boolean(entries[0]?.isIntersecting);
        setInView(visible);
        const swiper = swiperRef.current;
        if (visible) resumeCarouselMedia(swiper, multiRef.current);
        else pauseCarouselMedia(swiper);
      },
      {
        root: scrollRoot instanceof Element ? scrollRoot : null,
        rootMargin: "80px 0px",
        threshold: 0.05,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loaded]);

  const slides = useMemo<SlideItem[]>(() => {
    if (!multi) return items.map((it) => ({ ...it, _key: it.id }));
    return [0, 1, 2, 3, 4].flatMap((band) =>
      items.map((it) => ({ ...it, _key: `${it.id}__${band}` })),
    );
  }, [items, multi]);

  const initialSlide = multi ? items.length * 2 : 0;

  if (!loaded) {
    return (
      <div className="joy-inspire-carousel is-loading" aria-hidden>
        <div className="joy-inspire-carousel__skeleton" />
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <div
      ref={rootRef}
      className={cn("joy-inspire-carousel", !inView && "is-away")}
    >
      <div className="joy-inspire-carousel__stage">
        <BannerSwiperPane
          items={items}
          slides={slides}
          initialSlide={initialSlide}
          multi={multi}
          countRef={countRef}
          swiperRef={swiperRef}
          onActiveChange={setActive}
        />

        {multi ? (
          <>
            {/* Transparent hit strips — 3D transforms make right-side clicks miss the next slide */}
            <button
              type="button"
              className="joy-inspire-carousel__hit is-prev"
              aria-label="上一张"
              onClick={() =>
                stepSlide(swiperRef.current, countRef.current, -1)
              }
            />
            <button
              type="button"
              className="joy-inspire-carousel__hit is-next"
              aria-label="下一张"
              onClick={() =>
                stepSlide(swiperRef.current, countRef.current, 1)
              }
            />
            <button
              type="button"
              className="joy-inspire-carousel__nav is-prev"
              aria-label="上一张"
              onClick={() =>
                stepSlide(swiperRef.current, countRef.current, -1)
              }
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              className="joy-inspire-carousel__nav is-next"
              aria-label="下一张"
              onClick={() =>
                stepSlide(swiperRef.current, countRef.current, 1)
              }
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
      </div>

      {multi ? (
        <div
          className="joy-inspire-carousel__dots"
          role="tablist"
          aria-label="横幅分页"
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`第 ${i + 1} 张`}
              className={cn(
                "joy-inspire-carousel__dot",
                i === active && "is-on",
              )}
              onClick={() => {
                const swiper = swiperRef.current;
                if (!swiper) return;
                swiper.slideTo(i + items.length * 2);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
