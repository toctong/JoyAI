"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  CheckCircle2,
  CircleDot,
  Clock3,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  Github,
  Loader2,
  MessageSquare,
  RefreshCw,
  Scale,
  ShieldCheck,
  Star,
} from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { toast } from "@/shared/lib/toast";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import "./changelog.css";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

type Commit = {
  sha: string;
  shortSha: string;
  message: string;
  body: string;
  authoredAt: string;
  committedAt: string | null;
  commentCount: number;
  verified: boolean;
  verifyReason: string | null;
  isMerge: boolean;
  author: {
    name: string;
    email: string | null;
    login: string | null;
    avatarUrl: string | null;
  };
  committer: {
    name: string | null;
    login: string | null;
  };
};

type RepoMeta = {
  description: string | null;
  defaultBranch: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  pushedAt: string | null;
  private: boolean;
};

type CommitsPage = {
  owner: string;
  repo: string;
  configured: boolean;
  repoMeta: RepoMeta | null;
  items: Commit[];
  page: number;
  perPage: number;
  hasMore: boolean;
};

/** Conventional Commit type → display emoji（更新日志扫一眼用） */
const COMMIT_TYPE_EMOJI: Record<string, string> = {
  feat: "🚀",
  fix: "🐞",
  docs: "📝",
  style: "🌈",
  refactor: "♻️",
  perf: "⚡",
  test: "✅",
  build: "📦",
  ci: "👷",
  chore: "🔧",
  revert: "⏪",
};

function commitEmoji(message: string, isMerge: boolean) {
  if (isMerge) return "🔀";
  const m = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?\s*:/i.exec(
    message.trim(),
  );
  if (!m) return "📌";
  return COMMIT_TYPE_EMOJI[m[1]!.toLowerCase()] ?? "📌";
}

function datePillLabel(iso: string) {
  const d = dayjs(iso);
  const today = dayjs().startOf("day");
  if (d.isSame(today, "day")) return `今天（${d.format("YYYY/M/D")}）`;
  if (d.isSame(today.subtract(1, "day"), "day")) {
    return `昨天（${d.format("YYYY/M/D")}）`;
  }
  return `${d.format("dddd YYYY年M月D日")}（${d.format("YYYY/M/D")}）`;
}

function dateTocLabel(iso: string) {
  const d = dayjs(iso);
  const today = dayjs().startOf("day");
  if (d.isSame(today, "day")) return "今天";
  if (d.isSame(today.subtract(1, "day"), "day")) return "昨天";
  return d.format("M月D日");
}

function findShellScrollViewport(from: HTMLElement | null) {
  if (!from) return null;
  return from.closest("[data-app-shell]")?.querySelector(
    "main [data-radix-scroll-area-viewport]",
  ) as HTMLElement | null;
}

async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error("复制失败");
  }
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
  const [activeDay, setActiveDay] = useState<string | null>(null);

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

  useEffect(() => {
    if (groups.length === 0) {
      setActiveDay(null);
      return;
    }
    const root = scrollEl;
    const nodes = groups
      .map(([day]) => document.getElementById(`changelog-day-${day}`))
      .filter(Boolean) as HTMLElement[];
    if (nodes.length === 0) return;

    setActiveDay((prev) => prev ?? groups[0]![0]);

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        const id = visible[0]?.target.id;
        if (id?.startsWith("changelog-day-")) {
          setActiveDay(id.slice("changelog-day-".length));
        }
      },
      {
        root: root ?? null,
        rootMargin: "-12% 0px -55% 0px",
        threshold: [0, 0.2, 0.5],
      },
    );
    for (const n of nodes) io.observe(n);
    return () => io.disconnect();
  }, [groups, scrollEl]);

  function scrollToDay(day: string) {
    const node = document.getElementById(`changelog-day-${day}`);
    if (!node) return;
    setActiveDay(day);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const meta = data?.repoMeta;
  const showFeed = !loading || items.length > 0;
  const showToc = showFeed && !error && groups.length > 0;

  return (
    <div className="joy-changelog" ref={setRootEl}>
      {(loading || loadingMore) && items.length > 0 ? (
        <div className="joy-changelog-progress" aria-hidden>
          <span />
        </div>
      ) : null}
      <div className="joy-changelog-inner">
        <header className="joy-changelog-head">
          <div className="joy-changelog-head-text">
            <p className="joy-changelog-kicker">
              <Github className="joy-changelog-kicker-icon" aria-hidden />
              GitHub
            </p>
            <h1 className="joy-changelog-title">更新日志</h1>
            <p className="joy-changelog-desc">
              {data
                ? "应用内只读提交记录，不跳转外站"
                : "拉取仓库提交记录"}
            </p>
          </div>
          {!data ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-[2px] shadow-none"
              disabled={loading}
              onClick={() => void load(1, false)}
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
              刷新
            </Button>
          ) : null}
        </header>

        {data ? (
          <div className="joy-changelog-summary">
            <div className="joy-changelog-summary-main">
              <div className="joy-changelog-summary-identity">
                <span className="joy-changelog-summary-mark" aria-hidden>
                  <Github className="joy-changelog-summary-gh" />
                </span>
                <div className="joy-changelog-summary-text">
                  <div className="joy-changelog-summary-title-row">
                    <h2 className="joy-changelog-summary-name">
                      <span className="joy-changelog-summary-owner">
                        {data.owner}
                      </span>
                      <span className="joy-changelog-summary-slash">/</span>
                      <span className="joy-changelog-summary-repo-name">
                        {data.repo}
                      </span>
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 rounded-[2px] shadow-none"
                      disabled={loading}
                      onClick={() => void load(1, false)}
                    >
                      <RefreshCw
                        className={cn("size-3.5", loading && "animate-spin")}
                      />
                      刷新
                    </Button>
                  </div>
                  <div className="joy-changelog-badges">
                    <Badge
                      variant="secondary"
                      className="rounded-[2px] font-normal"
                    >
                      {meta?.private ? "私有" : "公开"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-[2px] font-normal",
                        data.configured
                          ? "border-emerald-500/35 text-emerald-700 dark:text-emerald-400"
                          : "border-amber-500/35 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {data.configured ? "Token 已配置" : "未配置 Token"}
                    </Badge>
                    {meta?.defaultBranch ? (
                      <Badge
                        variant="outline"
                        className="rounded-[2px] gap-1 font-normal"
                      >
                        <GitBranch className="size-[var(--joy-icon-xs)]" />
                        {meta.defaultBranch}
                      </Badge>
                    ) : null}
                    {meta?.language ? (
                      <Badge
                        variant="outline"
                        className="rounded-[2px] font-normal"
                      >
                        {meta.language}
                      </Badge>
                    ) : null}
                    {meta?.license ? (
                      <Badge
                        variant="outline"
                        className="rounded-[2px] gap-1 font-normal"
                      >
                        <Scale className="size-[var(--joy-icon-xs)]" />
                        {meta.license}
                      </Badge>
                    ) : null}
                  </div>
                  {meta?.description ? (
                    <p className="joy-changelog-summary-desc">
                      {meta.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="joy-changelog-stats">
              <div className="joy-changelog-stats-metrics">
                <div className="joy-changelog-stat">
                  <Star
                    className="joy-changelog-stat-icon"
                    aria-hidden
                  />
                  <div className="joy-changelog-stat-body">
                    <span className="joy-changelog-stat-val">
                      {meta?.stars ?? "—"}
                    </span>
                    <span className="joy-changelog-stat-label">Stars</span>
                  </div>
                </div>
                <div className="joy-changelog-stat">
                  <GitFork
                    className="joy-changelog-stat-icon"
                    aria-hidden
                  />
                  <div className="joy-changelog-stat-body">
                    <span className="joy-changelog-stat-val">
                      {meta?.forks ?? "—"}
                    </span>
                    <span className="joy-changelog-stat-label">Forks</span>
                  </div>
                </div>
                <div className="joy-changelog-stat">
                  <CircleDot
                    className="joy-changelog-stat-icon"
                    aria-hidden
                  />
                  <div className="joy-changelog-stat-body">
                    <span className="joy-changelog-stat-val">
                      {meta?.openIssues ?? "—"}
                    </span>
                    <span className="joy-changelog-stat-label">Issues</span>
                  </div>
                </div>
              </div>
              <div className="joy-changelog-stats-meta">
                <div className="joy-changelog-stat-meta">
                  <GitCommitHorizontal
                    className="joy-changelog-stat-icon"
                    aria-hidden
                  />
                  <span>
                    已加载{" "}
                    <strong className="joy-changelog-stat-em">
                      {items.length}
                    </strong>{" "}
                    条
                    {data.hasMore ? " · 还有更多" : ""}
                  </span>
                </div>
                {meta?.pushedAt ? (
                  <div className="joy-changelog-stat-meta">
                    <Clock3
                      className="joy-changelog-stat-icon"
                      aria-hidden
                    />
                    <span>
                      最近推送 {dayjs(meta.pushedAt).fromNow()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <div
            className="joy-changelog-skel"
            aria-busy="true"
            aria-label="正在拉取提交"
          >
            <div className="joy-changelog-skel-banner">
              <span className="joy-changelog-skel-pulse" aria-hidden>
                <GitCommitHorizontal className="size-[var(--joy-icon-sm)]" />
              </span>
              <div className="joy-changelog-skel-banner-text">
                <span className="joy-changelog-skel-banner-title">
                  正在同步仓库提交
                </span>
                <span className="joy-changelog-skel-banner-sub">
                  拉取提交记录与仓库摘要…
                </span>
              </div>
              <span className="joy-changelog-skel-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </div>

            <div className="joy-changelog-skel-summary">
              <div className="joy-changelog-skel-summary-row">
                <Skeleton className="joy-changelog-skel-repo" />
                <Skeleton className="joy-changelog-skel-badge" />
                <Skeleton className="joy-changelog-skel-badge is-sm" />
                <Skeleton className="joy-changelog-skel-badge is-sm" />
              </div>
              <Skeleton className="joy-changelog-skel-desc" />
              <Skeleton className="joy-changelog-skel-desc is-short" />
              <div className="joy-changelog-skel-stats">
                <Skeleton className="joy-changelog-skel-stat" />
                <Skeleton className="joy-changelog-skel-stat" />
                <Skeleton className="joy-changelog-skel-stat" />
                <Skeleton className="joy-changelog-skel-stat is-wide" />
              </div>
            </div>

            <div className="joy-changelog-skel-feed">
              <div className="joy-changelog-skel-day">
                <span className="joy-changelog-skel-day-dot" aria-hidden />
                <Skeleton className="joy-changelog-skel-day-label" />
                <Skeleton className="joy-changelog-skel-day-count" />
              </div>
              <ul className="joy-changelog-skel-list">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li
                    key={i}
                    className="joy-changelog-skel-item"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <span className="joy-changelog-skel-rail" aria-hidden />
                    <div className="joy-changelog-skel-card">
                      <div className="joy-changelog-skel-card-main">
                        <Skeleton
                          className={cn(
                            "joy-changelog-skel-msg",
                            i % 2 === 1 && "is-mid",
                            i % 3 === 2 && "is-long",
                          )}
                        />
                        <div className="joy-changelog-skel-meta">
                          <Skeleton className="joy-changelog-skel-avatar" />
                          <Skeleton className="joy-changelog-skel-author" />
                          <Skeleton className="joy-changelog-skel-time" />
                        </div>
                      </div>
                      <Skeleton className="joy-changelog-skel-sha" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : error && items.length === 0 ? (
          <div className="joy-changelog-status is-error">
            <p>{error}</p>
            <p className="text-muted-foreground">
              私有仓请在 <strong>管理 → 设置 → GitHub</strong> 配置 Token（需
              repo 读权限）与 Owner / Repo；也可写服务端{" "}
              <code>.env</code> 的 <code>GITHUB_*</code>。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-8 rounded-[2px]"
              onClick={() => void load(1, false)}
            >
              重试
            </Button>
          </div>
        ) : (
          <div className="joy-changelog-layout">
            <div className="joy-changelog-feed">
              {groups.map(([day, commits]) => (
                <section
                  key={day}
                  id={`changelog-day-${day}`}
                  className="joy-changelog-day"
                >
                  <div className="joy-changelog-day-label">
                    <span className="joy-changelog-day-dot" aria-hidden />
                    <h2 className="joy-changelog-day-pill">
                      {datePillLabel(commits[0]!.authoredAt)}
                    </h2>
                    <span className="joy-changelog-day-count">
                      {commits.length} 条
                    </span>
                  </div>
                  <ul className="joy-changelog-list">
                    {commits.map((c) => {
                      const initial = c.author.name.slice(0, 1).toUpperCase();
                      const authorLabel = c.author.login || c.author.name;
                      const committerLabel =
                        c.committer.login || c.committer.name;
                      const showCommitter =
                        Boolean(committerLabel) &&
                        committerLabel !== authorLabel;
                      const emoji = commitEmoji(c.message, c.isMerge);
                      return (
                        <li key={c.sha} className="joy-changelog-item">
                          <div
                            className={cn(
                              "joy-changelog-rail",
                              c.isMerge && "is-merge",
                            )}
                            aria-hidden
                          >
                            {c.isMerge ? (
                              <GitMerge className="joy-changelog-rail-icon" />
                            ) : null}
                          </div>
                          <div className="joy-changelog-card">
                            <div className="joy-changelog-card-main">
                              <div className="joy-changelog-msg-row">
                                <p className="joy-changelog-msg">
                                  <span
                                    className="joy-changelog-emoji"
                                    aria-hidden
                                  >
                                    {emoji}
                                  </span>
                                  <span className="joy-changelog-msg-text">
                                    {c.message}
                                  </span>
                                </p>
                                <div className="joy-changelog-tags">
                                  {c.isMerge ? (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-[2px] font-normal"
                                    >
                                      Merge
                                    </Badge>
                                  ) : null}
                                  {c.verified ? (
                                    <Badge
                                      variant="outline"
                                      className="rounded-[2px] gap-1 font-normal text-emerald-600"
                                      title={c.verifyReason ?? "verified"}
                                    >
                                      <ShieldCheck className="size-[var(--joy-icon-xs)]" />
                                      已验证
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                              {c.body ? (
                                <pre className="joy-changelog-body">
                                  {c.body}
                                </pre>
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
                                  {authorLabel}
                                </span>
                                {c.author.email ? (
                                  <>
                                    <span className="joy-changelog-sep">·</span>
                                    <span
                                      className="joy-changelog-email"
                                      title={c.author.email}
                                    >
                                      {c.author.email}
                                    </span>
                                  </>
                                ) : null}
                                {showCommitter ? (
                                  <>
                                    <span className="joy-changelog-sep">·</span>
                                    <span className="text-muted-foreground">
                                      提交者 {committerLabel}
                                    </span>
                                  </>
                                ) : null}
                                <span className="joy-changelog-sep">·</span>
                                <time
                                  dateTime={c.authoredAt}
                                  title={dayjs(c.authoredAt).format(
                                    "YYYY-MM-DD HH:mm:ss",
                                  )}
                                >
                                  {dayjs(c.authoredAt).format("HH:mm")}
                                  <span className="joy-changelog-rel">
                                    （{dayjs(c.authoredAt).fromNow()}）
                                  </span>
                                </time>
                                {c.commentCount > 0 ? (
                                  <>
                                    <span className="joy-changelog-sep">·</span>
                                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                                      <MessageSquare className="size-[var(--joy-icon-xs)]" />
                                      {c.commentCount}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="joy-changelog-sha"
                              title={`复制完整 SHA\n${c.sha}`}
                              onClick={() =>
                                void copyText(c.sha, `已复制 ${c.shortSha}`)
                              }
                            >
                              <span>{c.shortSha}</span>
                              <Copy className="size-[var(--joy-icon-xs)] opacity-50" />
                            </button>
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
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-[2px]"
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
                <p className="joy-changelog-end">
                  <CheckCircle2 className="mr-1.5 inline size-3.5 opacity-60" />
                  没有更多提交了
                </p>
              ) : null}
            </div>

            {showToc ? (
              <aside className="joy-changelog-toc" aria-label="日期导航">
                <nav className="joy-changelog-toc-nav">
                  {groups.map(([day, commits]) => (
                    <button
                      key={day}
                      type="button"
                      className={cn(
                        "joy-changelog-toc-item",
                        activeDay === day && "is-on",
                      )}
                      onClick={() => scrollToDay(day)}
                    >
                      <span className="joy-changelog-toc-label">
                        {dateTocLabel(commits[0]!.authoredAt)}
                      </span>
                      <span className="joy-changelog-toc-count">
                        {commits.length}
                      </span>
                    </button>
                  ))}
                </nav>
              </aside>
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
