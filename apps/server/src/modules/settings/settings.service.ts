import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@dataui/crud-typeorm";
import { Repository } from "typeorm";
import {
  AppSetting,
  unwrapSettingValue,
  wrapSettingValue,
} from "../../database/entities/app-setting.entity";
import { newId } from "../../database/id";
import {
  EXPLORE_MARKET_PROXY_SETTING_KEY,
  invalidateMarketProxy,
} from "../explore/explore-market-proxy";

export const GITHUB_OWNER_SETTING_KEY = "github.owner";
export const GITHUB_REPO_SETTING_KEY = "github.repo";
export const GITHUB_TOKEN_SETTING_KEY = "github.token";

const GITHUB_SETTING_KEYS = new Set([
  GITHUB_OWNER_SETTING_KEY,
  GITHUB_REPO_SETTING_KEY,
  GITHUB_TOKEN_SETTING_KEY,
]);

/** Admin 表单 key → 环境变量；库无记录时回填，便于看出 .env 是否已配 */
const ENV_SETTING_FALLBACKS: Array<{ key: string; env: string }> = [
  { key: "tos.accessKey", env: "TOS_ACCESS_KEY" },
  { key: "tos.secretKey", env: "TOS_SECRET_KEY" },
  { key: "tos.endpoint", env: "TOS_ENDPOINT" },
  { key: "tos.region", env: "TOS_REGION" },
  { key: "tos.bucket", env: "TOS_BUCKET" },
  { key: "tos.publicBaseUrl", env: "TOS_PUBLIC_BASE_URL" },
  { key: EXPLORE_MARKET_PROXY_SETTING_KEY, env: "EXPLORE_MARKET_PROXY" },
  { key: GITHUB_OWNER_SETTING_KEY, env: "GITHUB_OWNER" },
  { key: GITHUB_REPO_SETTING_KEY, env: "GITHUB_REPO" },
  { key: GITHUB_TOKEN_SETTING_KEY, env: "GITHUB_TOKEN" },
];

type SettingInvalidate = (key: string) => void;
let onSettingInvalidate: SettingInvalidate | null = null;

/** Changelog / other modules can flush caches when related keys change. */
export function configureSettingInvalidate(fn: SettingInvalidate) {
  onSettingInvalidate = fn;
}

export type SettingListItem = {
  key: string;
  value: unknown;
  /** true = 仅来自环境变量，尚未写入 app_setting */
  fromEnv?: boolean;
};

@Injectable()
export class SettingsService
  extends TypeOrmCrudService<AppSetting>
  implements OnModuleInit
{
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(AppSetting) repo: Repository<AppSetting>,
    private readonly config: ConfigService,
  ) {
    super(repo);
  }

  async onModuleInit() {
    // MySQL JSON + mysql2 double-parse → 500 on string settings. Force TEXT.
    try {
      await this.repo.query(
        "ALTER TABLE `app_setting` MODIFY COLUMN `value` TEXT NULL",
      );
    } catch (err) {
      this.logger.warn(
        `app_setting.value → TEXT skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async get(key: string) {
    try {
      return await this.repo.findOne({ where: { key } });
    } catch (err) {
      this.logger.warn(
        `findOne(${key}) failed, raw fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this.getRaw(key);
    }
  }

  private async getRaw(key: string): Promise<AppSetting | null> {
    const rows = (await this.repo.query(
      "SELECT `id`, `key`, `value`, `updatedAt` FROM `app_setting` WHERE `key` = ? LIMIT 1",
      [key],
    )) as Array<{
      id: string;
      key: string;
      value: unknown;
      updatedAt: Date;
    }>;
    const row = rows[0];
    if (!row) return null;
    const entity = this.repo.create({
      id: row.id,
      key: row.key,
      value: unwrapSettingValue(row.value),
      updatedAt: row.updatedAt,
    });
    return entity;
  }

  async set(key: string, value: unknown) {
    try {
      const existing = await this.get(key);
      let saved: AppSetting;
      if (existing) {
        existing.value = value;
        saved = await this.repo.save(existing);
      } else {
        saved = await this.repo.save(this.repo.create({ key, value }));
      }
      this.afterSet(key);
      return saved;
    } catch (err) {
      this.logger.warn(
        `save(${key}) failed, raw upsert: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      try {
        return await this.setRaw(key, value);
      } catch (rawErr) {
        const msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
        throw new InternalServerErrorException(
          `保存设置失败 (${key}): ${msg}`,
        );
      }
    }
  }

  private afterSet(key: string) {
    if (key === EXPLORE_MARKET_PROXY_SETTING_KEY) {
      invalidateMarketProxy("settings updated");
    }
    if (GITHUB_SETTING_KEYS.has(key)) {
      onSettingInvalidate?.(key);
    }
  }

  private async setRaw(key: string, value: unknown): Promise<AppSetting> {
    const encoded =
      value === null || value === undefined
        ? null
        : JSON.stringify(wrapSettingValue(value));
    const existing = await this.getRaw(key);
    if (existing) {
      await this.repo.query(
        "UPDATE `app_setting` SET `value` = ?, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `key` = ?",
        [encoded, key],
      );
      existing.value = value;
      this.afterSet(key);
      return existing;
    }
    const id = newId();
    await this.repo.query(
      "INSERT INTO `app_setting` (`id`, `key`, `value`, `updatedAt`) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))",
      [id, key, encoded],
    );
    this.afterSet(key);
    return this.repo.create({ id, key, value, updatedAt: new Date() });
  }

  /** Prefer app_setting row, else env fallback. */
  async resolveString(
    key: string,
    envKeys: string | string[],
  ): Promise<string> {
    const row = await this.get(key);
    const raw = row?.value;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (raw != null && typeof raw !== "object") {
      const s = String(raw).trim();
      if (s) return s;
    }
    for (const env of Array.isArray(envKeys) ? envKeys : [envKeys]) {
      const fromEnv = String(this.config.get<string>(env) ?? "").trim();
      if (fromEnv) return fromEnv;
    }
    return "";
  }

  async list(): Promise<SettingListItem[]> {
    let rows: AppSetting[];
    try {
      rows = await this.repo.find({ order: { key: "ASC" } });
    } catch (err) {
      this.logger.warn(
        `list() failed, raw fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const rawRows = (await this.repo.query(
        "SELECT `id`, `key`, `value`, `updatedAt` FROM `app_setting` ORDER BY `key` ASC",
      )) as Array<{
        id: string;
        key: string;
        value: unknown;
        updatedAt: Date;
      }>;
      rows = rawRows.map((row) =>
        this.repo.create({
          id: row.id,
          key: row.key,
          value: unwrapSettingValue(row.value),
          updatedAt: row.updatedAt,
        }),
      );
    }

    const byKey = new Map(rows.map((r) => [r.key, r] as const));
    const out: SettingListItem[] = rows.map((r) => ({
      key: r.key,
      value: r.value,
    }));

    for (const { key, env } of ENV_SETTING_FALLBACKS) {
      if (byKey.has(key)) continue;
      const fromEnv = String(this.config.get<string>(env) ?? "").trim();
      if (!fromEnv) continue;
      out.push({ key, value: fromEnv, fromEnv: true });
    }

    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }
}