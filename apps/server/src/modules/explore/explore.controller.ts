import { Controller, Get, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ExploreService } from "./explore.service";

function toOptionalBoolean({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const s = String(value).toLowerCase();
  if (["1", "true", "yes"].includes(s)) return true;
  if (["0", "false", "no"].includes(s)) return false;
  return undefined;
}

class ExploreFeedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  /** 精选流：转发 Elser featured_only */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  featuredOnly?: boolean;

  /** 分类标签：转发 Elser tag（fanart / fantasy / cp …） */
  @IsOptional()
  @IsString()
  tag?: string;

  /** 热门模型：转发 Elser model_id */
  @IsOptional()
  @IsString()
  modelId?: string;

  /** 第三方提示词库：gpt-image-2-prompts / awesome-gpt-image / prompt-gallery … */
  @IsOptional()
  @IsString()
  source?: string;

  /** prompt-gallery：用途分类 all|ads|posters|… */
  @IsOptional()
  @IsString()
  category?: string;

  /** prompt-gallery：模型族 gpt-image|seedance|… */
  @IsOptional()
  @IsString()
  model?: string;

  /** prompt-gallery：风格 realistic|anime|… */
  @IsOptional()
  @IsString()
  style?: string;

  /** prompt-gallery：排序 trending|latest|popular */
  @IsOptional()
  @IsString()
  sort?: string;
}

@ApiTags("explore")
@Controller("explore")
export class ExploreController {
  constructor(private readonly explore: ExploreService) {}

  @Get("sources")
  sources() {
    return this.explore.sources();
  }

  @Get("feed")
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "featuredOnly", required: false })
  @ApiQuery({ name: "tag", required: false })
  @ApiQuery({ name: "modelId", required: false })
  @ApiQuery({ name: "source", required: false })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "model", required: false })
  @ApiQuery({ name: "style", required: false })
  @ApiQuery({ name: "sort", required: false })
  feed(@Query() query: ExploreFeedQueryDto) {
    return this.explore.feed({
      limit: query.limit,
      cursor: query.cursor,
      featuredOnly: query.featuredOnly,
      tag: query.tag,
      modelId: query.modelId,
      source: query.source,
      category: query.category,
      model: query.model,
      style: query.style,
      sort: query.sort,
    });
  }
}
