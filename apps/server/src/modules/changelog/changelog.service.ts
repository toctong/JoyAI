import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  configureSettingInvalidate,
  GITHUB_OWNER_SETTING_KEY,
  GITHUB_REPO_SETTING_KEY,
  GITHUB_TOKEN_SETTING_KEY,
  SettingsService,
} from "../settings/settings.service";

export type ChangelogCommit = {
  sha: string;
  shortSha: string;
  message: string;
  body: string;
  htmlUrl: string;
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

export type ChangelogRepoMeta = {
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

export type ChangelogPage = {
  owner: string;
  repo: string;
  htmlUrl: string;
  configured: boolean;
  repoMeta: ChangelogRepoMeta | null;
  items: ChangelogCommit[];
  page: number;
  perPage: number;
  hasMore: boolean;
};

type GhCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    comment_count?: number;
    author?: { name?: string; email?: string; date?: string } | null;
    committer?: { name?: string; email?: string; date?: string } | null;
    verification?: { verified?: boolean; reason?: string } | null;
  };
  author?: { login?: string; avatar_url?: string } | null;
  committer?: { login?: string } | null;
  parents?: Array<{ sha?: string }>;
};

type GhRepo = {
  description?: string | null;
  default_branch?: string;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  license?: { spdx_id?: string | null; name?: string | null } | null;
  pushed_at?: string | null;
  private?: boolean;
};

type CacheEntry = { at: number; data: ChangelogPage };
type RepoCacheEntry = { at: number; data: ChangelogRepoMeta | null };

@Injectable()
export class ChangelogService implements OnModuleInit {
  private readonly logger = new Logger(ChangelogService.name);
  private cache = new Map<string, CacheEntry>();
  private repoCache = new Map<string, RepoCacheEntry>();
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly settings: SettingsService) {}

  onModuleInit() {
    configureSettingInvalidate((key) => {
      if (
        key === GITHUB_OWNER_SETTING_KEY ||
        key === GITHUB_REPO_SETTING_KEY ||
        key === GITHUB_TOKEN_SETTING_KEY
      ) {
        this.clearCache();
      }
    });
  }

  clearCache() {
    this.cache.clear();
    this.repoCache.clear();
  }

  private async owner() {
    return (
      (await this.settings.resolveString(GITHUB_OWNER_SETTING_KEY, "GITHUB_OWNER")) ||
      "toctong"
    );
  }

  private async repo() {
    return (
      (await this.settings.resolveString(GITHUB_REPO_SETTING_KEY, "GITHUB_REPO")) ||
      "JoyAI"
    );
  }

  private async token() {
    return this.settings.resolveString(GITHUB_TOKEN_SETTING_KEY, [
      "GITHUB_TOKEN",
      "GH_TOKEN",
    ]);
  }

  private async githubHeaders() {
    const token = await this.token();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "FrameRally-Changelog",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return { headers, token };
  }

  private async fetchRepoMeta(
    owner: string,
    repo: string,
    headers: Record<string, string>,
  ): Promise<ChangelogRepoMeta | null> {
    const key = `${owner}/${repo}`;
    const hit = this.repoCache.get(key);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.data;

    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers,
      });
      if (!res.ok) {
        this.repoCache.set(key, { at: Date.now(), data: null });
        return null;
      }
      const raw = (await res.json()) as GhRepo;
      const data: ChangelogRepoMeta = {
        description: raw.description?.trim() || null,
        defaultBranch: raw.default_branch ?? null,
        language: raw.language ?? null,
        stars: raw.stargazers_count ?? 0,
        forks: raw.forks_count ?? 0,
        openIssues: raw.open_issues_count ?? 0,
        license: raw.license?.spdx_id || raw.license?.name || null,
        pushedAt: raw.pushed_at ?? null,
        private: Boolean(raw.private),
      };
      this.repoCache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      this.logger.warn(`GitHub repo meta failed: ${String(e)}`);
      return null;
    }
  }

  async listCommits(page = 1, perPage = 30): Promise<ChangelogPage> {
    const owner = await this.owner();
    const repo = await this.repo();
    const safePage = Math.max(1, Math.min(page, 50));
    const safePer = Math.max(1, Math.min(perPage, 50));
    const cacheKey = `${owner}/${repo}:${safePage}:${safePer}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) {
      return hit.data;
    }

    const { headers, token } = await this.githubHeaders();

    const url = new URL(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
    );
    url.searchParams.set("page", String(safePage));
    url.searchParams.set("per_page", String(safePer));

    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      this.logger.warn(`GitHub fetch failed: ${String(e)}`);
      throw new ServiceUnavailableException("无法连接 GitHub");
    }

    if (res.status === 401 || res.status === 403) {
      throw new ServiceUnavailableException(
        token
          ? "GitHub Token 无效或权限不足（私有仓需要 repo 读权限）"
          : "私有仓库需要配置 GITHUB_TOKEN（管理设置或 .env）",
      );
    }
    if (res.status === 404) {
      throw new ServiceUnavailableException(
        "仓库不存在，或私有仓未配置有权限的 GITHUB_TOKEN",
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.logger.warn(`GitHub ${res.status}: ${text.slice(0, 200)}`);
      throw new ServiceUnavailableException("拉取提交记录失败");
    }

    const raw = (await res.json()) as GhCommit[];
    const items = raw.map((row) => this.mapCommit(row));
    const link = res.headers.get("link") ?? "";
    const hasMore = /rel="next"/.test(link) || items.length >= safePer;
    const repoMeta = await this.fetchRepoMeta(owner, repo, headers);

    const data: ChangelogPage = {
      owner,
      repo,
      htmlUrl: `https://github.com/${owner}/${repo}`,
      configured: Boolean(token),
      repoMeta,
      items,
      page: safePage,
      perPage: safePer,
      hasMore,
    };
    this.cache.set(cacheKey, { at: Date.now(), data });
    return data;
  }

  private mapCommit(row: GhCommit): ChangelogCommit {
    const full = String(row.commit?.message ?? "").trim();
    const nl = full.indexOf("\n");
    const message = (nl >= 0 ? full.slice(0, nl) : full).trim() || "(无说明)";
    const body = nl >= 0 ? full.slice(nl + 1).trim() : "";
    const login = row.author?.login?.trim() || null;
    const name =
      row.commit?.author?.name?.trim() ||
      login ||
      row.commit?.committer?.name?.trim() ||
      "unknown";
    const authoredAt =
      row.commit?.author?.date ||
      row.commit?.committer?.date ||
      new Date().toISOString();
    const committedAt = row.commit?.committer?.date ?? null;
    const committerName = row.commit?.committer?.name?.trim() || null;
    const committerLogin = row.committer?.login?.trim() || null;

    return {
      sha: row.sha,
      shortSha: row.sha.slice(0, 7),
      message,
      body,
      htmlUrl: row.html_url,
      authoredAt,
      committedAt,
      commentCount: row.commit?.comment_count ?? 0,
      verified: Boolean(row.commit?.verification?.verified),
      verifyReason: row.commit?.verification?.reason ?? null,
      isMerge: (row.parents?.length ?? 0) > 1,
      author: {
        name,
        email: row.commit?.author?.email?.trim() || null,
        login,
        avatarUrl: row.author?.avatar_url ?? null,
      },
      committer: {
        name: committerName,
        login: committerLogin,
      },
    };
  }
}
