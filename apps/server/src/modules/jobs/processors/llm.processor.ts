import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Job as BullJob } from "bullmq";
import { Repository } from "typeorm";
import { resolveLlmProvider } from "@joyai/ai-providers";
import {
  ManjuAnalyzeResultSchema,
  ManjuAuthorPromptSchema,
  ManjuEpisodePlanResultSchema,
  ManjuScriptWriteResultSchema,
  ManjuSeriesMemoryResultSchema,
  QUEUE,
  type LlmJobInput,
  type ManjuAnalyzeResult,
  type ManjuScriptWriteResult,
} from "@joyai/shared";
import { Job } from "../../../database/entities/job.entity";
import { JobStatus } from "../../../database/enums";
import { ChannelsService } from "../../channels/channels.service";
import { JobsService } from "../jobs.service";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import { ManjuService } from "../../manju/manju.service";
import {
  ANALYZE_ASSETS_SYSTEM,
  AUTHOR_PROMPTS_SYSTEM,
  CANVAS_TEXT_SYSTEM,
  PLAN_EPISODES_SYSTEM,
  REVERSE_PROMPT_SYSTEM,
  SCRIPT_PLAN_SYSTEM,
  SCRIPT_WRITE_SYSTEM,
  SERIES_MEMORY_SYSTEM,
} from "../llm-prompts";

function resolveLlmConcurrency(): number {
  const n = Number(process.env.JOB_LLM_CONCURRENCY);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(Math.floor(n), 10);
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("无法从模型输出中解析 JSON");
}

@Processor(QUEUE.LLM, { concurrency: resolveLlmConcurrency() })
export class LlmProcessor extends WorkerHost {
  private readonly logger = new Logger(LlmProcessor.name);

  constructor(
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    private readonly channels: ChannelsService,
    private readonly jobs: JobsService,
    private readonly realtime: RealtimeGateway,
    private readonly manju: ManjuService,
  ) {
    super();
  }

  async process(bullJob: BullJob<{ jobId: string }>) {
    const { jobId } = bullJob.data;
    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) return;

    try {
      await this.jobs.markStarted(jobId);
      await this.jobsRepo.update(jobId, {
        status: JobStatus.running,
        progress: 10,
      });
      this.realtime.emitJob(job.userId, "job:progress", {
        jobId,
        status: "running",
        progress: 10,
      });

      const input = job.input as LlmJobInput;
      const purpose = input.purpose ?? "chat";
      const model = await this.channels.resolveForKind("llm", input.modelId);
      const caps = (model.capabilities ?? null) as {
        adapterId?: string;
      } | null;

      const systemPrompt =
        input.systemPrompt?.trim() ||
        (purpose === "analyze_assets"
          ? ANALYZE_ASSETS_SYSTEM
          : purpose === "script_plan" || purpose === "split_shots"
            ? SCRIPT_PLAN_SYSTEM
            : purpose === "author_prompts"
              ? AUTHOR_PROMPTS_SYSTEM
              : purpose === "series_memory"
                ? SERIES_MEMORY_SYSTEM
                : purpose === "plan_episodes"
                  ? PLAN_EPISODES_SYSTEM
                  : purpose === "script_write"
                    ? SCRIPT_WRITE_SYSTEM
                    : purpose === "reverse_prompt"
                      ? REVERSE_PROMPT_SYSTEM
                      : input.canvasProjectId
                        ? CANVAS_TEXT_SYSTEM
                        : "你是有帮助的助手。");

      const imageUrls = (
        await this.jobs.resolveReferenceMedia(
          job.userId,
          input.referenceAssetIds,
          input.referenceUrls,
        )
      )
        .filter((item) => item.kind === "image")
        .map((item) => item.url)
        .slice(0, 6);

      const provider = resolveLlmProvider({
        platform: model.channel.platform,
        capabilities: caps,
      });

      const result = await provider.chat({
        model: model.remoteId,
        apiKey: model.channel.apiKey,
        baseUrl: model.channel.baseUrl,
        temperature: input.temperature,
        metadata: model.channel.metadata ?? null,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: imageUrls.length
              ? [
                  { type: "text", text: input.prompt },
                  ...imageUrls.map((url) => ({
                    type: "image_url" as const,
                    image_url: { url },
                  })),
                ]
              : input.prompt,
          },
        ],
      });

      let analyze: ManjuAnalyzeResult | null = null;
      let scriptWrite: ManjuScriptWriteResult | null = null;
      if (
        purpose === "analyze_assets" ||
        purpose === "split_shots" ||
        purpose === "script_plan"
      ) {
        const raw = extractJsonObject(result.text);
        const parsed = ManjuAnalyzeResultSchema.safeParse(
          purpose === "analyze_assets"
            ? raw
            : {
                characters: [],
                scenes: [],
                props: [],
                episodes: [],
                shots: (raw as { shots?: unknown })?.shots ?? raw,
              },
        );
        if (!parsed.success) {
          throw new Error(
            `分析结果 JSON 不符合约定: ${parsed.error.message}`,
          );
        }
        analyze = parsed.data;

        if (input.manjuProjectId) {
          await this.manju.applyAnalyzeResult(
            job.userId,
            input.manjuProjectId,
            jobId,
            analyze,
            purpose !== "analyze_assets",
            purpose === "script_plan" || purpose === "split_shots"
              ? input.manjuEpisodeId
              : undefined,
          );
        }
      } else if (purpose === "author_prompts" && input.manjuProjectId) {
        const raw = extractJsonObject(result.text);
        const parsed = ManjuAuthorPromptSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(
            `提示词 JSON 不符合约定: ${parsed.error.message}`,
          );
        }
        await this.manju.applyAuthorPrompts(
          job.userId,
          input.manjuProjectId,
          jobId,
          parsed.data.shots,
        );
      } else if (purpose === "series_memory" && input.manjuProjectId) {
        const raw = extractJsonObject(result.text);
        const parsed = ManjuSeriesMemoryResultSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`连载记忆 JSON 不符合约定: ${parsed.error.message}`);
        }
        await this.manju.applySeriesMemory(
          job.userId,
          input.manjuProjectId,
          jobId,
          parsed.data,
        );
      } else if (purpose === "plan_episodes" && input.manjuProjectId) {
        const raw = extractJsonObject(result.text);
        const parsed = ManjuEpisodePlanResultSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`分集 JSON 不符合约定: ${parsed.error.message}`);
        }
        await this.manju.applyEpisodePlan(
          job.userId,
          input.manjuProjectId,
          jobId,
          parsed.data.episodes,
        );
      } else if (purpose === "script_write") {
        const raw = extractJsonObject(result.text);
        const parsed = ManjuScriptWriteResultSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`帮写 JSON 不符合约定: ${parsed.error.message}`);
        }
        if (
          (parsed.data.intent === "create" || parsed.data.intent === "revise") &&
          !parsed.data.script.trim()
        ) {
          throw new Error("帮写结果缺少剧本文本");
        }
        scriptWrite = parsed.data;
      }

      const payload = {
        text: result.text,
        purpose,
        analyze,
        scriptWrite,
        manjuProjectId: input.manjuProjectId ?? null,
        canvasProjectId: input.canvasProjectId ?? null,
        canvasNodeId: input.canvasNodeId ?? null,
      };

      await this.jobsRepo.update(jobId, {
        status: JobStatus.succeeded,
        progress: 100,
        result: payload as never,
        finishedAt: new Date(),
        error: null,
      });
      await this.jobs.markFinished(jobId);

      this.realtime.emitJob(job.userId, "job:completed", {
        jobId,
        status: "succeeded",
        result: payload,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`LLM job ${jobId} failed: ${message}`);
      await this.jobsRepo.update(jobId, {
        status: JobStatus.failed,
        error: message,
        finishedAt: new Date(),
      });
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId,
        error: message,
      });
    }
  }
}
