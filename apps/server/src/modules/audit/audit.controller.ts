import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@ApiBearerAuth()
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
    @Query("action") action?: string,
  ) {
    return this.audit.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      keyword,
      action,
    });
  }
}
