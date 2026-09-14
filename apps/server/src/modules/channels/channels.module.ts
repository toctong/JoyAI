import { Module, forwardRef } from "@nestjs/common";
import { ChannelsService } from "./channels.service";
import { ChannelsController } from "./channels.controller";
import { ModelsModule } from "../models/models.module";

@Module({
  imports: [forwardRef(() => ModelsModule)],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
