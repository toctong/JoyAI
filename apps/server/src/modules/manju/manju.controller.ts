import {
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
import { IsArray, IsOptional, IsString, ValidateIf } from "class-validator";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { ManjuService } from "./manju.service";

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
  constructor(private readonly manju: ManjuService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.manju.list(user.id);
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
