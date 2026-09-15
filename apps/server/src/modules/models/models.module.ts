import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Channel } from "../../database/entities/channel.entity";
import { Model } from "../../database/entities/model.entity";
import { ModelsService } from "./models.service";
import { ModelsController } from "./models.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Model, Channel])],
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
