import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@dataui/crud-typeorm";
import { Repository } from "typeorm";
import { AppSetting } from "../../database/entities/app-setting.entity";

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
    if (existing) {
      existing.value = value;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ key, value }));
  }

  list() {
    return this.repo.find({ order: { key: "ASC" } });
  }
}
