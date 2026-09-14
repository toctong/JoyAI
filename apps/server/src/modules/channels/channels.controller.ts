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
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { CHANNEL_PRESETS, type ProviderPlatformId } from "@joyai/shared";
import { Prisma } from "@prisma/client";
import {
  PaginationQueryDto,
  toOptionalBoolean,
} from "../../common/dto/pagination-query.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { ChannelsService } from "./channels.service";
import { ModelsService } from "../models/models.service";

class ListChannelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;
}

class CreateChannelDto {
  @IsString()
  name!: string;

  @IsString()
  platform!: string;

  @IsString()
  apiKey!: string;

  @IsString()
  baseUrl!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  importCatalog?: boolean;
}

class UpdateChannelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class ProbeDto {
  @IsString()
  apiKey!: string;

  @IsString()
  baseUrl!: string;
}

class TestChannelDto {
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;
}

@ApiTags("channels")
@ApiBearerAuth()
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/channels")
export class ChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly models: ModelsService,
  ) {}

  @Get("presets")
  presets() {
    return CHANNEL_PRESETS;
  }

  @Get()
  list(@Query() query: ListChannelsQueryDto) {
    return this.channels.list(query);
  }

  @Post("probe")
  probe(@Body() dto: ProbeDto) {
    return this.channels.probe({
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl,
    });
  }

  @Post()
  async create(@Body() dto: CreateChannelDto) {
    const preset = CHANNEL_PRESETS[dto.platform as ProviderPlatformId];
    const metadata = {
      ...(dto.metadata ?? {}),
      ...(preset?.dashscopeApiBase
        ? { dashscopeApiBase: preset.dashscopeApiBase }
        : {}),
    };

    const channel = await this.channels.create({
      name: dto.name,
      platform: dto.platform,
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl,
      enabled: dto.enabled,
      metadata: Object.keys(metadata).length
        ? (metadata as Prisma.InputJsonValue)
        : undefined,
    });

    let catalog: { created: number; updated: number; skipped: number } | null =
      null;
    if (dto.importCatalog) {
      catalog = await this.models.importCatalog(channel.id);
    }

    return { ...channel, catalog };
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateChannelDto) {
    return this.channels.update(id, {
      name: dto.name,
      baseUrl: dto.baseUrl,
      enabled: dto.enabled,
      apiKey: dto.apiKey?.trim() || undefined,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    });
  }

  @Post(":id/test")
  test(@Param("id") id: string, @Body() dto: TestChannelDto) {
    return this.channels.testConnection(id, {
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl,
    });
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.channels.remove(id);
  }
}
