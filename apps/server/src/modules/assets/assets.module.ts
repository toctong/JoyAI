import { Module, forwardRef } from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { AssetsController } from "./assets.controller";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [forwardRef(() => StorageModule)],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
