import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { resolveAudioProvider } from "@joyai/ai-providers";
import { AdapterId } from "@joyai/shared";
import {
  makeAdminExport,
  parseAdminImportItems,
} from "../../common/admin-export";
import { TtsVoice } from "../../database/entities/tts-voice.entity";
import { Channel } from "../../database/entities/channel.entity";
import { Model } from "../../database/entities/model.entity";
import { JobKind } from "../../database/enums";
import { ChannelsService } from "../channels/channels.service";
import { StorageService } from "../storage/storage.service";

export type TtsVoiceListQuery = {
  enabled?: boolean;
  q?: string;
  provider?: string;
  channelId?: string;
  category?: string;
};

export type TtsVoiceInput = {
  slug: string;
  label: string;
  voiceId: string;
  /** 绑定渠道；优先于 provider */
  channelId?: string | null;
  provider?: string;
  gender?: string | null;
  language?: string | null;
  category?: string;
  description?: string | null;
  sampleText?: string | null;
  previewAudioUrl?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

export type TtsVoiceExportItem = {
  slug: string;
  label: string;
  voiceId: string;
  channelName: string;
  channelPlatform: string;
  provider: string;
  gender: string | null;
  language: string | null;
  category: string;
  description: string | null;
  sampleText: string | null;
  previewAudioUrl: string | null;
  enabled: boolean;
  sortOrder: number;
};

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function providerFromPlatform(platform: string): string {
  const p = platform.trim().toLowerCase();
  if (p === "dashscope") return "dashscope";
  if (p === "volcengine") return "volcengine";
  return "openai";
}

function adapterForProvider(provider: string): string | null {
  const p = provider.trim().toLowerCase();
  if (p === "dashscope") return AdapterId.DASHSCOPE_AUDIO;
  if (p === "volcengine") return AdapterId.VOLCENGINE_AUDIO;
  if (p === "openai") return AdapterId.OPENAI_AUDIO;
  return null;
}

/** 统一成中文性别：男 / 女 / 其他 */
function normalizeGender(raw?: string | null): string | null {
  const g = raw?.trim();
  if (!g) return null;
  const key = g.toLowerCase();
  if (key === "male" || g === "男") return "男";
  if (key === "female" || g === "女") return "女";
  if (
    key === "neutral" ||
    g === "中性" ||
    g === "其他" ||
    g === "未知"
  ) {
    return "其他";
  }
  return g;
}

@Injectable()
export class VoicesService {
  constructor(
    @InjectRepository(TtsVoice)
    private readonly voices: Repository<TtsVoice>,
    @InjectRepository(Model)
    private readonly models: Repository<Model>,
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    private readonly channels: ChannelsService,
    private readonly storage: StorageService,
  ) {}

  async listPublic(opts?: { provider?: string; category?: string }) {
    const qb = this.voices
      .createQueryBuilder("v")
      .where("v.enabled = :enabled", { enabled: true })
      .orderBy("v.sortOrder", "ASC")
      .addOrderBy("v.createdAt", "ASC");
    const provider = opts?.provider?.trim();
    if (provider) {
      qb.andWhere("v.provider = :provider", { provider });
    }
    const cat = opts?.category?.trim();
    if (cat && cat !== "全部") {
      qb.andWhere("v.category = :category", { category: cat });
    }
    return qb.getMany();
  }

  async listCategories() {
    const rows = await this.voices
      .createQueryBuilder("v")
      .select("v.category", "category")
      .where("v.enabled = :enabled", { enabled: true })
      .groupBy("v.category")
      .orderBy("v.category", "ASC")
      .getRawMany<{ category: string }>();
    return rows.map((r) => r.category).filter(Boolean);
  }

  async listAdmin(opts?: TtsVoiceListQuery) {
    const qb = this.voices
      .createQueryBuilder("v")
      .orderBy("v.sortOrder", "ASC")
      .addOrderBy("v.createdAt", "ASC");
    if (opts?.enabled !== undefined) {
      qb.andWhere("v.enabled = :enabled", { enabled: opts.enabled });
    }
    const channelId = opts?.channelId?.trim();
    const provider = opts?.provider?.trim();
    if (provider && provider !== "all") {
      qb.andWhere("v.provider = :provider", { provider });
    }
    const cat = opts?.category?.trim();
    if (cat) {
      qb.andWhere("v.category = :category", { category: cat });
    }
    const q = opts?.q?.trim();
    if (q) {
      qb.andWhere(
        "(v.slug LIKE :q OR v.label LIKE :q OR v.voiceId LIKE :q OR v.category LIKE :q OR v.description LIKE :q)",
        { q: `%${q}%` },
      );
    }
    const rows = await qb.getMany();
    const hints = await this.buildResolvedModelHints(rows);
    const channelIds = [
      ...new Set(
        [
          ...rows.map((r) => r.channelId),
          ...[...hints.values()].map((h) => h?.channelId),
        ].filter(Boolean) as string[],
      ),
    ];
    const channelMap = new Map<string, Channel>();
    if (channelIds.length) {
      const chans = await this.channelRepo.find({
        where: { id: In(channelIds) },
      });
      for (const c of chans) channelMap.set(c.id, c);
    }
    const mapped = rows.map((row) => {
      const hint = hints.get(row.id) ?? null;
      const ch =
        (row.channelId ? channelMap.get(row.channelId) : null) ??
        (hint?.channelId ? channelMap.get(hint.channelId) : null) ??
        null;
      return {
        ...row,
        gender: normalizeGender(row.gender),
        channelId: row.channelId || hint?.channelId || null,
        channelName: ch?.name ?? hint?.channelName ?? null,
        channelPlatform: ch?.platform ?? null,
        resolvedModel: hint,
      };
    });
    if (channelId && channelId !== "all") {
      return mapped.filter(
        (row) =>
          row.channelId === channelId ||
          row.resolvedModel?.channelId === channelId,
      );
    }
    return mapped;
  }

  /** 列表展示：按音色解析默认音频模型 */
  private async buildResolvedModelHints(rows: TtsVoice[]) {
    const out = new Map<
      string,
      {
        id: string;
        name: string;
        remoteId: string;
        channelName: string;
        channelId: string;
      } | null
    >();
    for (const row of rows) {
      try {
        const model = await this.resolvePreviewModel(
          row.provider,
          undefined,
          row.channelId,
        );
        out.set(row.id, {
          id: model.id,
          name: model.name,
          remoteId: model.remoteId,
          channelName: model.channel?.name ?? "",
          channelId: model.channelId,
        });
      } catch {
        out.set(row.id, null);
      }
    }
    return out;
  }

  /** 已启用渠道，供管理端下拉（有音频模型的排前面） */
  async listAudioChannels() {
    const channels = await this.channelRepo.find({
      where: { enabled: true },
      order: { name: "ASC" },
    });
    const audioRows = await this.models
      .createQueryBuilder("m")
      .select("m.channelId", "channelId")
      .where("m.kind = :kind", { kind: JobKind.audio })
      .andWhere("m.enabled = :me", { me: true })
      .groupBy("m.channelId")
      .getRawMany<{ channelId: string }>();
    const withAudio = new Set(audioRows.map((r) => r.channelId));
    return channels
      .slice()
      .sort((a, b) => {
        const ad = withAudio.has(a.id) ? 0 : 1;
        const bd = withAudio.has(b.id) ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return a.name.localeCompare(b.name, "zh");
      })
      .map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
  }

  private async bindChannel(channelId?: string | null) {
    const id = channelId?.trim() || null;
    if (!id) return { channelId: null as string | null, provider: "openai" };
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new BadRequestException("渠道不存在");
    return {
      channelId: channel.id,
      provider: providerFromPlatform(channel.platform),
    };
  }

  async get(id: string) {
    const row = await this.voices.findOne({ where: { id } });
    if (!row) throw new NotFoundException("音色不存在");
    return row;
  }

  async create(input: TtsVoiceInput) {
    const slug = slugify(input.slug);
    const label = input.label?.trim();
    const voiceId = input.voiceId?.trim();
    if (!slug) throw new BadRequestException("slug 必填");
    if (!label) throw new BadRequestException("名称必填");
    if (!voiceId) throw new BadRequestException("voiceId 必填");
    const exists = await this.voices.findOne({ where: { slug } });
    if (exists) throw new BadRequestException("slug 已存在");
    const bound = input.channelId
      ? await this.bindChannel(input.channelId)
      : {
          channelId: null as string | null,
          provider: (input.provider?.trim() || "openai").toLowerCase(),
        };
    const row = this.voices.create({
      slug,
      label,
      voiceId,
      channelId: bound.channelId,
      provider: bound.provider,
      gender: normalizeGender(input.gender),
      language: input.language?.trim() || null,
      category: input.category?.trim() || "通用",
      description: input.description?.trim() || null,
      sampleText: input.sampleText?.trim() || null,
      previewAudioUrl: input.previewAudioUrl?.trim() || null,
      enabled: input.enabled !== false,
      builtin: false,
      sortOrder: input.sortOrder ?? 100,
    });
    return this.voices.save(row);
  }

  async update(id: string, input: Partial<TtsVoiceInput>) {
    const row = await this.get(id);
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (!slug) throw new BadRequestException("slug 无效");
      if (slug !== row.slug) {
        const exists = await this.voices.findOne({ where: { slug } });
        if (exists) throw new BadRequestException("slug 已存在");
        row.slug = slug;
      }
    }
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw new BadRequestException("名称无效");
      row.label = label;
    }
    if (input.voiceId !== undefined) {
      const voiceId = input.voiceId.trim();
      if (!voiceId) throw new BadRequestException("voiceId 无效");
      row.voiceId = voiceId;
    }
    if (input.channelId !== undefined) {
      const bound = await this.bindChannel(input.channelId);
      row.channelId = bound.channelId;
      row.provider = bound.provider;
    } else if (input.provider !== undefined) {
      row.provider = input.provider.trim().toLowerCase() || "openai";
    }
    if (input.gender !== undefined) {
      row.gender = normalizeGender(input.gender);
    }
    if (input.language !== undefined) {
      row.language = input.language?.trim() || null;
    }
    if (input.category !== undefined) {
      row.category = input.category.trim() || "通用";
    }
    if (input.description !== undefined) {
      row.description = input.description?.trim() || null;
    }
    if (input.sampleText !== undefined) {
      row.sampleText = input.sampleText?.trim() || null;
    }
    if (input.previewAudioUrl !== undefined) {
      row.previewAudioUrl = input.previewAudioUrl?.trim() || null;
    }
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    return this.voices.save(row);
  }

  async remove(id: string) {
    const row = await this.get(id);
    await this.voices.remove(row);
    return { ok: true };
  }

  async exportAll(ids?: string[]) {
    const rows = await this.voices.find({
      where: ids?.length ? { id: In(ids) } : undefined,
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const channelIds = [
      ...new Set(rows.map((r) => r.channelId).filter(Boolean) as string[]),
    ];
    const channelMap = new Map<string, Channel>();
    if (channelIds.length) {
      const chans = await this.channelRepo.find({
        where: { id: In(channelIds) },
      });
      for (const c of chans) channelMap.set(c.id, c);
    }
    const items: TtsVoiceExportItem[] = rows.map((r) => {
      const ch = r.channelId ? channelMap.get(r.channelId) : null;
      return {
        slug: r.slug,
        label: r.label,
        voiceId: r.voiceId,
        channelName: ch?.name ?? "",
        channelPlatform: ch?.platform ?? "",
        provider: r.provider,
        gender: normalizeGender(r.gender),
        language: r.language,
        category: r.category,
        description: r.description,
        sampleText: r.sampleText,
        previewAudioUrl: r.previewAudioUrl,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
      };
    });
    return makeAdminExport("voices", items);
  }

  private async resolveImportChannel(
    item: TtsVoiceExportItem,
  ): Promise<{ channelId: string | null; provider: string }> {
    const name = String(item.channelName ?? "").trim();
    const platform = String(item.channelPlatform ?? "").trim().toLowerCase();
    if (name) {
      const qb = this.channelRepo
        .createQueryBuilder("c")
        .where("c.name = :name", { name });
      if (platform) qb.andWhere("c.platform = :platform", { platform });
      const hit = await qb.getOne();
      if (hit) {
        return {
          channelId: hit.id,
          provider: providerFromPlatform(hit.platform),
        };
      }
    }
    return {
      channelId: null,
      provider:
        String(item.provider ?? "openai").trim().toLowerCase() || "openai",
    };
  }

  async importItems(body: unknown) {
    let raw: TtsVoiceExportItem[];
    try {
      raw = parseAdminImportItems<TtsVoiceExportItem>(body, "voices");
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "导入失败",
      );
    }
    let created = 0;
    let updated = 0;
    for (const item of raw) {
      const slug = slugify(String(item.slug ?? ""));
      const label = String(item.label ?? "").trim();
      const voiceId = String(item.voiceId ?? "").trim();
      if (!slug || !label || !voiceId) continue;
      const existing = await this.voices.findOne({ where: { slug } });
      const bound = await this.resolveImportChannel(item);
      const payload = {
        label,
        voiceId,
        channelId: bound.channelId,
        provider: bound.provider,
        gender: normalizeGender(item.gender),
        language: item.language?.trim() || null,
        category: String(item.category ?? "通用").trim() || "通用",
        description: item.description?.trim() || null,
        sampleText: item.sampleText?.trim() || null,
        previewAudioUrl: item.previewAudioUrl?.trim() || null,
        enabled: item.enabled !== false,
        sortOrder: Number(item.sortOrder) || 100,
        builtin: false,
      };
      if (existing) {
        Object.assign(existing, payload);
        await this.voices.save(existing);
        updated += 1;
      } else {
        await this.voices.save(this.voices.create({ slug, ...payload }));
        created += 1;
      }
    }
    return { created, updated, total: raw.length };
  }

  /**
   * 对勾选的音色批量生成试听（已有 URL 也会重跑覆盖）。
   */
  async generatePreviewsForIds(ids: string[]) {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!unique.length) {
      throw new BadRequestException("请先勾选要生成的音色");
    }
    const rows = await this.voices.find({ where: { id: In(unique) } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const results: Array<{
      id: string;
      slug: string;
      ok: boolean;
      previewAudioUrl?: string | null;
      error?: string;
    }> = [];

    for (const id of unique) {
      const row = byId.get(id);
      if (!row) {
        results.push({ id, slug: "", ok: false, error: "音色不存在" });
        continue;
      }
      try {
        const out = await this.generatePreview(row.id);
        results.push({
          id: row.id,
          slug: row.slug,
          ok: true,
          previewAudioUrl: out.previewAudioUrl,
        });
      } catch (error) {
        results.push({
          id: row.id,
          slug: row.slug,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      total: unique.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /** 按绑定渠道（优先）或协议族挑已启用音频模型 */
  async resolvePreviewModel(
    provider: string,
    modelId?: string,
    channelId?: string | null,
  ) {
    if (modelId?.trim()) {
      return this.channels.resolveForKind("audio", modelId.trim());
    }
    const models = await this.models
      .createQueryBuilder("m")
      .innerJoinAndSelect("m.channel", "c")
      .where("m.kind = :kind", { kind: JobKind.audio })
      .andWhere("m.enabled = :me", { me: true })
      .andWhere("c.enabled = :ce", { ce: true })
      .orderBy("m.updatedAt", "DESC")
      .getMany();
    if (!models.length) {
      throw new NotFoundException("没有可用的音频模型，请先在管理端启用 TTS 模型");
    }
    const cid = channelId?.trim();
    let matched = cid
      ? models.filter((m) => m.channelId === cid)
      : models;
    if (cid && !matched.length) {
      throw new NotFoundException("绑定渠道下没有可用的音频模型");
    }
    if (!cid) {
      const want = adapterForProvider(provider);
      if (want) {
        matched = models.filter((m) => {
          const caps = m.capabilities as { adapterId?: string } | null;
          const adapter =
            caps?.adapterId ||
            (m.channel.platform === "dashscope"
              ? AdapterId.DASHSCOPE_AUDIO
              : m.channel.platform === "volcengine"
                ? AdapterId.VOLCENGINE_AUDIO
                : AdapterId.OPENAI_AUDIO);
          return adapter === want;
        });
        if (!matched.length) {
          throw new NotFoundException(
            `没有匹配 ${provider} 的音频模型（需要 adapter ${want}）`,
          );
        }
      }
    }
    const preferredRemote = [
      "gpt-4o-mini-tts",
      "tts-1",
      "cosyvoice-v3-flash",
      "cosyvoice-v3.5-flash",
      "qwen-audio-3.1-tts-flash",
      "qwen-audio-3.0-tts-flash",
      "seed-tts-2.0",
    ];
    for (const remoteId of preferredRemote) {
      const hit = matched.find((m) => m.remoteId === remoteId);
      if (hit) return hit;
    }
    const def = matched.find((m) => m.isDefault);
    return def ?? matched[0]!;
  }

  /**
   * 同步调用 TTS 适配器生成试听，写入 previewAudioUrl。
   * 不走 BullMQ，方便管理端一键预览。
   */
  async generatePreview(
    id: string,
    opts?: { modelId?: string; text?: string },
  ) {
    const row = await this.get(id);
    if (!this.storage.isConfigured()) {
      throw new BadRequestException("对象存储未配置，无法保存试听音频");
    }

    const text =
      opts?.text?.trim() ||
      row.sampleText?.trim() ||
      "清晨的阳光穿过窗帘，落在书桌上。我泡了一杯茶，慢慢翻开新的一页。";

    try {
      const model = await this.resolvePreviewModel(
        row.provider,
        opts?.modelId,
        row.channelId,
      );
      const caps = (model.capabilities ?? null) as {
        adapterId?: string;
      } | null;
      const provider = resolveAudioProvider({
        platform: model.channel.platform,
        capabilities: caps,
      });

      const result = await provider.generate({
        prompt: text,
        voice: row.voiceId,
        format: "mp3",
        speed: 1,
        model: model.remoteId,
        apiKey: model.channel.apiKey,
        baseUrl: model.channel.baseUrl,
        metadata: model.channel.metadata ?? null,
      });

      const format = result.audio.format || "mp3";
      const put = await this.storage.putObject(
        Buffer.from(result.audio.bytes),
        {
          contentType: result.audio.mimeType,
          ext: format,
        },
      );

      row.previewAudioUrl = put.url;
      await this.voices.save(row);
      return {
        id: row.id,
        previewAudioUrl: row.previewAudioUrl,
        modelId: model.id,
        modelName: model.name,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message || "试听生成失败");
    }
  }
}
