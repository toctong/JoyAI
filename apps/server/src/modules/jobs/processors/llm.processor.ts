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
import { AssetsService } from "../../assets/assets.service";
import { sourceFromJob } from "../../assets/asset-source";
import { SkillsService } from "../../skills/skills.service";

function resolveLlmConcurrency(): number {
  const n = Number(process.env.JOB_LLM_CONCURRENCY);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(Math.floor(n), 10);
}

function textAssetTitle(purpose: string, toolSlug?: string | null): string {
  if (toolSlug === "image-reverse" || purpose === "reverse_prompt") {
    return "反推提示词.txt";
  }
  if (toolSlug === "prompt-optimize" || purpose === "prompt_optimize") {
    return "优化提示词.txt";
  }
  return "提示词.txt";
}

function shouldSavePromptDocument(purpose: string): boolean {
  return purpose === "reverse_prompt" || purpose === "prompt_optimize";
}

/** Pipeline purposes that apply structured JSON back to manju draft. */
const MANJU_PIPELINE_PURPOSES = new Set([
  "analyze_assets",
  "split_shots",
  "script_plan",
  "author_prompts",
  "series_memory",
  "plan_episodes",
  "script_write",
  "reverse_prompt",
  "prompt_optimize",
  "chat",
  "canvas_text",
]);

/** Catalog skills used as free-form advisors (Xiaoluo text skills, etc.). */
function isAdvisorSkillPurpose(purpose: string): boolean {
  if (!purpose || MANJU_PIPELINE_PURPOSES.has(purpose)) return false;
  return true;
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
    private readonly assets: AssetsService,
    private readonly skills: SkillsService,
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

      const systemPrompt = await this.skills.resolveSystemPrompt({
        purpose,
        canvasProjectId: input.canvasProjectId,
        override: input.systemPrompt,
      });

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

      /** 解析剧本：强化用户侧约束，确保 AI 返回 tags/overview，禁止规则抽取 */
      const userText =
        purpose === "analyze_assets"
          ? [
              "请严格按系统约定，只输出一个 JSON 对象（不要解释、不要 markdown 代码围栏）。",
              "必须填写：overview（一两句梗概）、tags（2～5 个题材标签）、characters、scenes、props、episodes（至少 1 集）。",
              "只根据下方剧本原文抽取，不要编造原文没有的角色或设定。",
              "",
              "【剧本原文】",
              input.prompt,
            ].join("\n")
          : input.prompt;

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
                  { type: "text", text: userText },
                  ...imageUrls.map((url) => ({
                    type: "image_url" as const,
                    image_url: { url },
                  })),
                ]
              : userText,
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
            purpose === "analyze_assets"
              ? (input.analyzeMode ?? "incremental")
              : "incremental",
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
      } else if (isAdvisorSkillPurpose(purpose)) {
        // Xiaoluo / catalog advisor skills: free-form text reply (no JSON contract).
        const reply = String(result.text ?? "").trim();
        if (!reply) throw new Error("技能输出为空");
        scriptWrite = {
          intent: "qa",
          reply,
          script: "",
          hook: "",
          tags: [],
        };
      }

      const textOut = String(result.text ?? "").trim();
      let textAsset: { id: string; url: string; kind: string } | null = null;
      if (shouldSavePromptDocument(purpose) && textOut) {
        try {
          const created = await this.assets.createTextDocument({
            userId: job.userId,
            jobId,
            text: textOut,
            source: sourceFromJob(job),
            originalName: textAssetTitle(
              purpose,
              typeof input.toolSlug === "string" ? input.toolSlug : null,
            ),
            meta: {
              purpose,
              toolSlug:
                typeof input.toolSlug === "string" ? input.toolSlug : null,
            },
          });
          if (created) {
            textAsset = {
              id: created.id,
              url: created.url,
              kind: "text",
            };
          } else {
            this.logger.warn(
              `LLM job ${jobId}: skipped text asset (storage not configured)`,
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `LLM job ${jobId}: failed to save text asset: ${message}`,
          );
        }
      }

      const payload = {
        text: result.text,
        purpose,
        analyze,
        scriptWrite,
        manjuProjectId: input.manjuProjectId ?? null,
        canvasProjectId: input.canvasProjectId ?? null,
        canvasNodeId: input.canvasNodeId ?? null,
        assetIds: textAsset ? [textAsset.id] : [],
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
        // Include kind so clients can skip treating .txt as media thumbs.
        assets: textAsset ? [textAsset] : [],
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
