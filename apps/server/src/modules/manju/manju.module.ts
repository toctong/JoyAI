import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ManjuProject } from "../../database/entities/manju-project.entity";
import { ManjuFolder } from "../../database/entities/manju-folder.entity";
import { ManjuService } from "./manju.service";
import {
  ManjuController,
  ManjuFoldersController,
  ManjuLibraryController,
} from "./manju.controller";

@Module({
  imports: [TypeOrmModule.forFeature([ManjuProject, ManjuFolder])],
  controllers: [ManjuLibraryController, ManjuFoldersController, ManjuController],
  providers: [ManjuService],
  exports: [ManjuService],
})
export class ManjuModule {}
