import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { UsersModule } from "../users/users.module";
import { JobsModule } from "../jobs/jobs.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [UsersModule, JobsModule, StorageModule],
  controllers: [AdminController],
})
export class AdminModule {}
