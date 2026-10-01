import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TosClient } from "@volcengine/tos-sdk";
import axios from "axios";
import * as crypto from "crypto";
import {
  SettingsService,
  configureTosSettingsReload,
} from "../settings/settings.service";

export interface StoragePutResult {
  key: string;
  url: string;
  /** MD5 hex，内容指纹（去重主键） */
  md5: string;
  /** SHA-256 hex，备用指纹；跳过下载时可能为空 */
  sha256: string;
  size: number;
  /** 对象已存在于 TOS，本次未实际上传 */
  deduplicated: boolean;
  /** 本次未拉取远端字节（自身 TOS URL / Content-MD5 命中） */
  skippedDownload?: boolean;
}

export type StorageObjectSummary = {
  key: string;
  size: number;
  lastModified?: string;
};

type TosRuntimeConfig = {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region: string;
  bucket: string;
  publicBase: string;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: TosClient | null = null;
  private bucket = "";
  private publicBase = "";
  private endpoint = "";
  private region = "cn-beijing";
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    // 启动早期先用环境变量，DB Settings 在 onModuleInit 再覆盖。
    this.applyConfig({
      accessKey: String(config.get<string>("TOS_ACCESS_KEY") ?? "").trim(),
      secretKey: String(config.get<string>("TOS_SECRET_KEY") ?? "").trim(),
      endpoint: String(config.get<string>("TOS_ENDPOINT") ?? "").trim(),
      region: String(config.get<string>("TOS_REGION") ?? "cn-beijing").trim() ||
        "cn-beijing",
      bucket: String(config.get<string>("TOS_BUCKET") ?? "").trim(),
      publicBase: String(config.get<string>("TOS_PUBLIC_BASE_URL") ?? "").trim(),
    });
  }

  async onModuleInit() {
    configureTosSettingsReload(() => this.scheduleReloadFromSettings());
    await this.reloadFromSettings();
  }

  /** 管理端连续写入多个 tos.* 时合并成一次重载。 */
  scheduleReloadFromSettings() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reloadFromSettings().catch((err) => {
        this.logger.warn(
          `TOS reload failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, 120);
  }

  async reloadFromSettings() {
    const [accessKey, secretKey, endpoint, region, bucket, publicBase] =
      await Promise.all([
        this.settings.resolveString("tos.accessKey", "TOS_ACCESS_KEY"),
        this.settings.resolveString("tos.secretKey", "TOS_SECRET_KEY"),
        this.settings.resolveString("tos.endpoint", "TOS_ENDPOINT"),
        this.settings.resolveString("tos.region", "TOS_REGION"),
        this.settings.resolveString("tos.bucket", "TOS_BUCKET"),
        this.settings.resolveString("tos.publicBaseUrl", "TOS_PUBLIC_BASE_URL"),
      ]);
    this.applyConfig({
      accessKey,
      secretKey,
      endpoint,
      region: region || "cn-beijing",
      bucket,
      publicBase,
    });
  }

  private applyConfig(cfg: TosRuntimeConfig) {
    this.endpoint = cfg.endpoint;
    this.region = cfg.region || "cn-beijing";
    this.bucket = cfg.bucket;
    this.publicBase = cfg.publicBase;

    if (cfg.accessKey && cfg.secretKey && this.endpoint && this.bucket) {
      this.client = new TosClient({
        accessKeyId: cfg.accessKey,
        accessKeySecret: cfg.secretKey,
        region: this.region,
        endpoint: this.endpoint,
      });
      this.logger.log(
        `TOS configured (bucket=${this.bucket}, endpoint=${this.endpoint})`,
      );
    } else {
      this.client = null;
      this.logger.warn(
        "TOS not fully configured; set admin Settings (tos.*) or TOS_* env",
      );
    }
  }

  isConfigured() {
    return !!this.client && !!this.bucket;
  }

  md5(buffer: Buffer) {
    return crypto.createHash("md5").update(buffer).digest("hex");
  }

  sha256(buffer: Buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /** 内容寻址 key：同文件永远同一路径，避免重复占存储 */
  contentAddressedKey(md5: string, ext: string) {
    const safeExt = (ext || "bin").replace(/^\./, "").toLowerCase();
    return `uploads/by-hash/${md5.toLowerCase()}.${safeExt}`;
  }

  /** 从公开 URL 解析出 TOS object key（仅本桶 / 本 publicBase）。 */
  keyFromPublicUrl(url: string): string | null {
    const trimmed = String(url ?? "").trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)/i);
    if (!match?.[1] || !match[2]) return null;
    const host = match[1].toLowerCase();
    let pathname = decodeURIComponent(match[2]);
    if (pathname.startsWith("/")) pathname = pathname.slice(1);

    if (this.publicBase) {
      const base = this.publicBase.replace(/\/$/, "").toLowerCase();
      const full = trimmed.split(/[?#]/)[0]!.toLowerCase();
      if (full.startsWith(base + "/")) {
        return full.slice(base.length + 1);
      }
    }

    const endpointHost = this.endpoint.replace(/^https?:\/\//i, "").toLowerCase();
    const bucketHost = `${this.bucket}.${endpointHost}`.toLowerCase();
    if (host === bucketHost || host === this.bucket.toLowerCase()) {
      return pathname || null;
    }
    // Custom CDN in front of by-hash keys — still treat as ours.
    if (pathname.startsWith("uploads/by-hash/")) {
      if (host.includes("volces.com") || host.includes("volccdn.com") || /\.tos[-.]/i.test(host)) {
        return pathname;
      }
    }
    return null;
  }

  isOwnObjectUrl(url: string): boolean {
    return !!this.keyFromPublicUrl(url);
  }

  async objectExists(key: string): Promise<boolean> {
    if (!this.client || !this.bucket) return false;
    try {
      await this.client.headObject({ bucket: this.bucket, key });
      return true;
    } catch {
      return false;
    }
  }

  async headObjectMeta(key: string): Promise<{ size: number; md5?: string } | null> {
    if (!this.client || !this.bucket) return null;
    try {
      const res = await this.client.headObject({ bucket: this.bucket, key });
      const headers = res.data ?? {};
      const len = Number(headers["content-length"] ?? 0);
      const md5 = normalizeMd5(
        headers["content-md5"] ?? headers.etag ?? headers.ETag,
      );
      return {
        size: Number.isFinite(len) ? len : 0,
        ...(md5 ? { md5 } : {}),
      };
    } catch {
      return null;
    }
  }

  /**
   * 上传到 TOS。默认按 MD5 内容寻址；
   * 若对象已存在则跳过 putObject，仅返回 URL。
   */
  async putObject(
    buffer: Buffer,
    opts: { key?: string; contentType?: string; ext?: string } = {},
  ): Promise<StoragePutResult> {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        "TOS 未配置，请在管理端「设置 → 对象存储」填写，或设置 TOS_ACCESS_KEY / TOS_SECRET_KEY / TOS_BUCKET / TOS_ENDPOINT",
      );
    }

    const md5 = this.md5(buffer);
    const sha256 = this.sha256(buffer);
    const ext = opts.ext ?? "bin";
    const key = opts.key ?? this.contentAddressedKey(md5, ext);

    if (await this.objectExists(key)) {
      this.logger.debug(`TOS dedupe hit: ${key}`);
      return {
        key,
        url: this.publicUrl(key),
        md5,
        sha256,
        size: buffer.length,
        deduplicated: true,
      };
    }

    await this.client.putObject({
      bucket: this.bucket,
      key,
      body: buffer,
      contentType: opts.contentType,
    });

    return {
      key,
      url: this.publicUrl(key),
      md5,
      sha256,
      size: buffer.length,
      deduplicated: false,
    };
  }

  /**
   * Mirror remote URL into content-addressed TOS.
   * Skips download when:
   * 1) URL already points at our by-hash object
   * 2) remote HEAD exposes Content-MD5 / MD5 ETag and that object exists
   */
  async putFromUrl(
    url: string,
    ext = "png",
    opts?: { timeoutMs?: number },
  ): Promise<StoragePutResult> {
    const timeoutMs = opts?.timeoutMs ?? 180_000;
    const ownKey = this.keyFromPublicUrl(url);
    if (ownKey) {
      const meta = await this.headObjectMeta(ownKey);
      if (meta) {
        const md5FromKey = md5FromByHashKey(ownKey);
        this.logger.debug(`TOS mirror skip (own URL): ${ownKey}`);
        return {
          key: ownKey,
          url: this.publicUrl(ownKey),
          md5: md5FromKey ?? meta.md5 ?? "",
          sha256: "",
          size: meta.size,
          deduplicated: true,
          skippedDownload: true,
        };
      }
    }

    const remoteHint = await this.probeRemoteFingerprint(url, timeoutMs);
    if (remoteHint?.md5) {
      const key = this.contentAddressedKey(remoteHint.md5, ext);
      const meta = await this.headObjectMeta(key);
      if (meta) {
        this.logger.debug(`TOS mirror skip (Content-MD5): ${key}`);
        return {
          key,
          url: this.publicUrl(key),
          md5: remoteHint.md5,
          sha256: "",
          size: meta.size || remoteHint.size || 0,
          deduplicated: true,
          skippedDownload: true,
        };
      }
    }

    const buffer = await this.downloadUrl(url, timeoutMs);
    const contentType = buffer.contentType;
    return this.putObject(buffer.body, { contentType, ext });
  }

  /** List all objects under uploads/by-hash/ (paginated). */
  async listByHashObjects(
    opts: { maxKeys?: number } = {},
  ): Promise<StorageObjectSummary[]> {
    if (!this.client || !this.bucket) return [];
    const out: StorageObjectSummary[] = [];
    const hardCap = Math.min(Math.max(opts.maxKeys ?? 50_000, 1), 200_000);
    let continuationToken: string | undefined;
    do {
      const res = await this.client.listObjectsType2({
        bucket: this.bucket,
        prefix: "uploads/by-hash/",
        maxKeys: Math.min(1000, hardCap - out.length),
        continuationToken,
        listOnlyOnce: true,
      });
      const data = res.data;
      for (const item of data.Contents ?? []) {
        if (!item.Key) continue;
        out.push({
          key: item.Key,
          size: item.Size ?? 0,
          lastModified: item.LastModified,
        });
        if (out.length >= hardCap) return out;
      }
      if (!data.IsTruncated) break;
      continuationToken = data.NextContinuationToken;
    } while (continuationToken);
    return out;
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException("TOS 未配置");
    }
    await this.client.deleteObject({ bucket: this.bucket, key });
  }

  async deleteObjects(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const key of keys) {
      try {
        await this.deleteObject(key);
        deleted.push(key);
      } catch (error) {
        this.logger.warn(
          `TOS delete failed ${key}: ${error instanceof Error ? error.message : error}`,
        );
        failed.push(key);
      }
    }
    return { deleted, failed };
  }

  /**
   * Provider CDNs (ToAPIs / Qiniu) often reset undici `fetch` mid-body on
   * multi-megabyte files. Axios completes those downloads; retry transients.
   */
  private async downloadUrl(url: string, timeoutMs: number) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await axios.get<ArrayBuffer>(url, {
          responseType: "arraybuffer",
          timeout: timeoutMs,
          maxContentLength: 200 * 1024 * 1024,
          maxBodyLength: 200 * 1024 * 1024,
          maxRedirects: 3,
          headers: { "Accept-Encoding": "identity" },
          validateStatus: () => true,
        });
        if (res.status < 200 || res.status >= 300) {
          const error = new Error(`Failed to download asset: ${res.status}`);
          if (res.status >= 500 || res.status === 429) throw error;
          throw Object.assign(error, { permanent: true });
        }
        const body = Buffer.from(res.data);
        if (!body.length) throw new Error("Failed to download asset: empty body");
        const rawType = res.headers["content-type"];
        const contentType =
          typeof rawType === "string" ? rawType.split(";")[0]?.trim() : undefined;
        return { body, contentType };
      } catch (error) {
        lastError = error;
        if (
          error &&
          typeof error === "object" &&
          "permanent" in error &&
          (error as { permanent?: boolean }).permanent
        ) {
          throw error instanceof Error ? error : new Error(String(error));
        }
        const message = error instanceof Error ? error.message : String(error);
        const code =
          axios.isAxiosError(error) && error.code ? error.code : "";
        const transient =
          code === "ECONNABORTED" ||
          code === "ECONNRESET" ||
          code === "ETIMEDOUT" ||
          /terminated|socket|aborted|ECONNRESET|Failed to download asset: 5|Failed to download asset: 429|empty body/i.test(
            message,
          );
        if (!transient || attempt === 2) {
          if (code === "ECONNABORTED") {
            throw new Error(`Download asset timed out after ${timeoutMs}ms`);
          }
          throw error instanceof Error ? error : new Error(message);
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  /** Best-effort HEAD for Content-MD5 / ETag without downloading the body. */
  private async probeRemoteFingerprint(
    url: string,
    timeoutMs: number,
  ): Promise<{ md5?: string; size?: number } | null> {
    try {
      const res = await axios.head(url, {
        timeout: Math.min(timeoutMs, 30_000),
        maxRedirects: 3,
        headers: { "Accept-Encoding": "identity" },
        validateStatus: () => true,
      });
      if (res.status < 200 || res.status >= 300) return null;
      const md5 = normalizeMd5(
        res.headers["content-md5"] ?? res.headers.etag,
      );
      const size = Number(res.headers["content-length"] ?? 0);
      return {
        ...(md5 ? { md5 } : {}),
        ...(Number.isFinite(size) && size > 0 ? { size } : {}),
      };
    } catch {
      return null;
    }
  }

  publicUrl(key: string) {
    if (this.publicBase) {
      return `${this.publicBase.replace(/\/$/, "")}/${key}`;
    }
    const endpoint = this.endpoint || "tos-cn-beijing.volces.com";
    return `https://${this.bucket}.${endpoint}/${key}`;
  }
}

function md5FromByHashKey(key: string): string | null {
  const m = key.match(/^uploads\/by-hash\/([a-f0-9]{32})\./i);
  return m?.[1]?.toLowerCase() ?? null;
}

/** Accept hex MD5, quoted ETag hex, or base64 Content-MD5. */
function normalizeMd5(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  let value = raw.trim().replace(/^"|"$/g, "");
  if (/^[a-f0-9]{32}$/i.test(value)) return value.toLowerCase();
  // Weak ETag prefix
  if (value.startsWith("W/")) {
    value = value.slice(2).replace(/^"|"$/g, "");
    if (/^[a-f0-9]{32}$/i.test(value)) return value.toLowerCase();
  }
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length === 16) return buf.toString("hex");
  } catch {
    /* ignore */
  }
  return undefined;
}
