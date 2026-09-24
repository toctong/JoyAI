import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { JobsService } from "./jobs.service";

@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.jobs.create(user.id, body);
  }

  /** Local edits (crop / trim / …) — upload first, then register as succeeded job. */
  @Post("local")
  createLocal(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.jobs.createLocal(user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("take") take?: string,
    @Query("before") before?: string,
    @Query("beforeId") beforeId?: string,
    @Query("scope") scope?: string,
    @Query("canvasProjectId") canvasProjectId?: string,
    @Query("manjuProjectId") manjuProjectId?: string,
    @Query("toolSlug") toolSlug?: string,
  ) {
    return this.jobs.list(user.id, {
      take: take ? Number(take) : 30,
      before,
      beforeId,
      scope,
      canvasProjectId,
      manjuProjectId,
      toolSlug,
    });
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.jobs.get(user.id, id);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.jobs.cancel(user.id, id);
  }

  /** Remove one output asset from a job (e.g. 切图单格删除). */
  @Delete(":id/assets/:assetId")
  removeAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
  ) {
    return this.jobs.removeAsset(user.id, id, assetId);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.jobs.remove(user.id, id);
  }
}
