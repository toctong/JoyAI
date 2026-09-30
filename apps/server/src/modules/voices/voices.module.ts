import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TtsVoice } from "../../database/entities/tts-voice.entity";
import { Channel } from "../../database/entities/channel.entity";
import { Model } from "../../database/entities/model.entity";
import { ChannelsModule } from "../channels/channels.module";
import { StorageModule } from "../storage/storage.module";
import { VoicesService } from "./voices.service";
import { VoicesController } from "./voices.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([TtsVoice, Channel, Model]),
    ChannelsModule,
    StorageModule,
  ],
  controllers: [VoicesController],
  providers: [VoicesService],
  exports: [VoicesService],
})
export class VoicesModule {}
