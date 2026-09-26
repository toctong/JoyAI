import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CameraMove } from "../../database/entities/camera-move.entity";
import { CameraMovesService } from "./camera-moves.service";
import { CameraMovesController } from "./camera-moves.controller";

@Module({
  imports: [TypeOrmModule.forFeature([CameraMove])],
  controllers: [CameraMovesController],
  providers: [CameraMovesService],
  exports: [CameraMovesService],
})
export class CameraMovesModule {}
