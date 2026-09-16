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
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { CHANNEL_PRESETS, type ProviderPlatformId } from "@joyai/shared";
import {
  PaginationQueryDto,
  toOptionalBoolean,
} from "../../common/dto/pagination-query.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { ChannelsService } from "./channels.service";
import { ModelsService } from "../models/models.service";
import {
  CreateChannelBodyDto,
  ProbeChannelBodyDto,
  TestChannelBodyDto,
  UpdateChannelBodyDto,
} from "./dto/channel-body.dto";

class ListChannelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;
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
  probe(@Body() dto: ProbeChannelBodyDto) {
    return this.channels.probe({
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl,
    });
  }

  @Post()
  async create(@Body() dto: CreateChannelBodyDto) {
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
      metadata: Object.keys(metadata).length ? metadata : null,
    });

    let catalog: {
      created: number;
      updated: number;
      disabled: number;
      skipped: number;
    } | null = null;
    if (dto.importCatalog) {
      catalog = await this.models.importCatalog(channel.id);
    }

    return { ...channel, catalog };
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateChannelBodyDto) {
    return this.channels.update(id, {
      name: dto.name,
      baseUrl: dto.baseUrl,
      enabled: dto.enabled,
      apiKey: dto.apiKey?.trim() || undefined,
      metadata: dto.metadata,
    });
  }

  @Post(":id/test")
  test(@Param("id") id: string, @Body() dto: TestChannelBodyDto) {
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
