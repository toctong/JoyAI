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
  list(@CurrentUser() user: AuthUser, @Query("take") take?: string) {
    return this.assets.list(user.id, take ? Number(take) : 50);
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
