import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TosClient } from "@volcengine/tos-sdk";
import axios from "axios";
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
    const buffer = await this.downloadUrl(url, timeoutMs);
    const contentType = buffer.contentType;
    return this.putObject(buffer.body, { contentType, ext });
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

  publicUrl(key: string) {
    if (this.publicBase) {
      return `${this.publicBase.replace(/\/$/, "")}/${key}`;
    }
    const endpoint =
      this.config.get<string>("TOS_ENDPOINT") ?? "tos-cn-beijing.volces.com";
    return `https://${this.bucket}.${endpoint}/${key}`;
  }
}
