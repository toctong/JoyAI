import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditLog } from "../../database/entities/audit-log.entity";
import { SystemLog } from "../../database/entities/system-log.entity";
import { User } from "../../database/entities/user.entity";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { SystemLogService } from "./system-log.service";
import { SystemLogController } from "./system-log.controller";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, SystemLog, User])],
  controllers: [AuditController, SystemLogController],
  providers: [AuditService, SystemLogService],
  exports: [AuditService, SystemLogService],
})
export class AuditModule {}
