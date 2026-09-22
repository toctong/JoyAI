"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  RefreshCw,
} from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import "./changelog.css";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

type Commit = {
  sha: string;
  shortSha: string;
  message: string;
  body: string;
  htmlUrl: string;
  authoredAt: string;
  author: {
    name: string;
    login: string | null;
    avatarUrl: string | null;
  };
};

type CommitsPage = {
  owner: string;
  repo: string;
  htmlUrl: string;
  configured: boolean;
  items: Commit[];
  page: number;
  perPage: number;
  hasMore: boolean;
};

function dateLabel(iso: string) {
  const d = dayjs(iso);
  const today = dayjs().startOf("day");
  if (d.isSame(today, "day")) return "今天";
  if (d.isSame(today.subtract(1, "day"), "day")) return "昨天";
  return d.format("YYYY年M月D日");
}

function findShellScrollViewport(from: HTMLElement | null) {
  if (!from) return null;
  return from.closest("[data-app-shell]")?.querySelector(
    "main [data-radix-scroll-area-viewport]",
  ) as HTMLElement | null;
}

export function ChangelogPage() {
  const [data, setData] = useState<CommitsPage | null>(null);
  const [items, setItems] = useState<Commit[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [showTop, setShowTop] = useState(false);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api<CommitsPage>(
        `/changelog/commits?page=${nextPage}&perPage=30`,
      );
      setData(res);
      setPage(res.page);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Commit[]>();
    for (const c of items) {
      const key = dayjs(c.authoredAt).format("YYYY-MM-DD");
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);

  const scrollEl = useMemo(
    () => findShellScrollViewport(rootEl),
    [rootEl],
  );

  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 360);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollEl]);

  return (
    <div className="joy-changelog" ref={setRootEl}>
      <div className="joy-changelog-inner">
        <header className="joy-changelog-head">
          <div className="joy-changelog-head-text">
            <p className="joy-changelog-kicker">GitHub</p>
            <h1 className="joy-changelog-title">更新日志</h1>
            <p className="joy-changelog-desc">
              {data ? (
                <>
                  仓库{" "}
                  <a
                    href={data.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="joy-changelog-repo"
                  >
                    {data.owner}/{data.repo}
                    <ExternalLink className="size-3.5" />
                  </a>
                  {" · "}提交记录
                </>
              ) : (
                "拉取仓库提交记录"
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 shrink-0 rounded-xl"
            disabled={loading}
            onClick={() => void load(1, false)}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </Button>
        </header>

        {loading && items.length === 0 ? (
          <div className="joy-changelog-status">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span>正在拉取提交…</span>
          </div>
        ) : error && items.length === 0 ? (
          <div className="joy-changelog-status is-error">
            <p>{error}</p>
            <p className="text-muted-foreground">
              私有仓请在服务端 <code>.env</code> 配置{" "}
              <code>GITHUB_TOKEN</code>（需 repo 读权限），以及{" "}
              <code>GITHUB_OWNER</code> / <code>GITHUB_REPO</code>。
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2 h-9 rounded-xl"
              onClick={() => void load(1, false)}
            >
              重试
            </Button>
          </div>
        ) : (
          <div className="joy-changelog-feed">
            {groups.map(([day, commits]) => (
              <section key={day} className="joy-changelog-day">
                <div className="joy-changelog-day-label">
                  <span className="joy-changelog-day-dot" aria-hidden />
                  <h2>{dateLabel(commits[0].authoredAt)}</h2>
                </div>
                <ul className="joy-changelog-list">
                  {commits.map((c) => {
                    const initial = c.author.name.slice(0, 1).toUpperCase();
                    return (
                      <li key={c.sha} className="joy-changelog-item">
                        <div className="joy-changelog-rail" aria-hidden>
                          <GitCommitHorizontal className="joy-changelog-rail-icon" />
                        </div>
                        <div className="joy-changelog-card">
                          <div className="joy-changelog-card-main">
                            <a
                              href={c.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="joy-changelog-msg"
                            >
                              {c.message}
                            </a>
                            {c.body ? (
                              <pre className="joy-changelog-body">{c.body}</pre>
                            ) : null}
                            <div className="joy-changelog-meta">
                              <Avatar className="size-5">
                                {c.author.avatarUrl ? (
                                  <AvatarImage
                                    src={c.author.avatarUrl}
                                    alt=""
                                  />
                                ) : null}
                                <AvatarFallback className="text-[10px]">
                                  {initial}
                                </AvatarFallback>
                              </Avatar>
                              <span className="joy-changelog-author">
                                {c.author.login || c.author.name}
                              </span>
                              <span className="joy-changelog-sep">·</span>
                              <time dateTime={c.authoredAt}>
                                {dayjs(c.authoredAt).fromNow()}
                              </time>
                            </div>
                          </div>
                          <a
                            href={c.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="joy-changelog-sha"
                            title={c.sha}
                          >
                            {c.shortSha}
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {data?.hasMore ? (
              <div className="joy-changelog-more">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 rounded-xl"
                  disabled={loadingMore}
                  onClick={() => void load(page + 1, true)}
                >
                  {loadingMore ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  加载更多
                </Button>
              </div>
            ) : items.length > 0 ? (
              <p className="joy-changelog-end">没有更多提交了</p>
            ) : null}
          </div>
        )}
      </div>

      {showTop ? (
        <button
          type="button"
          className="joy-changelog-back-top"
          aria-label="回到顶部"
          onClick={() =>
            scrollEl?.scrollTo({ top: 0, behavior: "smooth" })
          }
        >
          <ArrowUp className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
