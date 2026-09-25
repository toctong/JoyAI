import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../../common/guards";
import { InspireShowcaseService } from "./inspire-showcase.service";

class ShowcaseWorksQueryDto {
  /** 分类 categoryCode；空或不传 = 全部 */
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number;

  @IsOptional()
  @IsString()
  keyword?: string;
}

@ApiTags("inspire-showcase")
@ApiBearerAuth()
@Controller("inspire/showcase")
@UseGuards(JwtAuthGuard)
export class InspireShowcaseController {
  constructor(private readonly showcase: InspireShowcaseService) {}

  @Get("categories")
  categories() {
    return this.showcase.categories();
  }

  @Get("works")
  @ApiQuery({ name: "categoryCode", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @ApiQuery({ name: "keyword", required: false })
  works(@Query() query: ShowcaseWorksQueryDto) {
    return this.showcase.works({
      categoryCode: query.categoryCode,
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
    });
  }
}
