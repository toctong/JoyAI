import { Module } from "@nestjs/common";
import { ChangelogController } from "./changelog.controller";
import { ChangelogService } from "./changelog.service";

@Module({
  controllers: [ChangelogController],
  providers: [ChangelogService],
})
export class ChangelogModule {}
