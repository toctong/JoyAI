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
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { toOptionalBoolean } from "../../common/dto/pagination-query.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { CameraMovesService } from "./camera-moves.service";

class ListPublicQueryDto {
  @IsOptional()
  @IsString()
  category?: string;
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
  @IsString()
  category?: string;
}

class CreateMoveDto {
  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  thumbUrl?: string | null;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  exclusiveGroup?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class UpdateMoveDto {
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
  thumbUrl?: string | null;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  exclusiveGroup?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

@ApiTags("camera-moves")
@ApiBearerAuth()
@Controller()
export class CameraMovesController {
  constructor(private readonly moves: CameraMovesService) {}

  @Get("camera-moves")
  @UseGuards(JwtAuthGuard)
  listPublic(@Query() query: ListPublicQueryDto) {
    return this.moves.listPublic(query.category);
  }

  @Get("camera-moves/categories")
  @UseGuards(JwtAuthGuard)
  categories() {
    return this.moves.listCategories();
  }

  @Get("admin/camera-moves")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  listAdmin(@Query() query: ListAdminQueryDto) {
    return this.moves.listAdmin(query);
  }

  @Post("admin/camera-moves")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() body: CreateMoveDto) {
    return this.moves.create(body);
  }

  @Patch("admin/camera-moves/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(@Param("id") id: string, @Body() body: UpdateMoveDto) {
    return this.moves.update(id, body);
  }

  @Delete("admin/camera-moves/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param("id") id: string) {
    return this.moves.remove(id);
  }
}
