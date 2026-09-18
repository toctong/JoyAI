import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  Body,
  StreamableFile,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from "@nestjs/swagger";
import { FastifyRequest } from "fastify";
import { IsOptional, IsString, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { StorageService } from "./storage.service";
import { AssetsService } from "../assets/assets.service";
import { fetchPublicImage } from "./fetch-public-image";

class CheckDto {
  @IsString()
  md5!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

@ApiTags("upload")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class UploadController {
  constructor(
    private readonly storage: StorageService,
    private readonly assets: AssetsService,
  ) {}

  /** Same-origin image bytes for canvas crop / split / upscale (remote hosts often omit CORS). */
  @ApiQuery({ name: "url", required: true })
  @Get("media/fetch")
  async fetchMedia(@Query("url") url?: string) {
    const trimmed = String(url ?? "").trim();
    if (!trimmed) throw new BadRequestException("缺少图片地址");
    const image = await fetchPublicImage(trimmed);
    return new StreamableFile(image.buffer, { type: image.contentType });
  }

  /** 前端预检：同用户同 MD5 已有资产则直接复用，免传文件 */
  @Post("upload/check")
  async check(@CurrentUser() user: AuthUser, @Body() dto: CheckDto) {
    const md5 = dto.md5.trim().toLowerCase();
    const existing = await this.assets.findByMd5(user.id, md5);
    if (!existing) return { exists: false as const };
    if (dto.size != null && existing.size != null && existing.size !== dto.size) {
      return { exists: false as const };
    }
    return {
      exists: true as const,
      deduplicated: true as const,
      asset: existing,
    };
  }

  @ApiConsumes("multipart/form-data")
  @Post("upload")
  async upload(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const file = await req.file();
    if (!file) throw new BadRequestException("缺少文件");

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    const md5 = this.storage.md5(buffer);

    const existing = await this.assets.findByMd5(user.id, md5);
    if (existing) {
      return { ...existing, deduplicated: true };
    }

    const ext =
      file.filename?.split(".").pop()?.toLowerCase() ||
      file.mimetype?.split("/")[1] ||
      "bin";

    const put = await this.storage.putObject(buffer, {
      contentType: file.mimetype,
      ext,
    });

    const asset = await this.assets.create({
      userId: user.id,
      kind: file.mimetype?.startsWith("video/")
        ? "video"
        : file.mimetype?.startsWith("audio/")
          ? "audio"
          : "image",
      url: put.url,
      md5: put.md5,
      mimeType: file.mimetype,
      size: put.size,
      meta: {
        sha256: put.sha256,
        storageKey: put.key,
        tosDeduplicated: put.deduplicated,
      },
    });

    return { ...asset, deduplicated: put.deduplicated };
  }
}
