import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Allow, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { SettingsService } from "./settings.service";
import { probeMarketProxy } from "../explore/explore-market-proxy";

class SetSettingDto {
  @IsString()
  key!: string;

  /** Any JSON value (string / object / number / …) */
  @Allow()
  value!: unknown;
}

class ProbeMarketProxyDto {
  /** Optional override; empty uses saved setting / env */
  @IsOptional()
  @IsString()
  proxy?: string;
}

@ApiTags("settings")
@ApiBearerAuth()
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Put()
  set(@Body() dto: SetSettingDto) {
    return this.settings.set(dto.key, dto.value);
  }

  @Post("explore-market-proxy/probe")
  probeMarket(@Body() dto: ProbeMarketProxyDto) {
    return probeMarketProxy(dto.proxy);
  }
}
