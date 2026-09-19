import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { normalizeManjuDraft, type ManjuDraft } from "@joyai/shared";
import { ManjuProject } from "../../database/entities/manju-project.entity";
import { newId } from "../../database/id";

function extractCoverUrl(draft: ManjuDraft): string | null {
  for (const shot of draft.shots) {
    if (shot.storyboardImageUrl) return shot.storyboardImageUrl;
  }
  for (const asset of draft.assets) {
    if (asset.imageUrl) return asset.imageUrl;
  }
  return null;
}

@Injectable()
export class ManjuService {
  constructor(
    @InjectRepository(ManjuProject)
    private readonly projects: Repository<ManjuProject>,
  ) {}

  async list(userId: string) {
    const rows = await this.projects.find({
      where: { userId },
      order: { updatedAt: "DESC" },
      select: ["id", "title", "coverUrl", "createdAt", "updatedAt"],
    });
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      coverUrl: p.coverUrl,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async get(userId: string, id: string) {
    const project = await this.projects.findOne({ where: { id, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    return this.toDto(project);
  }

  async create(userId: string, title?: string) {
    const draft = normalizeManjuDraft({});
    const project = await this.projects.save(
      this.projects.create({
        userId,
        title: title?.trim() || "未命名漫剧",
        coverUrl: null,
        draft,
      }),
    );
    return this.toDto(project);
  }

  async update(
    userId: string,
    id: string,
    patch: { title?: string; draft?: unknown },
  ) {
    const project = await this.projects.findOne({ where: { id, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");

    if (typeof patch.title === "string" && patch.title.trim()) {
      project.title = patch.title.trim();
    }
    if (patch.draft !== undefined) {
      const draft = normalizeManjuDraft(patch.draft);
      project.draft = draft as unknown as Record<string, unknown>;
      project.coverUrl = extractCoverUrl(draft);
    }

    await this.projects.save(project);
    return this.toDto(project);
  }

  async remove(userId: string, id: string) {
    const project = await this.projects.findOne({ where: { id, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    await this.projects.delete({ id, userId });
    return { ok: true };
  }

  /** LLM 分析完成后合并进草稿（服务端权威回写） */
  async applyAnalyzeResult(
    userId: string,
    projectId: string,
    jobId: string,
    analyze: {
      overview?: string;
      characters: Array<{ name: string; description: string }>;
      scenes: Array<{ name: string; description: string }>;
      props: Array<{ name: string; description: string }>;
      episodes: Array<{ title: string; summary: string }>;
      shots: Array<{
        visual: string;
        dialogue: string;
        assetNames: string[];
      }>;
    },
    writeShots = false,
  ) {
    const project = await this.projects.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new BadRequestException("漫剧项目不存在，无法回写分析结果");
    }

    const draft = normalizeManjuDraft(project.draft);
    const existingKeys = new Set(
      draft.assets.map((a) => `${a.kind}:${a.name}`),
    );

    const pushAsset = (
      kind: "character" | "scene" | "prop",
      name: string,
      description: string,
    ) => {
      const key = `${kind}:${name}`;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      draft.assets.push({
        id: newId(),
        kind,
        name,
        description,
        imageUrl: null,
        assetId: null,
        jobId: null,
        status: "idle",
      });
    };

    for (const c of analyze.characters) {
      pushAsset("character", c.name, c.description);
    }
    for (const s of analyze.scenes) {
      pushAsset("scene", s.name, s.description);
    }
    for (const p of analyze.props) {
      pushAsset("prop", p.name, p.description);
    }

    if (analyze.overview?.trim()) {
      draft.overview = analyze.overview.trim();
    }

    if (analyze.episodes.length > 0) {
      draft.episodes = analyze.episodes.map((ep) => ({
        id: newId(),
        title: ep.title,
        summary: ep.summary,
      }));
    }

    if (writeShots && analyze.shots.length > 0) {
      const nameToId = new Map(
        draft.assets.map((a) => [a.name, a.id] as const),
      );
      draft.shots = analyze.shots.map((shot, i) => ({
        id: newId(),
        index: i + 1,
        visual: shot.visual,
        dialogue: shot.dialogue ?? "",
        imagePrompt: "",
        videoPrompt: "",
        assetRefs: (shot.assetNames ?? [])
          .map((n) => nameToId.get(n))
          .filter((id): id is string => Boolean(id)),
        storyboardImageUrl: null,
        storyboardAssetId: null,
        storyboardJobId: null,
        storyboardStatus: "idle" as const,
        videoUrl: null,
        videoAssetId: null,
        videoJobId: null,
        videoStatus: "idle" as const,
      }));
      draft.scriptConfirmed = false;
    }

    draft.lastAnalyzeJobId = jobId;
    project.draft = draft as unknown as Record<string, unknown>;
    project.coverUrl = extractCoverUrl(draft);
    await this.projects.save(project);
    return this.toDto(project);
  }

  /** 锁定分镜内容（对白/画面），不覆盖已有提示词以外的媒体 */
  async applyScriptPlan(
    userId: string,
    projectId: string,
    jobId: string,
    shots: Array<{
      visual: string;
      dialogue: string;
      assetNames: string[];
    }>,
  ) {
    return this.applyAnalyzeResult(userId, projectId, jobId, {
      overview: "",
      characters: [],
      scenes: [],
      props: [],
      episodes: [],
      shots,
    }, true);
  }

  /** 只合并 image/video prompt，不改镜序与对白 */
  async applyAuthorPrompts(
    userId: string,
    projectId: string,
    jobId: string,
    prompts: Array<{
      index?: number;
      imagePrompt: string;
      videoPrompt: string;
    }>,
  ) {
    const project = await this.projects.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new BadRequestException("漫剧项目不存在，无法回写提示词");
    }
    const draft = normalizeManjuDraft(project.draft);
    const byIndex = new Map(
      prompts
        .filter((p) => p.index != null)
        .map((p) => [p.index!, p] as const),
    );
    draft.shots = draft.shots.map((shot, i) => {
      const hit = byIndex.get(shot.index) ?? prompts[i];
      if (!hit) return shot;
      return {
        ...shot,
        imagePrompt: hit.imagePrompt || shot.imagePrompt,
        videoPrompt: hit.videoPrompt || shot.videoPrompt,
      };
    });
    draft.scriptConfirmed = true;
    draft.lastAnalyzeJobId = jobId;
    project.draft = draft as unknown as Record<string, unknown>;
    await this.projects.save(project);
    return this.toDto(project);
  }

  private toDto(project: ManjuProject) {
    const draft = normalizeManjuDraft(project.draft);
    return {
      id: project.id,
      title: project.title,
      coverUrl: project.coverUrl,
      draft,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
