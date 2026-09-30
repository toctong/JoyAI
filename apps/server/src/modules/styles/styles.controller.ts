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
import type { StyleSurface } from "../../database/entities/style-template.entity";
import { StylesService } from "./styles.service";

const SURFACES = ["manju", "canvas"] as const;

class ListPublicQueryDto {
  @IsOptional()
  @IsIn(SURFACES)
  surface?: StyleSurface;
}

class ListAdminQueryDto {
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(SURFACES)
  surface?: StyleSurface;
}

class CreateStyleDto {
  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsString()
  @MinLength(1)
  thumbUrl!: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsIn(SURFACES, { each: true })
  surfaces?: StyleSurface[];
}

class UpdateStyleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  thumbUrl?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsIn(SURFACES, { each: true })
  surfaces?: StyleSurface[];
}

@ApiTags("styles")
@ApiBearerAuth()
@Controller()
export class StylesController {
  constructor(private readonly styles: StylesService) {}

  @Get("styles")
  @UseGuards(JwtAuthGuard)
  listPublic(@Query() query: ListPublicQueryDto) {
    return this.styles.listPublic(query.surface);
  }

  @Get("admin/styles")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  listAdmin(@Query() query: ListAdminQueryDto) {
    return this.styles.listAdmin(query);
  }

  @Get("admin/styles/export")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  exportAll(@Query("ids") ids?: string | string[]) {
    return this.styles.exportAll(normalizeExportIds(ids));
  }

  @Post("admin/styles/import")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  importAll(@Body() body: unknown) {
    return this.styles.importItems(body);
  }

  @Post("admin/styles")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() body: CreateStyleDto) {
    return this.styles.create(body);
  }

  @Patch("admin/styles/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(@Param("id") id: string, @Body() body: UpdateStyleDto) {
    return this.styles.update(id, body);
  }

  @Delete("admin/styles/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param("id") id: string) {
    return this.styles.remove(id);
  }
}
