import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import axios from "axios";

const UPSTREAM = "https://neodomain.cn/agent/video-showcase";

type UpstreamEnvelope<T> = {
  success?: boolean;
  errMessage?: string | null;
  data?: T;
  totalCount?: number;
  pageSize?: number;
  pageIndex?: number;
  totalPages?: number;
};

export type ShowcaseCategory = {
  code: string;
  name: string;
  sortOrder: number;
};

export type ShowcaseWork = {
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

export type ShowcaseWorksResult = {
  items: ShowcaseWork[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

@Injectable()
export class InspireShowcaseService {
  private readonly log = new Logger(InspireShowcaseService.name);

  async categories(): Promise<{ items: ShowcaseCategory[] }> {
    const raw = await this.postUpstream<
      Array<{
        categoryCode?: string;
        categoryName?: string;
        sortOrder?: number;
        status?: number;
      }>
    >("/category/list", {});

    const items = (raw ?? [])
      .filter((c) => c.status == null || c.status === 1)
      .map((c) => ({
        code: String(c.categoryCode ?? "").trim(),
        name: String(c.categoryName ?? "").trim(),
        sortOrder: Number(c.sortOrder ?? 0),
      }))
      .filter((c) => c.code && c.name);

    return { items };
  }

  async works(params: {
    categoryCode?: string;
    typeCode?: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
  }): Promise<ShowcaseWorksResult> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.min(48, Math.max(1, Math.floor(params.pageSize ?? 12)));
    const categoryCode = String(params.categoryCode ?? "").trim();
    const keyword = String(params.keyword ?? "").trim();
    // 全部：typeCode=all；分类：categoryCode=xxx + typeCode=""
    const typeCode = categoryCode
      ? ""
      : String(params.typeCode ?? "all").trim() || "all";

    const body: Record<string, unknown> = {
      pageNum: page,
      pageSize,
      typeCode,
      keyword,
      status: 1,
      platformType: 1,
    };
    if (categoryCode) body.categoryCode = categoryCode;

    const envelope = await this.postUpstreamEnvelope<
      Array<Record<string, unknown>>
    >("/query", body);

    const rows = Array.isArray(envelope.data) ? envelope.data : [];
    const items = rows.map((row) => this.mapWork(row)).filter(Boolean) as ShowcaseWork[];

    return {
      items,
      total: Number(envelope.totalCount ?? items.length),
      page: Number(envelope.pageIndex ?? page),
      pageSize: Number(envelope.pageSize ?? pageSize),
      totalPages: Number(envelope.totalPages ?? 1),
    };
  }

  private mapWork(row: Record<string, unknown>): ShowcaseWork | null {
    const id = Number(row.id);
    if (!Number.isFinite(id)) return null;
    const playback =
      row.playback && typeof row.playback === "object"
        ? (row.playback as Record<string, unknown>)
        : null;
    const masterUrl =
      typeof playback?.masterUrl === "string" ? playback.masterUrl.trim() : "";
    const fallbackUrl =
      typeof playback?.fallbackUrl === "string"
        ? playback.fallbackUrl.trim()
        : "";
    const rawVideo = String(row.videoUrl ?? "").trim();
    const candidates = [fallbackUrl, rawVideo, masterUrl].filter(Boolean);
    const progressive = candidates.find(
      (u) => !/\.m3u8(\?|#|$)/i.test(u),
    );
    const videoUrl = progressive || candidates[0] || "";

    return {
      id,
      title: String(row.title ?? "").trim() || "未命名作品",
      description: String(row.description ?? "").trim(),
      coverUrl: String(row.coverImageUrl ?? "").trim(),
      videoUrl,
      authorName: String(row.authorName ?? "").trim() || "匿名",
      authorAvatar: String(row.authorAvatar ?? "").trim(),
      likeCount: Number(row.likeCount ?? 0) || 0,
      isPublic: Number(row.isPublic ?? 1) === 1,
      duration: Number(row.duration ?? 0) || 0,
      createTime:
        typeof row.createTime === "string" ? row.createTime : null,
    };
  }

  private async postUpstream<T>(path: string, body: unknown): Promise<T> {
    const envelope = await this.postUpstreamEnvelope<T>(path, body);
    return envelope.data as T;
  }

  private async postUpstreamEnvelope<T>(
    path: string,
    body: unknown,
  ): Promise<UpstreamEnvelope<T>> {
    const url = `${UPSTREAM}${path}`;
    try {
      const { data, status } = await axios.post(url, body, {
        timeout: 30_000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "FrameRally/0.1 (+inspire-showcase)",
        },
        validateStatus: () => true,
      });
      if (status >= 400) {
        this.log.warn(`showcase upstream HTTP ${status}: ${path}`);
        throw new ServiceUnavailableException("作品内容暂时不可用，请稍后重试");
      }
      const envelope = (data ?? {}) as UpstreamEnvelope<T>;
      if (envelope.success === false) {
        this.log.warn(
          `showcase upstream fail: ${envelope.errMessage || path}`,
        );
        throw new ServiceUnavailableException(
          envelope.errMessage || "作品内容暂时不可用，请稍后重试",
        );
      }
      return envelope;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.log.warn(
        `showcase upstream error: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException("作品内容暂时不可用，请稍后重试");
    }
  }
}
