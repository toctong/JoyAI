import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TosClient } from "@volcengine/tos-sdk";
import * as crypto from "crypto";

export interface StoragePutResult {
  key: string;
  url: string;
  /** MD5 hex，内容指纹（去重主键） */
  md5: string;
  /** SHA-256 hex，备用指纹 */
  sha256: string;
  size: number;
  /** 对象已存在于 TOS，本次未实际上传 */
  deduplicated: boolean;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: TosClient | null = null;
  private bucket = "";
  private publicBase = "";

  constructor(private readonly config: ConfigService) {
    const accessKey = config.get<string>("TOS_ACCESS_KEY");
    const secretKey = config.get<string>("TOS_SECRET_KEY");
    const endpoint = config.get<string>("TOS_ENDPOINT");
    const region = config.get<string>("TOS_REGION") ?? "cn-beijing";
    this.bucket = config.get<string>("TOS_BUCKET") ?? "";
    this.publicBase = config.get<string>("TOS_PUBLIC_BASE_URL") ?? "";

    if (accessKey && secretKey && endpoint && this.bucket) {
      this.client = new TosClient({
        accessKeyId: accessKey,
        accessKeySecret: secretKey,
        region,
        endpoint,
      });
    } else {
      this.logger.warn("TOS not fully configured; uploads will fail until set");
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

  async objectExists(key: string): Promise<boolean> {
    if (!this.client || !this.bucket) return false;
    try {
      await this.client.headObject({ bucket: this.bucket, key });
      return true;
    } catch {
      return false;
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
        "TOS 未配置，请设置 TOS_ACCESS_KEY / TOS_SECRET_KEY / TOS_BUCKET / TOS_ENDPOINT",
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

  async putFromUrl(
    url: string,
    ext = "png",
    opts?: { timeoutMs?: number },
  ): Promise<StoragePutResult> {
    const timeoutMs = opts?.timeoutMs ?? 180_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to download asset: ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const contentType = res.headers.get("content-type") ?? undefined;
      return this.putObject(buffer, { contentType, ext });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Download asset timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  publicUrl(key: string) {
    if (this.publicBase) {
      return `${this.publicBase.replace(/\/$/, "")}/${key}`;
    }
    const endpoint =
      this.config.get<string>("TOS_ENDPOINT") ?? "tos-cn-beijing.volces.com";
    return `https://${this.bucket}.${endpoint}/${key}`;
  }
}
