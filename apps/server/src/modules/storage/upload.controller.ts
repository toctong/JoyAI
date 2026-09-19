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
import { fetchPublicMedia } from "./fetch-public-image";
import {
  originalNameFromMeta,
  sanitizeOriginalName,
} from "./original-name";

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

  /** Client original filename — stored when the existing asset has none. */
  @IsOptional()
  @IsString()
  originalName?: string;
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

  /** Same-origin media bytes for canvas crop / frame / extract-audio (remote hosts often omit CORS). */
  @ApiQuery({ name: "url", required: true })
  @ApiQuery({ name: "kind", required: false, enum: ["auto", "image", "video"] })
  @Get("media/fetch")
  async fetchMedia(
    @Query("url") url?: string,
    @Query("kind") kind?: string,
  ) {
    const trimmed = String(url ?? "").trim();
    if (!trimmed) throw new BadRequestException("缺少媒体地址");
    const prefer =
      kind === "image" || kind === "video" ? kind : ("auto" as const);
    const media = await fetchPublicMedia(trimmed, prefer);
    return new StreamableFile(media.buffer, { type: media.contentType });
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
    const asset = await this.ensureOriginalName(
      existing,
      sanitizeOriginalName(dto.originalName),
    );
    return {
      exists: true as const,
      deduplicated: true as const,
      asset,
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
    const originalName = sanitizeOriginalName(file.filename);

    const existing = await this.assets.findByMd5(user.id, md5);
    if (existing) {
      const asset = await this.ensureOriginalName(existing, originalName);
      return { ...asset, deduplicated: true };
    }

    const ext =
      originalName?.split(".").pop()?.toLowerCase() ||
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
        ...(originalName ? { originalName } : {}),
      },
    });

    return { ...asset, deduplicated: put.deduplicated };
  }

  /** Fill meta.originalName once when an older hash-only asset is reused. */
  private async ensureOriginalName(
    asset: {
      id: string;
      meta: Record<string, unknown> | null;
    },
    next?: string,
  ) {
    if (!next || originalNameFromMeta(asset.meta)) return asset;
    const patched = await this.assets.patchMeta(asset.id, {
      originalName: next,
    });
    return patched ?? asset;
  }
}
