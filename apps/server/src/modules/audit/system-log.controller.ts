import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { SystemLogService } from "./system-log.service";

@ApiTags("system-logs")
@ApiBearerAuth()
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/system-logs")
export class SystemLogController {
  constructor(private readonly logs: SystemLogService) {}

  @Get()
  list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
    @Query("level") level?: string,
    @Query("source") source?: string,
  ) {
    return this.logs.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      keyword,
      level,
      source,
    });
  }

  @Get("sources")
  sources() {
    return this.logs.listSources();
  }
}
