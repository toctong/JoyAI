import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Channel } from "../../database/entities/channel.entity";
import { Model } from "../../database/entities/model.entity";
import { ChannelsService } from "./channels.service";
import { ChannelsController } from "./channels.controller";
import { ModelsModule } from "../models/models.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, Model]),
    forwardRef(() => ModelsModule),
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
