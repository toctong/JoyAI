import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards";
import { ChangelogService } from "./changelog.service";

@ApiTags("changelog")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("changelog")
export class ChangelogController {
  constructor(private readonly changelog: ChangelogService) {}

  @Get("commits")
  list(
    @Query("page") page?: string,
    @Query("perPage") perPage?: string,
  ) {
    return this.changelog.listCommits(
      page ? Number(page) : 1,
      perPage ? Number(perPage) : 30,
    );
  }
}
