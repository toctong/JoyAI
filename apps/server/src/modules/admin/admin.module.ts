import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { UsersModule } from "../users/users.module";
import { JobsModule } from "../jobs/jobs.module";

@Module({
  imports: [UsersModule, JobsModule],
  controllers: [AdminController],
})
export class AdminModule {}
