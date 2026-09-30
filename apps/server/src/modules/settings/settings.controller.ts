import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Allow, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { SettingsService } from "./settings.service";
import { SystemLogService } from "../audit/system-log.service";
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
  constructor(
    private readonly settings: SettingsService,
    private readonly systemLogs: SystemLogService,
  ) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Put()
  async set(@CurrentUser() actor: AuthUser, @Body() dto: SetSettingDto) {
    const result = await this.settings.set(dto.key, dto.value);
    this.systemLogs.info("admin", `更新系统设置 ${dto.key}`, {
      userId: actor.id,
      context: { key: dto.key },
    });
    return result;
  }

  @Post("explore-market-proxy/probe")
  probeMarket(@Body() dto: ProbeMarketProxyDto) {
    return probeMarketProxy(dto.proxy);
  }
}
