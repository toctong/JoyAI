import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { SettingsService } from "./settings.service";

class SetSettingDto {
  @IsString()
  key!: string;

  value!: unknown;
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
    return this.settings.set(dto.key, dto.value as object);
  }
}
