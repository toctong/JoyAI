import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { ChannelsService } from "./channels.service";

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
}

@ApiTags("channels")
@ApiBearerAuth()
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/channels")
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list() {
    return this.channels.list();
  }

  @Post()
  create(@Body() dto: CreateChannelDto) {
    return this.channels.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateChannelDto) {
    return this.channels.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.channels.remove(id);
  }
}
