import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateChannelBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: "volcengine" })
  @IsString()
  platform!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  apiKey!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "创建时是否导入官方模型目录" })
  @IsOptional()
  @IsBoolean()
  importCatalog?: boolean;
}

export class UpdateChannelBodyDto extends PartialType(CreateChannelBodyDto) {}

export class ProbeChannelBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  apiKey!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  baseUrl!: string;
}

export class TestChannelBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseUrl?: string;
}
