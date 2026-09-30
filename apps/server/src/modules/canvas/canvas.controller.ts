import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, ValidateIf } from "class-validator";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { CanvasService } from "./canvas.service";

class CreateCanvasDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  folderId?: string | null;

  @IsOptional()
  snapshot?: unknown;
}

class UpdateCanvasDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  snapshot?: unknown;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  folderId?: string | null;
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

@ApiTags("canvas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("canvas")
export class CanvasLibraryController {
  constructor(private readonly canvas: CanvasService) {}

  @Get("library")
  library(
    @CurrentUser() user: AuthUser,
    @Query("folderId") folderId?: string,
  ) {
    return this.canvas.library(user.id, folderId || null);
  }
}

@ApiTags("canvas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("canvas/folders")
export class CanvasFoldersController {
  constructor(private readonly canvas: CanvasService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.canvas.listFolders(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFolderDto) {
    return this.canvas.createFolder(user.id, dto.title, dto.parentId);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.canvas.updateFolder(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.canvas.deleteFolder(user.id, id);
  }
}

@ApiTags("canvas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("canvas/projects")
export class CanvasController {
  constructor(private readonly canvas: CanvasService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("folderId") folderId?: string,
    @Query("take") take?: string,
  ) {
    const limit = take != null && take !== "" ? Number(take) : undefined;
    const opts =
      limit != null && Number.isFinite(limit) ? { take: limit } : undefined;
    if (folderId === undefined) return this.canvas.list(user.id, undefined, opts);
    return this.canvas.list(user.id, folderId || null, opts);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCanvasDto) {
    return this.canvas.create(user.id, dto.title, dto.folderId, dto.snapshot);
  }

  @Post("batch-move")
  batchMove(@CurrentUser() user: AuthUser, @Body() dto: BatchMoveDto) {
    return this.canvas.moveProjects(user.id, dto.ids, dto.folderId);
  }

  @Post("batch-delete")
  batchDelete(@CurrentUser() user: AuthUser, @Body() dto: BatchIdsDto) {
    return this.canvas.deleteProjects(user.id, dto.ids);
  }

  @Get(":id/agent-chat")
  agentChat(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.canvas.getAgentChat(user.id, id);
  }

  @Put(":id/agent-chat")
  saveAgentChat(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.canvas.saveAgentChat(user.id, id, body);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.canvas.get(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateCanvasDto,
  ) {
    return this.canvas.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.canvas.delete(user.id, id);
  }
}
