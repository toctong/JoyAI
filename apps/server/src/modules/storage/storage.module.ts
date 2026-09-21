import { Module, forwardRef } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { StorageGcSweeper } from "./storage-gc.sweeper";
import { UploadController } from "./upload.controller";
import { AssetsModule } from "../assets/assets.module";

@Module({
  imports: [forwardRef(() => AssetsModule)],
  controllers: [UploadController],
  providers: [StorageService, StorageGcSweeper],
  exports: [StorageService, StorageGcSweeper],
})
export class StorageModule {}
