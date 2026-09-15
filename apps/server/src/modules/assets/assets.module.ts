import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Asset } from "../../database/entities/asset.entity";
import { AssetsService } from "./assets.service";
import { AssetsController } from "./assets.controller";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Asset]),
    forwardRef(() => StorageModule),
  ],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
