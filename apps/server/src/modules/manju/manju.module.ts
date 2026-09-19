import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ManjuProject } from "../../database/entities/manju-project.entity";
import { ManjuService } from "./manju.service";
import { ManjuController } from "./manju.controller";

@Module({
  imports: [TypeOrmModule.forFeature([ManjuProject])],
  controllers: [ManjuController],
  providers: [ManjuService],
  exports: [ManjuService],
})
export class ManjuModule {}
