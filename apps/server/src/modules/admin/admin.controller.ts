import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { UsersService } from "../users/users.service";
import { JobsService } from "../jobs/jobs.service";

@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly jobs: JobsService,
  ) {}

  @Get("users")
  usersList() {
    return this.users.list();
  }

  @Get("jobs")
  jobsList(@Query("take") take?: string) {
    return this.jobs.listAll(take ? Number(take) : 100);
  }

  @Get("jobs/:id")
  jobDetail(@Param("id") id: string) {
    return this.jobs.getAdmin(id);
  }
}
