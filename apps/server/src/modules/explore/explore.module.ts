import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { ExploreController } from "./explore.controller";
import { ExploreService } from "./explore.service";

@Module({
  imports: [SettingsModule],
  controllers: [ExploreController],
  providers: [ExploreService],
})
export class ExploreModule {}
