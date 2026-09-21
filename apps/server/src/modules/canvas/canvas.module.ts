import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CanvasFolder } from "../../database/entities/canvas-folder.entity";
import { CanvasProject } from "../../database/entities/canvas-project.entity";
import { ProjectChat } from "../../database/entities/project-chat.entity";
import { CanvasService } from "./canvas.service";
import {
  CanvasController,
  CanvasFoldersController,
  CanvasLibraryController,
} from "./canvas.controller";

@Module({
  imports: [TypeOrmModule.forFeature([CanvasFolder, CanvasProject, ProjectChat])],
  controllers: [
    CanvasLibraryController,
    CanvasFoldersController,
    CanvasController,
  ],
  providers: [CanvasService],
  exports: [CanvasService],
})
export class CanvasModule {}
