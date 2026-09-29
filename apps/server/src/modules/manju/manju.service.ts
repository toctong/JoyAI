import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Repository } from "typeorm";
import {
  normalizeCanvasAgentChat,
  normalizeManjuDraft,
  normalizeScriptProjectChat,
  type ManjuDraft,
} from "@joyai/shared";
import { ManjuProject } from "../../database/entities/manju-project.entity";
import { ManjuFolder } from "../../database/entities/manju-folder.entity";
import { ProjectChat } from "../../database/entities/project-chat.entity";
import { newId } from "../../database/id";
import {
  PROJECT_CHAT_SCOPE,
  deleteProjectChats,
  readProjectChat,
  writeProjectChat,
} from "../../database/project-chat.store";

function extractCoverUrl(draft: ManjuDraft): string | null {
  for (const shot of draft.shots) {
    if (shot.storyboardImageUrl) return shot.storyboardImageUrl;
  }
  for (const asset of draft.assets) {
    if (asset.imageUrl) return asset.imageUrl;
  }
  return null;
}

function sliceEpisodeSource(
  script: string,
  startQuote: string,
  endQuote: string,
): string {
  const text = script;
  const start = startQuote.trim();
  if (!start) return "";
  const i = text.indexOf(start);
  if (i < 0) return "";
  const end = endQuote.trim();
  let slice = text.slice(i);
  if (end) {
    const j = text.indexOf(end, i + start.length);
    if (j >= 0) slice = text.slice(i, j + end.length);
  }
  return slice.slice(0, 12000);
}

@Injectable()
export class ManjuService {
  constructor(
    @InjectRepository(ManjuProject)
    private readonly projects: Repository<ManjuProject>,
    @InjectRepository(ManjuFolder)
    private readonly folders: Repository<ManjuFolder>,
    @InjectRepository(ProjectChat)
    private readonly chats: Repository<ProjectChat>,
    private readonly dataSource: DataSource,
  ) {}

  async library(userId: string, folderId?: string | null) {
    const parentId = folderId ?? null;
    if (parentId) await this.requireFolder(userId, parentId);

    const [folderRows, projects] = await Promise.all([
      this.folders.find({
        where: {
          userId,
          parentId: parentId === null ? IsNull() : parentId,
        },
        order: { updatedAt: "DESC" },
        select: ["id", "title", "parentId", "createdAt", "updatedAt"],
      }),
      this.projects.find({
        where: {
          userId,
          folderId: parentId === null ? IsNull() : parentId,
        },
        order: { updatedAt: "DESC" },
        select: [
          "id",
          "title",
          "coverUrl",
          "folderId",
          "createdAt",
          "updatedAt",
        ],
      }),
    ]);

    const folderIds = folderRows.map((f) => f.id);
    const coverProjects =
      folderIds.length === 0
        ? []
        : await this.projects.find({
            where: { userId, folderId: In(folderIds) },
            order: { updatedAt: "DESC" },
            select: ["folderId", "coverUrl"],
          });
    const coversByFolder = new Map<string, string[]>();
    for (const p of coverProjects) {
      if (!p.folderId || !p.coverUrl) continue;
      const list = coversByFolder.get(p.folderId) ?? [];
      if (list.length >= 6) continue;
      list.push(p.coverUrl);
      coversByFolder.set(p.folderId, list);
    }

    return {
      folderId: parentId,
      folders: folderRows.map((f) => ({
        id: f.id,
        title: f.title,
        parentId: f.parentId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        coverUrls: coversByFolder.get(f.id) ?? [],
      })),
      projects,
    };
  }

  listFolders(userId: string) {
    return this.folders.find({
      where: { userId },
      order: { updatedAt: "DESC" },
      select: ["id", "title", "parentId", "updatedAt"],
    });
  }

  async createFolder(
    userId: string,
    title?: string,
    parentId?: string | null,
  ) {
    if (parentId) await this.requireFolder(userId, parentId);
    const folder = await this.folders.save(
      this.folders.create({
        userId,
        title: title?.trim() || "新建合集",
        parentId: parentId ?? null,
      }),
    );
    return {
      id: folder.id,
      title: folder.title,
      parentId: folder.parentId,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  async updateFolder(
    userId: string,
    id: string,
    data: { title?: string; parentId?: string | null },
  ) {
    const folder = await this.requireFolder(userId, id);
    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) {
        throw new BadRequestException("不能将合集移动到自身");
      }
      await this.requireFolder(userId, data.parentId);
      await this.assertNotDescendant(userId, id, data.parentId);
    }
    if (data.title !== undefined) {
      folder.title = data.title.trim() || "新建合集";
    }
    if (data.parentId !== undefined) folder.parentId = data.parentId;
    const saved = await this.folders.save(folder);
    return {
      id: saved.id,
      title: saved.title,
      parentId: saved.parentId,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async deleteFolder(userId: string, id: string) {
    const folder = await this.requireFolder(userId, id);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        ManjuProject,
        { userId, folderId: id },
        { folderId: folder.parentId },
      );
      await manager.update(
        ManjuFolder,
        { userId, parentId: id },
        { parentId: folder.parentId },
      );
      await manager.delete(ManjuFolder, { id });
    });
    return { ok: true };
  }

  async moveProjects(userId: string, ids: string[], folderId: string | null) {
    if (!ids.length) throw new BadRequestException("未选择项目");
    if (folderId) await this.requireFolder(userId, folderId);
    const result = await this.projects.update(
      { userId, id: In(ids) },
      { folderId },
    );
    return { ok: true, count: result.affected ?? 0 };
  }

  async deleteProjects(userId: string, ids: string[]) {
    if (!ids.length) throw new BadRequestException("未选择项目");
    const result = await this.projects.delete({ userId, id: In(ids) });
    await deleteProjectChats(this.chats, PROJECT_CHAT_SCOPE.manjuScript, ids);
    await deleteProjectChats(this.chats, PROJECT_CHAT_SCOPE.manjuAgent, ids);
    return { ok: true, count: result.affected ?? 0 };
  }

  private async requireFolder(userId: string, id: string) {
    const folder = await this.folders.findOne({ where: { id, userId } });
    if (!folder) throw new NotFoundException("合集不存在");
    return folder;
  }

  private async assertNotDescendant(
    userId: string,
    ancestorId: string,
    candidateId: string,
  ) {
    let cursor: string | null = candidateId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === ancestorId) {
        throw new BadRequestException("不能将合集移动到其子合集中");
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const next = await this.folders.findOne({
        where: { id: cursor, userId },
        select: ["parentId"],
      });
      cursor = next?.parentId ?? null;
    }
  }

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

  async create(userId: string, title?: string, folderId?: string | null) {
    if (folderId) await this.requireFolder(userId, folderId);
    const draft = normalizeManjuDraft({});
    const project = await this.projects.save(
      this.projects.create({
        userId,
        title: title?.trim() || "未命名漫剧",
        coverUrl: null,
        folderId: folderId ?? null,
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
    await deleteProjectChats(this.chats, PROJECT_CHAT_SCOPE.manjuScript, [id]);
    await deleteProjectChats(this.chats, PROJECT_CHAT_SCOPE.manjuAgent, [id]);
    return { ok: true };
  }

  async getScriptChat(userId: string, projectId: string) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const row = await readProjectChat(
      this.chats,
      userId,
      PROJECT_CHAT_SCOPE.manjuScript,
      projectId,
    );
    if (!row) return null;
    return normalizeScriptProjectChat(row.payload);
  }

  async saveScriptChat(userId: string, projectId: string, raw: unknown) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const chat = normalizeScriptProjectChat(raw);
    if (!chat) throw new BadRequestException("会话格式无效");
    await writeProjectChat(
      this.chats,
      userId,
      PROJECT_CHAT_SCOPE.manjuScript,
      projectId,
      chat as unknown as Record<string, unknown>,
    );
    return chat;
  }

  async getAgentChat(userId: string, projectId: string) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const row = await readProjectChat(
      this.chats,
      userId,
      PROJECT_CHAT_SCOPE.manjuAgent,
      projectId,
    );
    if (!row) return null;
    return normalizeCanvasAgentChat(row.payload);
  }

  async saveAgentChat(userId: string, projectId: string, raw: unknown) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const chat = normalizeCanvasAgentChat(raw);
    if (!chat) throw new BadRequestException("会话格式无效");
    await writeProjectChat(
      this.chats,
      userId,
      PROJECT_CHAT_SCOPE.manjuAgent,
      projectId,
      chat as unknown as Record<string, unknown>,
    );
    return chat;
  }

  async getWorkflowSummary(userId: string, projectId: string) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const draft = normalizeManjuDraft(project.draft);

    const blockers: string[] = [];
    const hasScript = Boolean(draft.scriptText.trim());
    const assetsWithImage = draft.assets.filter((a) => Boolean(a.imageUrl));
    const hasShots = draft.shots.length > 0;
    const scriptConfirmed =
      draft.scriptConfirmed || draft.scriptReview.status === "confirmed";
    const shotsNeedingStoryboard = draft.shots.filter((s) => !s.storyboardImageUrl);
    const shotsNeedingVideo = draft.shots.filter(
      (s) => s.storyboardImageUrl && !s.videoUrl,
    );
    const videosReady = draft.shots.filter((s) => Boolean(s.videoUrl));

    if (!hasScript) blockers.push("no_script");
    if (draft.assets.length === 0) blockers.push("no_assets");
    else if (assetsWithImage.length === 0) blockers.push("no_asset_images");
    if (hasShots && !scriptConfirmed) blockers.push("script_unconfirmed");
    if (hasShots && shotsNeedingStoryboard.length > 0) {
      blockers.push("storyboard_incomplete");
    }
    if (scriptConfirmed && shotsNeedingVideo.length > 0) {
      blockers.push("video_incomplete");
    }

    let nextAction:
      | "import_script"
      | "analyze_assets"
      | "confirm_script"
      | "generate_storyboard"
      | "generate_video"
      | "preview" = "import_script";

    if (!hasScript) {
      nextAction = "import_script";
    } else if (draft.assets.length === 0 || assetsWithImage.length === 0) {
      nextAction = "analyze_assets";
    } else if (!hasShots) {
      nextAction = "confirm_script";
    } else if (!scriptConfirmed) {
      nextAction = "confirm_script";
    } else if (shotsNeedingStoryboard.length > 0) {
      nextAction = "generate_storyboard";
    } else if (shotsNeedingVideo.length > 0) {
      nextAction = "generate_video";
    } else {
      nextAction = "preview";
    }

    const staleShotIds = draft.shots
      .filter((s) => s.storyboardStale || s.videoStale)
      .map((s) => s.id);

    return {
      phase: draft.phase,
      scriptConfirmed,
      blockers,
      nextAction,
      staleShotIds,
      counts: {
        assets: draft.assets.length,
        assetsWithImage: assetsWithImage.length,
        shots: draft.shots.length,
        storyboards: draft.shots.filter((s) => Boolean(s.storyboardImageUrl))
          .length,
        videos: videosReady.length,
      },
    };
  }

  async getScriptReview(userId: string, projectId: string) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const draft = normalizeManjuDraft(project.draft);
    return draft.scriptReview;
  }

  async saveScriptReviewContent(
    userId: string,
    projectId: string,
    content: string,
  ) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const draft = normalizeManjuDraft(project.draft);
    draft.scriptReview = {
      ...draft.scriptReview,
      content: typeof content === "string" ? content : "",
      status: "draft",
    };
    draft.scriptConfirmed = false;
    project.draft = draft as unknown as Record<string, unknown>;
    await this.projects.save(project);
    return this.toDto(project);
  }

  async confirmScriptReview(userId: string, projectId: string) {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException("漫剧项目不存在");
    const draft = normalizeManjuDraft(project.draft);
    if (!draft.scriptText.trim() && !draft.scriptReview.content.trim()) {
      throw new BadRequestException("剧本为空，无法确认");
    }
    draft.scriptConfirmed = true;
    draft.scriptReview = {
      ...draft.scriptReview,
      status: "confirmed",
      content:
        draft.scriptReview.content.trim() ||
        draft.scriptText ||
        draft.scriptReview.content,
    };
    project.draft = draft as unknown as Record<string, unknown>;
    await this.projects.save(project);
    return this.toDto(project);
  }

  /** LLM 分析完成后合并进草稿（服务端权威回写） */
  async applyAnalyzeResult(
    userId: string,
    projectId: string,
    jobId: string,
    analyze: {
      overview?: string;
      tags?: string[];
      characters: Array<{ name: string; description: string; aliases?: string[] }>;
      scenes: Array<{ name: string; description: string; aliases?: string[] }>;
      props: Array<{ name: string; description: string; aliases?: string[] }>;
      episodes: Array<{ title: string; summary: string }>;
      shots: Array<{
        index?: number;
        visual: string;
        dialogue: string;
        assetNames: string[];
        episodeTitle?: string;
      }>;
    },
    writeShots = false,
    scopeEpisodeId?: string | null,
    analyzeMode: "incremental" | "full_add" | "clear_reparse" = "incremental",
  ) {
    const project = await this.projects.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new BadRequestException("漫剧项目不存在，无法回写分析结果");
    }

    const draft = normalizeManjuDraft(project.draft);

    if (analyzeMode === "clear_reparse") {
      const clearedIds = new Set(draft.assets.map((a) => a.id));
      draft.assets = [];
      for (const shot of draft.shots) {
        shot.assetRefs = (shot.assetRefs ?? []).filter(
          (id) => !clearedIds.has(id),
        );
      }
    }

    const existingKeys = new Set(
      draft.assets.map((a) => `${a.kind}:${a.name}`),
    );
    const allowDup = analyzeMode === "full_add";

    const pushAsset = (
      kind: "character" | "scene" | "prop",
      name: string,
      description: string,
      aliases: string[] = [],
    ) => {
      const key = `${kind}:${name}`;
      const cleanAliases = aliases
        .map((a) => a.trim())
        .filter((a) => a && a !== name);
      if (!allowDup && existingKeys.has(key)) {
        const hit = draft.assets.find((a) => a.kind === kind && a.name === name);
        if (hit && cleanAliases.length) {
          const merged = new Set([...(hit.aliases ?? []), ...cleanAliases]);
          hit.aliases = [...merged];
        }
        return;
      }
      existingKeys.add(key);
      draft.assets.push({
        id: newId(),
        kind,
        name,
        description,
        aliases: cleanAliases,
        parentId: null,
        imageUrl: null,
        assetId: null,
        jobId: null,
        status: "idle",
      });
    };

    for (const c of analyze.characters) {
      pushAsset("character", c.name, c.description, c.aliases);
    }
    for (const s of analyze.scenes) {
      pushAsset("scene", s.name, s.description, s.aliases);
    }
    for (const p of analyze.props) {
      pushAsset("prop", p.name, p.description, p.aliases);
    }

    if (analyze.overview?.trim()) {
      draft.overview = analyze.overview.trim();
    }

    const nextTags = (analyze.tags ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (nextTags.length > 0) {
      draft.tags = nextTags;
    }

    if (analyze.episodes.length > 0) {
      const byTitle = new Map(
        draft.episodes.map((ep) => [ep.title.trim(), ep] as const),
      );
      draft.episodes = analyze.episodes.map((ep) => {
        const prev = byTitle.get(ep.title.trim());
        return {
          id: prev?.id ?? newId(),
          title: ep.title,
          summary: ep.summary?.trim() || prev?.summary || "",
          hook: prev?.hook ?? "",
          sourceText: prev?.sourceText ?? "",
        };
      });
      // 解析未切原文时：单集挂全文；多集也先挂到第 1 集，避免制作视频无内容
      if (draft.scriptText.trim()) {
        const allEmpty = draft.episodes.every((e) => !e.sourceText?.trim());
        if (allEmpty) {
          draft.episodes[0]!.sourceText = draft.scriptText;
        } else if (
          draft.episodes.length === 1 &&
          !draft.episodes[0]!.sourceText?.trim()
        ) {
          draft.episodes[0]!.sourceText = draft.scriptText;
        }
      }
    } else if (draft.episodes.length === 0 && draft.scriptText.trim()) {
      // 解析未返回分集时，默认落第 1 集，便于「制作视频」
      draft.episodes = [
        {
          id: newId(),
          title: "第1集",
          summary: draft.overview?.trim() || "",
          hook: "",
          sourceText: draft.scriptText,
        },
      ];
    }

    if (writeShots && analyze.shots.length > 0) {
      const nameToId = new Map<string, string>();
      for (const a of draft.assets) {
        if (!nameToId.has(a.name)) nameToId.set(a.name, a.id);
        nameToId.set(`${a.kind}:${a.name}`, a.id);
        if (a.parentId) {
          const parent = draft.assets.find((p) => p.id === a.parentId);
          if (parent?.name) {
            const reg = `${parent.name.trim()}/${a.name.trim()}`;
            if (!nameToId.has(reg)) nameToId.set(reg, a.id);
          }
        }
        for (const alias of a.aliases ?? []) {
          const key = alias.trim();
          if (key && !nameToId.has(key)) nameToId.set(key, a.id);
        }
      }
      const episodeByTitle = new Map(
        draft.episodes.map((ep) => [ep.title.trim(), ep.id] as const),
      );
      const soleEpisodeId =
        draft.episodes.length === 1 ? draft.episodes[0]!.id : null;
      const scopedId =
        scopeEpisodeId && draft.episodes.some((ep) => ep.id === scopeEpisodeId)
          ? scopeEpisodeId
          : null;

      const others = scopedId
        ? draft.shots.filter((s) => s.episodeId !== scopedId)
        : [];
      const prevPool = scopedId
        ? draft.shots.filter((s) => s.episodeId === scopedId)
        : draft.shots;
      const prevByIndex = new Map(prevPool.map((s) => [s.index, s] as const));
      const prevByOrder = [...prevPool].sort((a, b) => a.index - b.index);

      const incomingIndexes = analyze.shots
        .map((shot) => shot.index)
        .filter((idx): idx is number => typeof idx === "number" && idx > 0);

      // 全项目规划：镜号全对不上则拒绝。分集内规划按顺序合并，允许局部从 1 起。
      if (!scopedId && incomingIndexes.length > 0 && draft.shots.length > 0) {
        const known = new Set(draft.shots.map((s) => s.index));
        const unknown = incomingIndexes.filter((idx) => !known.has(idx));
        if (unknown.length === incomingIndexes.length) {
          throw new BadRequestException(
            `分镜序号全部无效（${unknown.slice(0, 8).join(", ")}），已保留原镜头`,
          );
        }
      }

      const baseIndex = others.reduce((m, s) => Math.max(m, s.index), 0);
      const forcedTitle =
        scopedId != null
          ? draft.episodes.find((ep) => ep.id === scopedId)?.title.trim() || ""
          : "";

      const built = analyze.shots.map((shot, i) => {
        const byIndex =
          typeof shot.index === "number" && shot.index > 0
            ? prevByIndex.get(shot.index)
            : undefined;
        const byOrder = prevByOrder[i];
        const prev = byIndex ?? (scopedId ? byOrder : undefined);
        const index =
          prev?.index ??
          (typeof shot.index === "number" &&
          shot.index > 0 &&
          !scopedId
            ? shot.index
            : baseIndex + i + 1);
        const epTitle = (shot.episodeTitle ?? "").trim() || forcedTitle;
        const episodeId =
          scopedId ||
          (epTitle && episodeByTitle.get(epTitle)) ||
          prev?.episodeId ||
          soleEpisodeId;
        return {
          id: prev?.id ?? newId(),
          index,
          visual: shot.visual,
          dialogue: shot.dialogue ?? "",
          imagePrompt: prev?.imagePrompt ?? "",
          videoPrompt: prev?.videoPrompt ?? "",
          duration: prev?.duration ?? null,
          episodeId: episodeId ?? null,
          assetRefs: (shot.assetNames ?? [])
            .map((n) => nameToId.get(n))
            .filter((id): id is string => Boolean(id)),
          storyboardImageUrl: prev?.storyboardImageUrl ?? null,
          storyboardAssetId: prev?.storyboardAssetId ?? null,
          storyboardJobId: prev?.storyboardJobId ?? null,
          storyboardStatus: prev?.storyboardStatus ?? ("idle" as const),
          videoUrl: prev?.videoUrl ?? null,
          videoAssetId: prev?.videoAssetId ?? null,
          videoJobId: prev?.videoJobId ?? null,
          videoStatus: prev?.videoStatus ?? ("idle" as const),
          storyboardStale: prev?.storyboardStale ?? false,
          videoStale: prev?.videoStale ?? false,
          gridGroupId: prev?.gridGroupId ?? null,
          gridCellIndex: prev?.gridCellIndex ?? null,
          endFrameAssetId: prev?.endFrameAssetId ?? null,
          endFrameImageUrl: prev?.endFrameImageUrl ?? null,
          utterances: prev?.utterances ?? [],
        };
      });

      const merged = scopedId
        ? [...others, ...built].sort((a, b) => a.index - b.index)
        : built;
      // 压成连续全局镜号，避免分集插入后出现空洞
      draft.shots = merged.map((s, i) => ({ ...s, index: i + 1 }));
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
      episodeTitle?: string;
      index?: number;
    }>,
    scopeEpisodeId?: string | null,
  ) {
    return this.applyAnalyzeResult(
      userId,
      projectId,
      jobId,
      {
        overview: "",
        characters: [],
        scenes: [],
        props: [],
        episodes: [],
        shots,
      },
      true,
      scopeEpisodeId,
    );
  }

  /** 只合并 image/video prompt，不改镜序与对白 */
  async applyAuthorPrompts(
    userId: string,
    projectId: string,
    jobId: string,
    prompts: Array<{
      index: number;
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
    const byIndex = new Map(prompts.map((p) => [p.index, p] as const));
    const unknown = prompts
      .map((p) => p.index)
      .filter((idx) => !draft.shots.some((s) => s.index === idx));
    const applied = prompts.filter((p) =>
      draft.shots.some((s) => s.index === p.index),
    );
    if (applied.length === 0) {
      throw new BadRequestException(
        unknown.length > 0
          ? `提示词序号全部无效：${unknown.slice(0, 8).join(", ")}`
          : "未返回任何提示词",
      );
    }
    draft.shots = draft.shots.map((shot) => {
      const hit = byIndex.get(shot.index);
      if (!hit) return shot;
      return {
        ...shot,
        imagePrompt: hit.imagePrompt,
        videoPrompt: hit.videoPrompt,
      };
    });
    draft.scriptConfirmed = true;
    draft.lastAnalyzeJobId = jobId;
    project.draft = draft as unknown as Record<string, unknown>;
    await this.projects.save(project);
    return this.toDto(project);
  }

  /** 只合并连载记忆，不改镜头、对白、媒体和 scriptConfirmed */
  async applySeriesMemory(
    userId: string,
    projectId: string,
    jobId: string,
    memory: {
      world: string;
      bios: Array<{ name: string; bio: string }>;
      hooks: string[];
    },
  ) {
    const project = await this.projects.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new BadRequestException("漫剧项目不存在，无法回写连载记忆");
    }
    const draft = normalizeManjuDraft(project.draft);
    const world = memory.world.trim();
    const bios = memory.bios
      .map((b) => ({ name: b.name.trim(), bio: b.bio.trim() }))
      .filter((b) => b.name);
    const hooks = memory.hooks.map((h) => h.trim()).filter(Boolean);
    if (!world && bios.length === 0 && hooks.length === 0) {
      throw new BadRequestException("未返回连载记忆，已保留原文");
    }

    const byName = new Map(
      draft.series.bios.map((b) => [b.name.trim(), b] as const),
    );
    for (const bio of bios) {
      byName.set(bio.name, { name: bio.name, bio: bio.bio });
    }

    const seen = new Set(draft.series.hooks.map((h) => h.text.trim()));
    const nextHooks = [...draft.series.hooks];
    for (const text of hooks) {
      if (seen.has(text)) continue;
      seen.add(text);
      nextHooks.push({ text, status: "open" });
    }

    draft.series = {
      world: world || draft.series.world,
      bios: [...byName.values()],
      hooks: nextHooks,
    };
    draft.lastAnalyzeJobId = jobId;
    project.draft = draft as unknown as Record<string, unknown>;
    await this.projects.save(project);
    return this.toDto(project);
  }

  /** 只合并分集（标题/摘要/钩子/原文切片），不改镜头、对白和媒体 */
  async applyEpisodePlan(
    userId: string,
    projectId: string,
    jobId: string,
    episodes: Array<{
      title: string;
      summary: string;
      hook: string;
      startQuote: string;
      endQuote: string;
    }>,
  ) {
    const project = await this.projects.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new BadRequestException("漫剧项目不存在，无法回写分集");
    }
    const draft = normalizeManjuDraft(project.draft);
    const script = draft.scriptText;
    const byTitle = new Map(
      draft.episodes.map((ep) => [ep.title.trim(), ep] as const),
    );
    const next = episodes.map((ep) => {
      const title = ep.title.trim();
      const prev = byTitle.get(title);
      byTitle.delete(title);
      return {
        id: prev?.id ?? newId(),
        title,
        summary: ep.summary.trim() || prev?.summary || "",
        hook: ep.hook.trim() || prev?.hook || "",
        sourceText: sliceEpisodeSource(script, ep.startQuote, ep.endQuote) || prev?.sourceText || "",
      };
    });
    // 模型没提到、但已有镜头挂着的旧集保留，避免 episodeId 断掉
    for (const leftover of byTitle.values()) {
      const used = draft.shots.some((s) => s.episodeId === leftover.id);
      if (used) next.push(leftover);
    }
    draft.episodes = next;
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
