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
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { toOptionalBoolean } from "../../common/dto/pagination-query.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { normalizeExportIds } from "../../common/admin-export";
import type { SkillCategory } from "../../database/entities/skill.entity";
import { SkillsService } from "./skills.service";

const SKILL_CATEGORIES = ["manju", "canvas", "tools", "general"] as const;

class ListSkillsQueryDto {
  @IsOptional()
  @IsIn(SKILL_CATEGORIES)
  category?: SkillCategory;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  q?: string;
}

class CreateSkillDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(SKILL_CATEGORIES)
  category!: SkillCategory;

  @IsString()
  @MinLength(2)
  purpose!: string;

  @IsString()
  @MinLength(1)
  systemPrompt!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class UpdateSkillDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(SKILL_CATEGORIES)
  category?: SkillCategory;

  @IsOptional()
  @IsString()
  @MinLength(2)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  systemPrompt?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class ListPublicSkillsQueryDto {
  @IsOptional()
  @IsIn(SKILL_CATEGORIES)
  category?: SkillCategory;
}

@ApiTags("skills")
@Controller()
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  /** Enabled skills for product UIs (no systemPrompt). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("skills")
  listPublic(@Query() query: ListPublicSkillsQueryDto) {
    return this.skills.listPublic(query);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/skills")
  list(@Query() query: ListSkillsQueryDto) {
    return this.skills.list(query);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/skills/export")
  exportAll(@Query("ids") ids?: string | string[]) {
    return this.skills.exportAll(normalizeExportIds(ids));
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/skills/import")
  importAll(@Body() body: unknown) {
    return this.skills.importItems(body);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/skills/:id")
  get(@Param("id") id: string) {
    return this.skills.get(id);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/skills")
  create(@Body() dto: CreateSkillDto) {
    return this.skills.create(dto);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch("admin/skills/:id")
  update(@Param("id") id: string, @Body() dto: UpdateSkillDto) {
    return this.skills.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete("admin/skills/:id")
  remove(@Param("id") id: string) {
    return this.skills.remove(id);
  }
}
