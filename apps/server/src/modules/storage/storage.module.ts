import { Module, forwardRef } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { StorageGcSweeper } from "./storage-gc.sweeper";
import { UploadController } from "./upload.controller";
import { AssetsModule } from "../assets/assets.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [forwardRef(() => AssetsModule), SettingsModule],
  controllers: [UploadController],
  providers: [StorageService, StorageGcSweeper],
  exports: [StorageService, StorageGcSweeper],
})
export class StorageModule {}
