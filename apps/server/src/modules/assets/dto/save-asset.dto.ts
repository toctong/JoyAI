import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class SaveAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: "image | video | audio | text" })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({ description: "Plain text body when kind=text" })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
