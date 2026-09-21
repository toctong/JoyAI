import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { UsersService } from "../users/users.service";
import { JobsService } from "../jobs/jobs.service";
import { StorageGcSweeper } from "../storage/storage-gc.sweeper";
import { StorageService } from "../storage/storage.service";

@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly storageGc: StorageGcSweeper,
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

  /**
   * Scan TOS uploads/by-hash for objects not referenced by any Asset.
   * Default dry-run — does not delete.
   */
  @Get("storage/gc")
  async storageGcPreview() {
    if (!this.storage.isConfigured()) {
      return {
        configured: false,
        scanned: 0,
        candidates: [],
        referencedKeys: 0,
        dryRun: true,
        bytesCandidate: 0,
      };
    }
    const report = await this.storageGc.sweep({ dryRun: true });
    return {
      configured: true,
      ...report,
      candidates: report.candidates.slice(0, 200),
      candidateCount: report.candidates.length,
    };
  }

  /**
   * Delete unreferenced by-hash objects. Requires confirm=1.
   */
  @Post("storage/gc")
  async storageGcDelete(@Query("confirm") confirm?: string) {
    if (confirm !== "1" && confirm !== "true") {
      throw new BadRequestException(
        "危险操作：请传 confirm=1 确认删除未引用对象",
      );
    }
    if (!this.storage.isConfigured()) {
      throw new BadRequestException("TOS 未配置");
    }
    const report = await this.storageGc.sweep({ delete: true });
    return {
      configured: true,
      ...report,
      candidates: report.candidates.slice(0, 200),
      candidateCount: report.candidates.length,
    };
  }
}
