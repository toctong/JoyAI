import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { ChangelogController } from "./changelog.controller";
import { ChangelogService } from "./changelog.service";

@Module({
  imports: [SettingsModule],
  controllers: [ChangelogController],
  providers: [ChangelogService],
})
export class ChangelogModule {}
