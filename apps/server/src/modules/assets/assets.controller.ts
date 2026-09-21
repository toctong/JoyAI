import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { AssetsService } from "./assets.service";
import { SaveAssetDto } from "./dto/save-asset.dto";

@ApiTags("assets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
    @Query("kind") kind?: string,
    @Query("source") source?: string,
    @Query("from") from?: string,
    @Query("sort") sort?: string,
    @Query("uploaded") uploaded?: string,
  ) {
    return this.assets.list(user.id, {
      take: take ? Number(take) : 80,
      skip: skip ? Number(skip) : 0,
      kind,
      source,
      from,
      sort: sort === "oldest" ? "oldest" : "newest",
      uploaded: uploaded === "1" ? "1" : uploaded === "0" ? "0" : undefined,
    });
  }

  /** Pin / mirror canvas media into the user asset library. */
  @Post("save")
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveAssetDto) {
    return this.assets.saveFromCanvas(user.id, dto);
  }

  @Get(":id")
  getOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.assets.getOwned(user.id, id);
  }
}
