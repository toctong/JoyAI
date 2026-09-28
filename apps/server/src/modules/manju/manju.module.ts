import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ManjuProject } from "../../database/entities/manju-project.entity";
import { ManjuFolder } from "../../database/entities/manju-folder.entity";
import { ProjectChat } from "../../database/entities/project-chat.entity";
import { ManjuService } from "./manju.service";
import { ManjuJianyingService } from "./manju-jianying.service";
import {
  ManjuController,
  ManjuFoldersController,
  ManjuLibraryController,
} from "./manju.controller";

@Module({
  imports: [TypeOrmModule.forFeature([ManjuProject, ManjuFolder, ProjectChat])],
  controllers: [ManjuLibraryController, ManjuFoldersController, ManjuController],
  providers: [ManjuService, ManjuJianyingService],
  exports: [ManjuService, ManjuJianyingService],
})
export class ManjuModule {}
