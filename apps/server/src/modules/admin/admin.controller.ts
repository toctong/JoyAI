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
  ) {}

  @Get("users")
  usersList() {
    return this.users.list();
  }

  @Post("users")
  async createUser(@Body() dto: CreateUserDto) {
    const user = await this.users.create(
      dto.username.trim(),
      dto.password,
      dto.role ?? UserRole.creator,
    );
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
    }
    if (dto.password != null) {
      result = await this.users.resetPassword(id, dto.password);
    }
    return result;
  }

  @Delete("users/:id")
  removeUser(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.users.removeUser(id, actor.id);
  }

  @Get("jobs")
  jobsList(@Query("take") take?: string) {
    return this.jobs.listAll(take ? Number(take) : 100);
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
