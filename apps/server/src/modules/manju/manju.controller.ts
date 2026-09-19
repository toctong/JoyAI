import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { ManjuService } from "./manju.service";

class CreateManjuDto {
  @IsOptional()
  @IsString()
  title?: string;
}

class UpdateManjuDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  draft?: unknown;
}

@ApiTags("manju")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("manju/projects")
export class ManjuController {
  constructor(private readonly manju: ManjuService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.manju.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateManjuDto) {
    return this.manju.create(user.id, dto.title);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.get(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateManjuDto,
  ) {
    return this.manju.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manju.remove(user.id, id);
  }
}
