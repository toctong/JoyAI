"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { InspireWorksRoam } from "./inspire-works-roam";
import { InspireWorksCard } from "./inspire-works-card";
import { InspireWorksDetail } from "./inspire-works-detail";
import "./inspire-works.css";

type ShowcaseCategory = {
  code: string;
  name: string;
  sortOrder: number;
};

type ShowcaseWork = {
  id: number;
  title: string;
  description: string;
  coverUrl: string;
  videoUrl: string;
  authorName: string;
  authorAvatar: string;
  likeCount: number;
  isPublic: boolean;
  duration: number;
  createTime: string | null;
};

type ShowcaseWorksResult = {
  items: ShowcaseWork[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const ALL_TAB = { code: "all", name: "全部" } as const;
const PAGE_SIZE = 20;

function mergeWorks(prev: ShowcaseWork[], next: ShowcaseWork[]) {
  if (prev.length === 0) return next;
  const seen = new Set(prev.map((w) => w.id));
  const appended = next.filter((w) => !seen.has(w.id));
  return appended.length === 0 ? prev : [...prev, ...appended];
}

export function InspireWorks() {
  const [categories, setCategories] = useState<ShowcaseCategory[]>([]);
  const [activeCode, setActiveCode] = useState<string>(ALL_TAB.code);
  const [works, setWorks] = useState<ShowcaseWork[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingWorks, setLoadingWorks] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadLockRef = useRef(false);
  const stateRef = useRef<{
    hasMore: boolean;
    loading: boolean;
    loadingMore: boolean;
    page: number;
    activeCode: string;
  }>({
    hasMore: false,
    loading: true,
    loadingMore: false,
    page: 1,
    activeCode: ALL_TAB.code,
  });

  const hasMore = page < totalPages;

  useEffect(() => {
    let cancelled = false;
    setLoadingCats(true);
    void (async () => {
      try {
        const res = await api<{ items: ShowcaseCategory[] }>(
          "/inspire/showcase/categories",
        );
        if (cancelled) return;
        setCategories(Array.isArray(res.items) ? res.items : []);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(async (code: string, pageNum: number) => {
    const qs = new URLSearchParams({
      page: String(pageNum),
      pageSize: String(PAGE_SIZE),
    });
    if (code && code !== ALL_TAB.code) {
      qs.set("categoryCode", code);
    }
    return api<ShowcaseWorksResult>(`/inspire/showcase/works?${qs}`);
  }, []);

  const loadFirst = useCallback(
    async (code: string) => {
      setLoadingWorks(true);
      setError(null);
      setPage(1);
      setTotalPages(1);
      try {
        const res = await fetchPage(code, 1);
        const items = Array.isArray(res.items) ? res.items : [];
        setWorks(items);
        setPage(Number(res.page) || 1);
        setTotalPages(Math.max(1, Number(res.totalPages) || 1));
      } catch (e) {
        setWorks([]);
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoadingWorks(false);
      }
    },
    [fetchPage],
  );

  const loadMore = useCallback(async () => {
    const s = stateRef.current;
    if (!s.hasMore || s.loading || s.loadingMore || loadLockRef.current) {
      return;
    }
    loadLockRef.current = true;
    setLoadingMore(true);
    const nextPage = s.page + 1;
    const code = s.activeCode;
    try {
      const res = await fetchPage(code, nextPage);
      const items = Array.isArray(res.items) ? res.items : [];
      setWorks((prev) => mergeWorks(prev, items));
      setPage(Number(res.page) || nextPage);
      setTotalPages(Math.max(1, Number(res.totalPages) || 1));
    } catch {
      /* keep list; user can scroll again */
    } finally {
      setLoadingMore(false);
      loadLockRef.current = false;
    }
  }, [fetchPage]);

  useEffect(() => {
    void loadFirst(activeCode);
  }, [activeCode, loadFirst]);

  stateRef.current = {
    hasMore,
    loading: loadingWorks,
    loadingMore,
    page,
    activeCode,
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loadingWorks || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { root: null, rootMargin: "320px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadingWorks, hasMore, loadMore, works.length]);

  const tabs = [ALL_TAB, ...categories];
  const roamWorks = works.filter((w) => Boolean(w.videoUrl));

  return (
    <section className="joy-inspire-works" aria-label="作品">
      <div className="joy-inspire-works-head">
        <h2 className="joy-inspire-works-title">作品</h2>
        <div
          className="joy-inspire-works-tabs"
          role="tablist"
          aria-label="作品分类"
        >
          {loadingCats
            ? Array.from({ length: 5 }, (_, i) => (
                <span key={i} className="joy-inspire-works-tab-skel" />
              ))
            : tabs.map((tab) => {
                const on = activeCode === tab.code;
                return (
                  <button
                    key={tab.code}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className={cn(
                      "joy-inspire-works-tab",
                      on && "is-on",
                    )}
                    onClick={() => setActiveCode(tab.code)}
                  >
                    {tab.name}
                  </button>
                );
              })}
        </div>
      </div>

      {error ? (
        <div className="joy-inspire-works-empty">
          <p>{error}</p>
          <button
            type="button"
            className="joy-inspire-works-retry"
            onClick={() => void loadFirst(activeCode)}
          >
            重试
          </button>
        </div>
      ) : loadingWorks ? (
        <div className="joy-inspire-works-grid" aria-busy>
          <div className="joy-inspire-works-roam-skel" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="joy-inspire-works-skel" />
          ))}
        </div>
      ) : works.length === 0 ? (
        <div className="joy-inspire-works-empty">
          <p>该分类暂无作品</p>
        </div>
      ) : (
        <>
          <div className="joy-inspire-works-grid">
            {roamWorks.length > 0 ? (
              <InspireWorksRoam key={activeCode} works={roamWorks} />
            ) : null}

            {works.map((work) => (
              <InspireWorksCard
                key={work.id}
                work={work}
                onOpen={() => setDetailId(work.id)}
              />
            ))}
          </div>

          <InspireWorksDetail
            works={works}
            activeId={detailId}
            open={detailId != null}
            onOpenChange={(open) => {
              if (!open) setDetailId(null);
            }}
            onActiveChange={setDetailId}
          />

          <div className="joy-inspire-works-more">
            {hasMore ? (
              <>
                <div
                  ref={sentinelRef}
                  className="joy-inspire-works-sentinel"
                  aria-hidden
                />
                <button
                  type="button"
                  className="joy-inspire-works-more-btn"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "加载中…" : "加载更多"}
                </button>
              </>
            ) : (
              <p className="joy-inspire-works-end">没有更多了</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
