import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PromptPreset } from "../../database/entities/prompt-preset.entity";
import { CanvasModule } from "../canvas/canvas.module";
import { PromptPresetsService } from "./prompt-presets.service";
import { PromptPresetsController } from "./prompt-presets.controller";

@Module({
  imports: [TypeOrmModule.forFeature([PromptPreset]), CanvasModule],
  controllers: [PromptPresetsController],
  providers: [PromptPresetsService],
  exports: [PromptPresetsService],
})
export class PromptPresetsModule {}
