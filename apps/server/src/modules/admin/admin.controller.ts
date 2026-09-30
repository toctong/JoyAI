import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { UserRole } from "../../database/enums";
import { UsersService } from "../users/users.service";
import { JobsService } from "../jobs/jobs.service";
import { StorageGcSweeper } from "../storage/storage-gc.sweeper";
import { StorageService } from "../storage/storage.service";
import { SystemLogService } from "../audit/system-log.service";

class CreateUserDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

class PatchUserDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

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
    private readonly systemLogs: SystemLogService,
  ) {}

  @Get("users")
  usersList() {
    return this.users.list();
  }

  @Post("users")
  async createUser(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateUserDto,
  ) {
    const user = await this.users.create(
      dto.username.trim(),
      dto.password,
      dto.role ?? UserRole.creator,
    );
    this.systemLogs.info("admin", `创建用户 ${user.username}`, {
      userId: actor.id,
      context: { targetId: user.id, role: user.role },
    });
    return this.users.toPublic(user);
  }

  @Patch("users/:id")
  async patchUser(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: PatchUserDto,
  ) {
    if (dto.role == null && dto.password == null) {
      throw new BadRequestException("请提供 role 或 password");
    }
    let result = await this.users
      .require(id)
      .then((u) => this.users.toPublic(u));
    if (dto.role != null) {
      result = await this.users.updateRole(id, dto.role, actor.id);
      this.systemLogs.info("admin", `修改用户角色 → ${dto.role}`, {
        userId: actor.id,
        context: { targetId: id, role: dto.role },
      });
    }
    if (dto.password != null) {
      result = await this.users.resetPassword(id, dto.password);
      this.systemLogs.warn("admin", "管理员重置用户密码", {
        userId: actor.id,
        context: { targetId: id },
      });
    }
    return result;
  }

  @Delete("users/:id")
  async removeUser(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    const target = await this.users.require(id);
    const res = await this.users.removeUser(id, actor.id);
    this.systemLogs.warn("admin", `删除用户 ${target.username}`, {
      userId: actor.id,
      context: { targetId: id, username: target.username },
    });
    return res;
  }

  @Get("jobs")
  jobsList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("take") take?: string,
    @Query("keyword") keyword?: string,
    @Query("status") status?: string,
    @Query("kind") kind?: string,
  ) {
    return this.jobs.listAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      take: take ? Number(take) : undefined,
      keyword,
      status,
      kind,
    });
  }

  @Get("jobs/:id")
  jobDetail(@Param("id") id: string) {
    return this.jobs.getAdmin(id);
  }

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
