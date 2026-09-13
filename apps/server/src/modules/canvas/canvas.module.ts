import { Module } from "@nestjs/common";
import { CanvasService } from "./canvas.service";
import {
  CanvasController,
  CanvasFoldersController,
  CanvasLibraryController,
} from "./canvas.controller";

@Module({
  controllers: [
    CanvasLibraryController,
    CanvasFoldersController,
    CanvasController,
  ],
  providers: [CanvasService],
  exports: [CanvasService],
})
export class CanvasModule {}
