import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUE } from "@joyai/shared";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { ImageProcessor } from "./processors/image.processor";
import { VideoSubmitProcessor } from "./processors/video-submit.processor";
import { VideoPollProcessor } from "./processors/video-poll.processor";
import { ChannelsModule } from "../channels/channels.module";
import { AssetsModule } from "../assets/assets.module";
import { StorageModule } from "../storage/storage.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CanvasModule } from "../canvas/canvas.module";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE.IMAGE },
      { name: QUEUE.VIDEO_SUBMIT },
      { name: QUEUE.VIDEO_POLL },
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
  ],
  exports: [JobsService],
})
export class JobsModule {}
