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
  author: {
    name: string;
    login: string | null;
    avatarUrl: string | null;
  };
};

export type ChangelogPage = {
  owner: string;
  repo: string;
  htmlUrl: string;
  configured: boolean;
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
    author?: { name?: string; date?: string } | null;
    committer?: { name?: string; date?: string } | null;
  };
  author?: { login?: string; avatar_url?: string } | null;
};

type CacheEntry = { at: number; data: ChangelogPage };

@Injectable()
export class ChangelogService implements OnModuleInit {
  private readonly logger = new Logger(ChangelogService.name);
  private cache = new Map<string, CacheEntry>();
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

    const token = await this.token();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "JoyAI-Changelog",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

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

    const data: ChangelogPage = {
      owner,
      repo,
      htmlUrl: `https://github.com/${owner}/${repo}`,
      configured: Boolean(token),
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

    return {
      sha: row.sha,
      shortSha: row.sha.slice(0, 7),
      message,
      body,
      htmlUrl: row.html_url,
      authoredAt,
      author: {
        name,
        login,
        avatarUrl: row.author?.avatar_url ?? null,
      },
    };
  }
}
