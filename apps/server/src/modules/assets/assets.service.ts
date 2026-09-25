import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, MoreThanOrEqual, Not, type FindOptionsWhere, Repository } from "typeorm";
import { Asset } from "../../database/entities/asset.entity";
import { StorageService } from "../storage/storage.service";
import { fetchPublicImage } from "../storage/fetch-public-image";
import { sanitizeOriginalName } from "../storage/original-name";
import { sourceFromAsset } from "./asset-source";
import { AssetSourceSchema, tosThumbUrl } from "@joyai/shared";

export type AssetListQuery = {
  take?: number;
  skip?: number;
  kind?: string;
  source?: string;
  /** ISO date or relative: 1d | 7d | 30d */
  from?: string;
  sort?: "newest" | "oldest";
  /** 1 = no job (uploads); 0 = generated (has job) */
  uploaded?: "0" | "1";
};

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    private readonly storage: StorageService,
  ) {}

  findByMd5(userId: string, md5: string) {
    return this.assets.findOne({
      where: { userId, md5: md5.trim().toLowerCase() },
      order: { createdAt: "DESC" },
    });
  }

  findByUrl(userId: string, url: string) {
    return this.assets.findOne({
      where: { userId, url: url.trim() },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Another asset already mirrored this remote origin into TOS —
   * reuse its public URL / fingerprints without re-downloading.
   */
  async findMirroredByOriginUrl(originUrl: string) {
    const origin = originUrl.trim();
    if (!origin) return null;
    // Prefer recent TOS mirrors; filter originUrl in memory (meta is JSON).
    const rows = await this.assets
      .createQueryBuilder("a")
      .where("a.url LIKE :tos", { tos: "%/uploads/by-hash/%" })
      .orderBy("a.createdAt", "DESC")
      .take(80)
      .getMany();
    for (const row of rows) {
      const meta = row.meta ?? {};
      if (meta.originUrl !== origin) continue;
      if (meta.storageStatus && meta.storageStatus !== "ready") continue;
      return row;
    }
    return null;
  }

  /** Keys / MD5s still referenced by Asset rows (for TOS GC). */
  async collectStorageReferences(): Promise<{
    keys: Set<string>;
    md5s: Set<string>;
  }> {
    const rows = await this.assets.find({
      select: ["url", "md5", "meta"],
    });
    const keys = new Set<string>();
    const md5s = new Set<string>();
    for (const row of rows) {
      const fromUrl = this.storage.keyFromPublicUrl(row.url);
      if (fromUrl) keys.add(fromUrl);
      const storageKey = row.meta?.storageKey;
      if (typeof storageKey === "string" && storageKey.trim()) {
        keys.add(storageKey.trim());
      }
      if (row.md5?.trim()) md5s.add(row.md5.trim().toLowerCase());
      const metaMd5 =
        typeof row.meta?.md5 === "string" ? row.meta.md5.trim() : "";
      if (metaMd5) md5s.add(metaMd5.toLowerCase());
    }
    return { keys, md5s };
  }

  async getOwned(userId: string, id: string) {
    const asset = await this.assets.findOne({
      where: { id, userId },
      relations: ["job"],
    });
    if (!asset) throw new NotFoundException("素材不存在");
    return this.toListItem(asset);
  }

  /**
   * Hard-delete owned assets and purge TOS objects when nothing else references them.
   * Content-addressed: shared hashes are kept until the last Asset row is gone.
   */
  async removeOwnedAndPurgeStorage(userId: string, assetIds: string[]) {
    const ids = [
      ...new Set(assetIds.map((id) => String(id || "").trim()).filter(Boolean)),
    ];
    if (!ids.length) {
      return { removed: 0, purgedKeys: [] as string[] };
    }

    const rows = await this.assets.find({
      where: { userId, id: In(ids) },
    });
    if (!rows.length) {
      return { removed: 0, purgedKeys: [] as string[] };
    }

    const candidates = new Map<string, string | null>();
    for (const row of rows) {
      const metaKey =
        typeof row.meta?.storageKey === "string"
          ? row.meta.storageKey.trim()
          : "";
      const key = metaKey || this.storage.keyFromPublicUrl(row.url) || "";
      if (!key) continue;
      const md5 =
        row.md5?.trim().toLowerCase() ||
        (typeof row.meta?.md5 === "string"
          ? row.meta.md5.trim().toLowerCase()
          : null) ||
        key.match(/^uploads\/by-hash\/([a-f0-9]{32})\./i)?.[1]?.toLowerCase() ||
        null;
      candidates.set(key, md5);
    }

    await this.assets.remove(rows);

    const purgedKeys: string[] = [];
    if (!this.storage.isConfigured() || !candidates.size) {
      return { removed: rows.length, purgedKeys };
    }

    const { keys, md5s } = await this.collectStorageReferences();
    for (const [key, md5] of candidates) {
      if (keys.has(key)) continue;
      if (md5 && md5s.has(md5)) continue;
      try {
        await this.storage.deleteObject(key);
        purgedKeys.push(key);
      } catch {
        // Best-effort — orphaned objects can still be swept by admin GC.
      }
    }

    return { removed: rows.length, purgedKeys };
  }

  /**
   * Register canvas media into the user library.
   * Reuses existing assetId / URL when possible; mirrors remote images into TOS.
   */
  async saveFromCanvas(
    userId: string,
    data: {
      assetId?: string;
      url?: string;
      kind?: string;
      text?: string;
      width?: number;
      height?: number;
      meta?: Record<string, unknown> | null;
    },
  ) {
    const originalName = sanitizeOriginalName(
      typeof data.meta?.originalName === "string"
        ? data.meta.originalName
        : undefined,
    );
    const restMeta = { ...(data.meta ?? {}) };
    delete restMeta.originalName;
    const stamp = {
      savedFromCanvas: true,
      savedAt: new Date().toISOString(),
      source: "canvas",
      ...restMeta,
      ...(originalName ? { originalName } : {}),
    };

    if (data.assetId?.trim()) {
      const owned = await this.assets.findOne({
        where: { id: data.assetId.trim(), userId },
      });
      if (!owned) throw new NotFoundException("素材不存在");
      if (!owned.source) owned.source = "canvas";
      const saved = await this.patchMeta(owned.id, stamp);
      if (saved && !saved.source) {
        saved.source = "canvas";
        await this.assets.save(saved);
      }
      return { ...(saved ?? owned), reused: true as const };
    }

    const text = data.text?.trim();
    if (text) {
      if (!this.storage.isConfigured()) {
        throw new BadRequestException("存储未配置，无法保存文本素材");
      }
      const buffer = Buffer.from(text, "utf8");
      const put = await this.storage.putObject(buffer, {
        contentType: "text/plain; charset=utf-8",
        ext: "txt",
      });
      const asset = await this.create({
        userId,
        kind: "text",
        url: put.url,
        md5: put.md5,
        mimeType: "text/plain",
        size: put.size,
        source: "canvas",
        meta: {
          ...stamp,
          sha256: put.sha256,
          storageKey: put.key,
          preview: text.slice(0, 240),
        },
      });
      return { ...asset, reused: false as const };
    }

    const url = data.url?.trim();
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
      throw new BadRequestException("没有可保存的媒体地址");
    }

    const existing = await this.findByUrl(userId, url);
    if (existing) {
      if (!existing.source) existing.source = "canvas";
      const saved = await this.patchMeta(existing.id, stamp);
      if (saved && !saved.source) {
        saved.source = "canvas";
        await this.assets.save(saved);
      }
      return { ...(saved ?? existing), reused: true as const };
    }

    const kind = (data.kind?.trim() || "image").toLowerCase();
    if (kind === "image" && this.storage.isConfigured()) {
      try {
        const image = await fetchPublicImage(url);
        const ext =
          image.contentType === "image/jpeg"
            ? "jpg"
            : image.contentType === "image/webp"
              ? "webp"
              : image.contentType === "image/gif"
                ? "gif"
                : "png";
        const put = await this.storage.putObject(image.buffer, {
          contentType: image.contentType,
          ext,
        });
        const byMd5 = await this.findByMd5(userId, put.md5);
        if (byMd5) {
          if (!byMd5.source) byMd5.source = "canvas";
          const saved = await this.patchMeta(byMd5.id, stamp);
          if (saved && !saved.source) {
            saved.source = "canvas";
            await this.assets.save(saved);
          }
          return { ...(saved ?? byMd5), reused: true as const };
        }
        const asset = await this.create({
          userId,
          kind: "image",
          url: put.url,
          md5: put.md5,
          mimeType: image.contentType,
          size: put.size,
          width: data.width,
          height: data.height,
          source: "canvas",
          meta: {
            ...stamp,
            sha256: put.sha256,
            storageKey: put.key,
            sourceUrl: url,
          },
        });
        return { ...asset, reused: false as const };
      } catch {
        // Fall through: register remote URL without mirror.
      }
    }

    const asset = await this.create({
      userId,
      kind,
      url,
      width: data.width,
      height: data.height,
      source: "canvas",
      meta: { ...stamp, remote: true },
    });
    return { ...asset, reused: false as const };
  }

  create(data: {
    userId: string;
    jobId?: string;
    kind: string;
    url: string;
    md5?: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
    source?: string | null;
    meta?: Record<string, unknown> | null;
  }) {
    const source =
      data.source ??
      (typeof data.meta?.source === "string" ? data.meta.source : null);
    return this.assets.save(
      this.assets.create({
        userId: data.userId,
        jobId: data.jobId ?? null,
        kind: data.kind,
        url: data.url,
        md5: data.md5?.trim().toLowerCase() ?? null,
        mimeType: data.mimeType ?? null,
        size: data.size ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        source: source ?? null,
        meta: data.meta ?? null,
      }),
    );
  }

  /**
   * Persist plain text as a document asset (assets library「文档」tab).
   * Returns null when storage is not configured — callers should not fail the job.
   */
  async createTextDocument(data: {
    userId: string;
    jobId?: string;
    text: string;
    source?: string | null;
    originalName?: string;
    meta?: Record<string, unknown> | null;
  }) {
    const text = data.text.trim();
    if (!text) return null;
    if (!this.storage.isConfigured()) return null;

    const buffer = Buffer.from(text, "utf8");
    const put = await this.storage.putObject(buffer, {
      contentType: "text/plain; charset=utf-8",
      ext: "txt",
    });
    const originalName =
      sanitizeOriginalName(data.originalName || "prompt.txt") || "prompt.txt";
    const source = data.source ?? null;
    return this.create({
      userId: data.userId,
      jobId: data.jobId,
      kind: "text",
      url: put.url,
      md5: put.md5,
      mimeType: "text/plain",
      size: put.size,
      source,
      meta: {
        ...(data.meta ?? {}),
        ...(source ? { source } : {}),
        originalName,
        sha256: put.sha256,
        storageKey: put.key,
        storageStatus: "ready",
        preview: text.slice(0, 240),
      },
    });
  }

  findById(id: string) {
    return this.assets.findOne({ where: { id } });
  }

  async updateMirrored(
    id: string,
    data: {
      url: string;
      md5?: string;
      size?: number;
      meta?: Record<string, unknown> | null;
    },
  ) {
    const asset = await this.findById(id);
    if (!asset) return null;
    asset.url = data.url;
    if (data.md5 !== undefined) asset.md5 = data.md5.trim().toLowerCase();
    if (data.size !== undefined) asset.size = data.size;
    if (data.meta !== undefined) asset.meta = data.meta;
    return this.assets.save(asset);
  }

  async patchMeta(id: string, patch: Record<string, unknown>) {
    const asset = await this.findById(id);
    if (!asset) return null;
    asset.meta = { ...(asset.meta ?? {}), ...patch };
    return this.assets.save(asset);
  }

  async ensureSource(id: string, source: string) {
    const asset = await this.findById(id);
    if (!asset) return null;
    if (asset.source) return asset;
    asset.source = source;
    asset.meta = { ...(asset.meta ?? {}), source };
    return this.assets.save(asset);
  }

  /** Attach uploaded assets to a succeeded local/studio job. */
  async linkToJob(userId: string, assetIds: string[], jobId: string) {
    const ids = [
      ...new Set(
        assetIds.map((id) => String(id || "").trim()).filter(Boolean),
      ),
    ];
    if (!ids.length) {
      throw new BadRequestException("缺少素材");
    }
    const rows = await this.assets.find({
      where: { userId, id: In(ids) },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException("素材不存在或无权访问");
    }
    for (const row of rows) {
      row.jobId = jobId;
      if (!row.source) {
        row.source = "studio";
      }
      row.meta = {
        ...(row.meta ?? {}),
        source: row.source,
        localEdit: true,
      };
    }
    await this.assets.save(rows);
    // Preserve caller order — TypeORM `In()` / save() do not.
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)!);
  }

  async list(userId: string, query: AssetListQuery = {}) {
    const take = Math.min(Math.max(Number(query.take) || 50, 1), 300);
    const skip = Math.min(Math.max(Number(query.skip) || 0, 0), 10_000);
    const sort = query.sort === "oldest" ? "ASC" : "DESC";
    const kind = query.kind?.trim().toLowerCase();
    const sourceFilter = query.source?.trim().toLowerCase();
    const fromDate = parseFromFilter(query.from);
    const knownSource = AssetSourceSchema.safeParse(sourceFilter).success
      ? sourceFilter
      : undefined;
    const kindFilter =
      kind === "image" ||
      kind === "video" ||
      kind === "audio" ||
      kind === "text"
        ? kind
        : undefined;
    // Kind tabs (图片/视频/…) must not mix in user uploads — those live under 上传.
    const excludeUploads = Boolean(kindFilter) && knownSource !== "upload";

    // Prefer DB `source` when set; still oversample a bit and re-check via
    // resolveAssetSource for legacy rows that only infer source from job links.
    const baseWhere: FindOptionsWhere<Asset> = { userId };
    if (kindFilter) {
      baseWhere.kind = kindFilter;
    }
    if (fromDate) {
      baseWhere.createdAt = MoreThanOrEqual(fromDate);
    }
    if (knownSource) {
      baseWhere.source = knownSource;
    }
    if (query.uploaded === "1") {
      baseWhere.jobId = IsNull();
    } else if (query.uploaded === "0") {
      baseWhere.jobId = Not(IsNull());
    }

    const where: FindOptionsWhere<Asset> | FindOptionsWhere<Asset>[] =
      excludeUploads && !knownSource
        ? [
            { ...baseWhere, source: Not("upload") },
            { ...baseWhere, source: IsNull() },
          ]
        : baseWhere;

    const fetchTake =
      knownSource || excludeUploads ? Math.min(take + 40, 300) : take;

    const rows = await this.assets.find({
      where,
      order: { createdAt: sort },
      skip,
      take: fetchTake,
      relations: ["job"],
    });

    const items = rows.map((a) => this.toListItem(a));
    let filtered = knownSource
      ? items.filter((a) => a.source === knownSource)
      : items;
    if (excludeUploads) {
      filtered = filtered.filter((a) => a.source !== "upload");
    }

    if (filtered.length >= take || (!knownSource && !excludeUploads)) {
      return filtered.slice(0, take);
    }

    // Legacy rows may have null source — fill remaining slots from inferred matches.
    const have = new Set(filtered.map((a) => a.id));
    const legacyWhere: FindOptionsWhere<Asset> = {
      userId,
      source: IsNull(),
    };
    if (kindFilter) {
      legacyWhere.kind = kindFilter;
    }
    if (fromDate) {
      legacyWhere.createdAt = MoreThanOrEqual(fromDate);
    }
    if (query.uploaded === "1") {
      legacyWhere.jobId = IsNull();
    } else if (query.uploaded === "0") {
      legacyWhere.jobId = Not(IsNull());
    }
    const legacyRows = await this.assets.find({
      where: legacyWhere,
      order: { createdAt: sort },
      take: Math.min(take * 3, 400),
      relations: ["job"],
    });
    for (const row of legacyRows) {
      if (have.has(row.id)) continue;
      const item = this.toListItem(row);
      if (knownSource && item.source !== knownSource) continue;
      if (excludeUploads && item.source === "upload") continue;
      filtered.push(item);
      have.add(row.id);
      if (filtered.length >= take) break;
    }
    return filtered.slice(0, take);
  }

  private toListItem(asset: Asset) {
    const job = asset.job ? this.toJobPreview(asset.job) : null;
    const source = sourceFromAsset({
      source: asset.source,
      jobId: asset.jobId,
      meta: asset.meta,
      job: asset.job
        ? {
            canvasProjectId: asset.job.canvasProjectId,
            input: asset.job.input,
          }
        : null,
    });
    return {
      ...asset,
      source,
      thumbUrl:
        asset.kind === "image" ? tosThumbUrl(asset.url, "md") || null : null,
      job,
    };
  }

  private toJobPreview(job: {
    id: string;
    canvasProjectId: string | null;
    canvasNodeId: string | null;
    modelName: string | null;
    channelName: string | null;
    input: Record<string, unknown> | null;
  }) {
    const input = job.input ?? {};
    const prompt =
      typeof input.prompt === "string" ? input.prompt.trim() || null : null;
    const referenceUrls = Array.isArray(input.referenceUrls)
      ? input.referenceUrls.filter(
          (u): u is string => typeof u === "string" && Boolean(u.trim()),
        )
      : [];
    const manjuProjectId =
      typeof input.manjuProjectId === "string" ? input.manjuProjectId : null;

    return {
      id: job.id,
      canvasProjectId: job.canvasProjectId,
      canvasNodeId: job.canvasNodeId,
      manjuProjectId,
      modelName: job.modelName,
      channelName: job.channelName,
      prompt,
      referenceUrls,
    };
  }

  findByIds(userId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.assets.find({
      where: { userId, id: In(ids) },
    });
  }
}

function parseFromFilter(from?: string): Date | null {
  if (!from?.trim()) return null;
  const key = from.trim().toLowerCase();
  const now = Date.now();
  if (key === "1d" || key === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (key === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (key === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  const parsed = Date.parse(from);
  if (Number.isFinite(parsed)) return new Date(parsed);
  return null;
}
