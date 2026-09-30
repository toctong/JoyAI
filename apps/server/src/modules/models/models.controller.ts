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
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { Transform } from "class-transformer";
import {
  PaginationQueryDto,
  toOptionalBoolean,
} from "../../common/dto/pagination-query.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "../../common/guards";
import { normalizeExportIds } from "../../common/admin-export";
import { JobKind } from "../../database/enums";
import { ModelsService } from "./models.service";

class ListModelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(JobKind)
  kind?: JobKind;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  channelId?: string;
}

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
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  pricing?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;

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
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  pricing?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

class ImportCatalogDto {
  @IsOptional()
  @IsBoolean()
  forceRename?: boolean;
}

class ImportCatalogSelectDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  remoteIds!: string[];

  @IsOptional()
  @IsBoolean()
  forceRename?: boolean;
}

class BatchDeleteModelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
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
  list(@Query() query: ListModelsQueryDto) {
    return this.models.list(query);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/models/export")
  exportAll(@Query("ids") ids?: string | string[]) {
    return this.models.exportAll(normalizeExportIds(ids));
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/models/import")
  importAll(@Body() body: unknown) {
    return this.models.importItems(body);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/models/catalog")
  catalog(
    @Query("platform") platform: string,
    @Query("kind") kind?: string,
  ) {
    return this.models.catalogPreview(platform ?? "", kind);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/channels/:id/model-remote-ids")
  listChannelRemoteIds(@Param("id") id: string) {
    return this.models.listChannelRemoteIds(id);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/models")
  create(@Body() dto: CreateModelDto) {
    return this.models.create(dto as Parameters<ModelsService["create"]>[0]);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch("admin/models/:id")
  update(@Param("id") id: string, @Body() dto: UpdateModelDto) {
    return this.models.update(id, dto as Parameters<ModelsService["update"]>[1]);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/models/batch-delete")
  removeMany(@Body() dto: BatchDeleteModelsDto) {
    return this.models.removeMany(dto.ids);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete("admin/models/:id")
  remove(@Param("id") id: string) {
    return this.models.remove(id);
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/channels/:id/import-catalog")
  importCatalog(
    @Param("id") id: string,
    @Body() dto: ImportCatalogDto,
  ) {
    return this.models.importCatalog(id, {
      forceRename: dto.forceRename,
    });
  }

  @ApiBearerAuth()
  @Roles("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/channels/:id/import-catalog-select")
  importCatalogSelect(
    @Param("id") id: string,
    @Body() dto: ImportCatalogSelectDto,
  ) {
    return this.models.importCatalogSelect(id, dto.remoteIds, {
      forceRename: dto.forceRename,
    });
  }
}
