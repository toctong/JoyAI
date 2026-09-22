import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@dataui/crud-typeorm";
import { Repository } from "typeorm";
import { AppSetting } from "../../database/entities/app-setting.entity";
import {
  EXPLORE_MARKET_PROXY_SETTING_KEY,
  invalidateMarketProxy,
} from "../explore/explore-market-proxy";

/** Admin 表单 key → 环境变量；库无记录时回填，便于看出 .env 是否已配 */
const ENV_SETTING_FALLBACKS: Array<{ key: string; env: string }> = [
  { key: "tos.accessKey", env: "TOS_ACCESS_KEY" },
  { key: "tos.secretKey", env: "TOS_SECRET_KEY" },
  { key: "tos.endpoint", env: "TOS_ENDPOINT" },
  { key: "tos.region", env: "TOS_REGION" },
  { key: "tos.bucket", env: "TOS_BUCKET" },
  { key: "tos.publicBaseUrl", env: "TOS_PUBLIC_BASE_URL" },
  { key: EXPLORE_MARKET_PROXY_SETTING_KEY, env: "EXPLORE_MARKET_PROXY" },
];

export type SettingListItem = {
  key: string;
  value: unknown;
  /** true = 仅来自环境变量，尚未写入 app_setting */
  fromEnv?: boolean;
};

@Injectable()
export class SettingsService extends TypeOrmCrudService<AppSetting> {
  constructor(
    @InjectRepository(AppSetting) repo: Repository<AppSetting>,
    private readonly config: ConfigService,
  ) {
    super(repo);
  }

  async get(key: string) {
    return this.repo.findOne({ where: { key } });
  }

  async set(key: string, value: unknown) {
    const existing = await this.repo.findOne({ where: { key } });
    let saved: AppSetting;
    if (existing) {
      existing.value = value;
      saved = await this.repo.save(existing);
    } else {
      saved = await this.repo.save(this.repo.create({ key, value }));
    }
    if (key === EXPLORE_MARKET_PROXY_SETTING_KEY) {
      invalidateMarketProxy("settings updated");
    }
    return saved;
  }

  async list(): Promise<SettingListItem[]> {
    const rows = await this.repo.find({ order: { key: "ASC" } });
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
