import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { QUEUE } from "@joyai/shared";
import { Job } from "../../database/entities/job.entity";
import { Model } from "../../database/entities/model.entity";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { ImageProcessor } from "./processors/image.processor";
import { VideoSubmitProcessor } from "./processors/video-submit.processor";
import { VideoPollProcessor } from "./processors/video-poll.processor";
import { AssetMirrorProcessor } from "./processors/asset-mirror.processor";
import { JobTimeoutSweeper } from "./job-timeout.sweeper";
import { ChannelsModule } from "../channels/channels.module";
import { AssetsModule } from "../assets/assets.module";
import { StorageModule } from "../storage/storage.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CanvasModule } from "../canvas/canvas.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, Model]),
    BullModule.registerQueue(
      { name: QUEUE.IMAGE },
      { name: QUEUE.VIDEO_SUBMIT },
      { name: QUEUE.VIDEO_POLL },
      { name: QUEUE.ASSET_MIRROR },
    ),
    ChannelsModule,
    AssetsModule,
    StorageModule,
    RealtimeModule,
    CanvasModule,
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    ImageProcessor,
    VideoSubmitProcessor,
    VideoPollProcessor,
    AssetMirrorProcessor,
    JobTimeoutSweeper,
  ],
  exports: [JobsService],
})
export class JobsModule {}
