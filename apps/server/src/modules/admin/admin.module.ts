import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { UsersModule } from "../users/users.module";
import { JobsModule } from "../jobs/jobs.module";
import { StorageModule } from "../storage/storage.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [UsersModule, JobsModule, StorageModule, AuditModule],
  controllers: [AdminController],
})
export class AdminModule {}
