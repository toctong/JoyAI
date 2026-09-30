import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, ValidateIf } from "class-validator";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { ManjuService } from "./manju.service";
import { ManjuJianyingService } from "./manju-jianying.service";

class CreateManjuDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  folderId?: string | null;
}

class UpdateManjuDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  draft?: unknown;
}

class CreateFolderDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  parentId?: string | null;
}

class UpdateFolderDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  parentId?: string | null;
}

class BatchIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

class BatchMoveDto extends BatchIdsDto {
  @ValidateIf((_, v) => v !== null)
  @IsString()
  folderId!: string | null;
}

class ScriptReviewDto {
  @IsString()
  content!: string;
}

@ApiTags("manju")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("manju")
export class ManjuLibraryController {
  constructor(private readonly manju: ManjuService) {}

  @Get("library")
  library(
    @CurrentUser() user: AuthUser,
    @Query("folderId") folderId?: string,
  ) {
    return this.manju.library(user.id, folderId || null);
  }
}

@ApiTags("manju")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("manju/folders")
export class ManjuFoldersController {
  constructor(private readonly manju: ManjuService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.manju.listFolders(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFolderDto) {
    return this.manju.createFolder(user.id, dto.title, dto.parentId);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.manju.updateFolder(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.deleteFolder(user.id, id);
  }
}

@ApiTags("manju")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("manju/projects")
export class ManjuController {
  constructor(
    private readonly manju: ManjuService,
    private readonly jianying: ManjuJianyingService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("take") take?: string,
  ) {
    const limit = take != null && take !== "" ? Number(take) : undefined;
    const opts =
      limit != null && Number.isFinite(limit) ? { take: limit } : undefined;
    return this.manju.list(user.id, opts);
  }

  @Post("batch-move")
  batchMove(@CurrentUser() user: AuthUser, @Body() dto: BatchMoveDto) {
    return this.manju.moveProjects(user.id, dto.ids, dto.folderId);
  }

  @Post("batch-delete")
  batchDelete(@CurrentUser() user: AuthUser, @Body() dto: BatchIdsDto) {
    return this.manju.deleteProjects(user.id, dto.ids);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateManjuDto) {
    return this.manju.create(user.id, dto.title, dto.folderId);
  }

  @Get(":id/script-chat")
  scriptChat(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.getScriptChat(user.id, id);
  }

  @Put(":id/script-chat")
  saveScriptChat(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.manju.saveScriptChat(user.id, id, body);
  }

  @Get(":id/agent-chat")
  agentChat(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.getAgentChat(user.id, id);
  }

  @Put(":id/agent-chat")
  saveAgentChat(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.manju.saveAgentChat(user.id, id, body);
  }

  @Get(":id/workflow")
  workflow(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.getWorkflowSummary(user.id, id);
  }

  @Get(":id/script-review")
  scriptReview(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.getScriptReview(user.id, id);
  }

  @Put(":id/script-review")
  saveScriptReview(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ScriptReviewDto,
  ) {
    return this.manju.saveScriptReviewContent(user.id, id, dto.content);
  }

  @Post(":id/script-review/confirm")
  confirmScriptReview(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.confirmScriptReview(user.id, id);
  }

  @Get(":id/export/jianying")
  @Header("Content-Type", "application/zip")
  async exportJianying(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("episodeId") episodeId?: string,
  ) {
    const { buffer, filename } = await this.jianying.buildZip(
      user.id,
      id,
      episodeId || undefined,
    );
    const asciiName = filename.replace(/[^\w.-]+/g, "_") || "manju_jianying.zip";
    return new StreamableFile(buffer, {
      type: "application/zip",
      disposition: `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.get(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateManjuDto,
  ) {
    return this.manju.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.remove(user.id, id);
  }
}
