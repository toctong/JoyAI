import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@dataui/crud-typeorm";
import { Repository } from "typeorm";
import { AppSetting } from "../../database/entities/app-setting.entity";
import {
  EXPLORE_MARKET_PROXY_SETTING_KEY,
  invalidateMarketProxy,
} from "../explore/explore-market-proxy";

@Injectable()
export class SettingsService extends TypeOrmCrudService<AppSetting> {
  constructor(
    @InjectRepository(AppSetting) repo: Repository<AppSetting>,
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

  list() {
    return this.repo.find({ order: { key: "ASC" } });
  }
}
