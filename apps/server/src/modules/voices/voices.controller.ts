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
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { toOptionalBoolean } from "../../common/dto/pagination-query.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { normalizeExportIds } from "../../common/admin-export";
import { VoicesService } from "./voices.service";

class ListPublicQueryDto {
  @IsOptional()
  @IsString()
  provider?: string;

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
  channelId?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

class CreateVoiceDto {
  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsString()
  @MinLength(1)
  voiceId!: string;

  @IsOptional()
  @IsString()
  channelId?: string | null;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  gender?: string | null;

  @IsOptional()
  @IsString()
  language?: string | null;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  sampleText?: string | null;

  @IsOptional()
  @IsString()
  previewAudioUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class UpdateVoiceDto {
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
  voiceId?: string;

  @IsOptional()
  @IsString()
  channelId?: string | null;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  gender?: string | null;

  @IsOptional()
  @IsString()
  language?: string | null;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  sampleText?: string | null;

  @IsOptional()
  @IsString()
  previewAudioUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

class PreviewVoiceDto {
  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

class GeneratePreviewsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}

@ApiTags("voices")
@ApiBearerAuth()
@Controller()
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  @Get("voices")
  @UseGuards(JwtAuthGuard)
  listPublic(@Query() query: ListPublicQueryDto) {
    return this.voices.listPublic(query);
  }

  @Get("voices/categories")
  @UseGuards(JwtAuthGuard)
  categories() {
    return this.voices.listCategories();
  }

  @Get("admin/voices")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  listAdmin(@Query() query: ListAdminQueryDto) {
    return this.voices.listAdmin(query);
  }

  @Get("admin/voices/audio-channels")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  listAudioChannels() {
    return this.voices.listAudioChannels();
  }

  @Get("admin/voices/export")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  exportAll(@Query("ids") ids?: string | string[]) {
    return this.voices.exportAll(normalizeExportIds(ids));
  }

  @Post("admin/voices/import")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  importAll(@Body() body: unknown) {
    return this.voices.importItems(body);
  }

  @Post("admin/voices")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() body: CreateVoiceDto) {
    return this.voices.create(body);
  }

  /** 对勾选的音色批量生成试听 */
  @Post("admin/voices/generate-previews")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  generatePreviews(@Body() body: GeneratePreviewsDto) {
    return this.voices.generatePreviewsForIds(body.ids);
  }

  @Patch("admin/voices/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(@Param("id") id: string, @Body() body: UpdateVoiceDto) {
    return this.voices.update(id, body);
  }

  @Delete("admin/voices/:id")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param("id") id: string) {
    return this.voices.remove(id);
  }

  @Post("admin/voices/:id/preview")
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  preview(@Param("id") id: string, @Body() body: PreviewVoiceDto) {
    return this.voices.generatePreview(id, body);
  }
}
