import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { ExploreController } from "./explore.controller";
import { ExploreFeedWarmer } from "./explore-feed-warmer";
import { ExploreService } from "./explore.service";

@Module({
  imports: [SettingsModule],
  controllers: [ExploreController],
  providers: [ExploreService, ExploreFeedWarmer],
})
export class ExploreModule {}
