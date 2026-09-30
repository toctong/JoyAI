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
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { toOptionalBoolean } from "../../common/dto/pagination-query.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { normalizeExportIds } from "../../common/admin-export";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { PromptPresetsService } from "./prompt-presets.service";

class ListAdminQueryDto {
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  q?: string;
}

class CreateGlobalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class UpdateGlobalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class CanvasPresetBodyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  text!: string;
}

class UpdateCanvasPresetDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;
}

class ImportCanvasItemDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  text!: string;
}

class ImportCanvasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCanvasItemDto)
  items!: ImportCanvasItemDto[];
}

@ApiTags("prompt-presets")
@ApiBearerAuth()
@Controller()
export class PromptPresetsController {
  constructor(private readonly presets: PromptPresetsService) {}

  /** Enabled global presets for product UIs. */
  @Get("prompt-presets")
  @UseGuards(JwtAuthGuard)
  listPublic() {
    return this.presets.listGlobalPublic();
  }

  @Get("admin/prompt-presets")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  listAdmin(@Query() query: ListAdminQueryDto) {
    return this.presets.listAdmin(query);
  }

  @Get("admin/prompt-presets/export")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  exportAll(@Query("ids") ids?: string | string[]) {
    return this.presets.exportGlobal(normalizeExportIds(ids));
  }

  @Post("admin/prompt-presets/import")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  importAll(@Body() body: unknown) {
    return this.presets.importGlobal(body);
  }

  @Post("admin/prompt-presets")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  createGlobal(@Body() body: CreateGlobalDto) {
    return this.presets.createGlobal(body);
  }

  @Patch("admin/prompt-presets/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  updateGlobal(@Param("id") id: string, @Body() body: UpdateGlobalDto) {
    return this.presets.updateGlobal(id, body);
  }

  @Delete("admin/prompt-presets/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  removeGlobal(@Param("id") id: string) {
    return this.presets.removeGlobal(id);
  }

  @Get("canvas/projects/:projectId/prompt-presets")
  @UseGuards(JwtAuthGuard)
  listCanvas(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
  ) {
    return this.presets.listForCanvas(user.id, projectId);
  }

  @Post("canvas/projects/:projectId/prompt-presets")
  @UseGuards(JwtAuthGuard)
  createCanvas(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() body: CanvasPresetBodyDto,
  ) {
    return this.presets.createForCanvas(user.id, projectId, body);
  }

  @Post("canvas/projects/:projectId/prompt-presets/import")
  @UseGuards(JwtAuthGuard)
  importCanvas(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() body: ImportCanvasDto,
  ) {
    return this.presets.importForCanvas(user.id, projectId, body.items ?? []);
  }

  @Patch("canvas/projects/:projectId/prompt-presets/:id")
  @UseGuards(JwtAuthGuard)
  updateCanvas(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() body: UpdateCanvasPresetDto,
  ) {
    return this.presets.updateForCanvas(user.id, projectId, id, body);
  }

  @Delete("canvas/projects/:projectId/prompt-presets/:id")
  @UseGuards(JwtAuthGuard)
  removeCanvas(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.presets.removeForCanvas(user.id, projectId, id);
  }
}
