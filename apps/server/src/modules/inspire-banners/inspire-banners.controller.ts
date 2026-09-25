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
import { InspireBannersService } from "./inspire-banners.service";

class ListAdminQueryDto {
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  q?: string;
}

class CreateBannerDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsString()
  @MinLength(1)
  coverUrl!: string;

  @IsOptional()
  @IsIn(["image", "video"])
  coverKind?: "image" | "video";

  @IsOptional()
  @IsString()
  posterUrl?: string;

  @IsOptional()
  @IsString()
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  href?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  coverUrl?: string;

  @IsOptional()
  @IsIn(["image", "video"])
  coverKind?: "image" | "video";

  @IsOptional()
  @IsString()
  posterUrl?: string | null;

  @IsOptional()
  @IsString()
  ctaLabel?: string | null;

  @IsOptional()
  @IsString()
  href?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

@ApiTags("inspire-banners")
@ApiBearerAuth()
@Controller()
export class InspireBannersController {
  constructor(private readonly banners: InspireBannersService) {}

  /** Logged-in inspire home carousel. */
  @Get("inspire/banners")
  @UseGuards(JwtAuthGuard)
  listPublic() {
    return this.banners.listPublic();
  }

  @Get("admin/inspire-banners")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  listAdmin(@Query() query: ListAdminQueryDto) {
    return this.banners.listAdmin(query);
  }

  @Post("admin/inspire-banners")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() body: CreateBannerDto) {
    return this.banners.create(body);
  }

  @Patch("admin/inspire-banners/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(@Param("id") id: string, @Body() body: UpdateBannerDto) {
    return this.banners.update(id, body);
  }

  @Delete("admin/inspire-banners/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param("id") id: string) {
    return this.banners.remove(id);
  }
}
