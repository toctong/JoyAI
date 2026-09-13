import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { CreateJobSchema, QUEUE } from "@joyai/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ChannelsService } from "../channels/channels.service";
import { AssetsService } from "../assets/assets.service";

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly assets: AssetsService,
    @InjectQueue(QUEUE.IMAGE) private readonly imageQueue: Queue,
    @InjectQueue(QUEUE.VIDEO_SUBMIT) private readonly videoSubmitQueue: Queue,
  ) {}

  async create(userId: string, body: unknown) {
    const parsed = CreateJobSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { kind, input } = parsed.data;

    await this.channels.resolveForKind(kind, input.modelId);

    const job = await this.prisma.job.create({
      data: {
        userId,
        kind,
        status: "queued",
        input: input as Prisma.InputJsonValue,
        canvasProjectId: input.canvasProjectId,
        canvasNodeId: input.canvasNodeId,
      },
    });

    if (kind === "image") {
      await this.imageQueue.add(
        "generate",
        { jobId: job.id },
        { removeOnComplete: 100, removeOnFail: 200 },
      );
    } else {
      await this.videoSubmitQueue.add(
        "submit",
        { jobId: job.id },
        { removeOnComplete: 100, removeOnFail: 200 },
      );
    }

    return job;
  }

  list(userId: string, take = 50) {
    return this.prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      include: { assets: true },
    });
  }

  listAll(take = 100) {
    return this.prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: { select: { id: true, username: true } },
        assets: true,
      },
    });
  }

  async get(userId: string, id: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, userId },
      include: { assets: true },
    });
    if (!job) throw new NotFoundException("任务不存在");
    return job;
  }

  async resolveReferenceUrls(
    userId: string,
    referenceAssetIds?: string[],
    referenceUrls?: string[],
  ) {
    const urls = [...(referenceUrls ?? [])];
    if (referenceAssetIds?.length) {
      const assets = await this.assets.findByIds(userId, referenceAssetIds);
      for (const a of assets) urls.push(a.url);
    }
    return urls;
  }
}
