import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { JobKind } from "@prisma/client";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { ModelsService } from "./models.service";

class CreateModelDto {
  @IsString()
  channelId!: string;

  @IsString()
  name!: string;

  @IsEnum(JobKind)
  kind!: JobKind;

  @IsString()
  remoteId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

class UpdateModelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  remoteId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

@ApiTags("models")
@Controller()
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("models")
  listPublic() {
    return this.models.listPublic();
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/models")
  list() {
    return this.models.list();
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/models")
  create(@Body() dto: CreateModelDto) {
    return this.models.create(dto);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch("admin/models/:id")
  update(@Param("id") id: string, @Body() dto: UpdateModelDto) {
    return this.models.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete("admin/models/:id")
  remove(@Param("id") id: string) {
    return this.models.remove(id);
  }
}
