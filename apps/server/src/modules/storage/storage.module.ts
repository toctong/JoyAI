import { Module, forwardRef } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { UploadController } from "./upload.controller";
import { AssetsModule } from "../assets/assets.module";

@Module({
  imports: [forwardRef(() => AssetsModule)],
  controllers: [UploadController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
