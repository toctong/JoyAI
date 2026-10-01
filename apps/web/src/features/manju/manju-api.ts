import { api } from "@/shared/lib/api";
import type { ManjuDraft } from "@joyai/shared";
import type { ManjuProjectDraft } from "./manju-types";
import {
  DEFAULT_SETTINGS,
  createEmptyProject,
  resolveManjuGenMode,
} from "./manju-types";

export type ManjuProjectListItem = {
  id: string;
  title: string;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManjuProjectDto = {
  id: string;
  title: string;
  coverUrl: string | null;
  draft: ManjuDraft;
  createdAt: string;
  updatedAt: string;
};

export function draftFromProject(p: ManjuProjectDraft): ManjuDraft {
  return {
    version: 1,
    scriptText: p.scriptText,
    overview: p.overview ?? "",
    tags: p.tags ?? [],
    scriptConfirmed: p.scriptConfirmed ?? false,
    phase: p.phase ?? "preparation",
    scriptReview: p.scriptReview ?? { status: "draft", content: "" },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(p.settings ?? {}),
      gridLayout: p.settings?.gridLayout ?? "2x2",
    },
    assets: p.assets,
    shots: p.shots.map((s) => ({
      ...s,
      utterances: s.utterances ?? [],
      endFrameAssetId: s.endFrameAssetId ?? null,
      endFrameImageUrl: s.endFrameImageUrl ?? null,
    })),
    episodes: p.episodes ?? [],
    series: p.series ?? { world: "", bios: [], hooks: [] },
    completedSteps: p.completedSteps,
    lastAnalyzeJobId: p.lastAnalyzeJobId ?? null,
    lastReview: p.lastReview ?? null,
    draftSnapshots: (p.draftSnapshots ?? []).slice(0, 12),
  };
}

export function projectFromDto(dto: ManjuProjectDto): ManjuProjectDraft {
  const base = createEmptyProject(dto.title);
  return {
    ...base,
    id: dto.id,
    title: dto.title,
    scriptText: dto.draft.scriptText ?? "",
    overview: dto.draft.overview ?? "",
    tags: Array.isArray(dto.draft.tags)
      ? dto.draft.tags.filter((t): t is string => typeof t === "string")
      : [],
    scriptConfirmed: dto.draft.scriptConfirmed ?? false,
    phase: (dto.draft.phase as ManjuProjectDraft["phase"]) ?? "preparation",
    scriptReview: {
      status:
        dto.draft.scriptReview?.status === "confirmed" ? "confirmed" : "draft",
      content: dto.draft.scriptReview?.content ?? "",
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(dto.draft.settings ?? {}),
      mode: resolveManjuGenMode(
        (dto.draft.settings?.mode as ManjuProjectDraft["settings"]["mode"]) ??
          DEFAULT_SETTINGS.mode,
      ),
    },
    assets: (dto.draft.assets ?? []).map((a) => {
      const raw = a as ManjuDraft["assets"][number] & {
        parentId?: string | null;
      };
      return {
        id: raw.id,
        kind: raw.kind,
        name: raw.name,
        description: raw.description ?? "",
        aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
        parentId: typeof raw.parentId === "string" ? raw.parentId : null,
        imageUrl: raw.imageUrl ?? null,
        assetId: raw.assetId ?? null,
        jobId: raw.jobId ?? null,
        status: raw.status ?? "idle",
        voiceOnly: raw.voiceOnly === true,
        detail:
          raw.detail && typeof raw.detail === "object" ? raw.detail : undefined,
      };
    }),
    shots: (dto.draft.shots ?? []).map((s) => ({
      ...(s as ManjuProjectDraft["shots"][number]),
      utterances: Array.isArray(s.utterances) ? s.utterances : [],
      endFrameAssetId: s.endFrameAssetId ?? null,
      endFrameImageUrl: s.endFrameImageUrl ?? null,
    })),
    episodes: (dto.draft.episodes ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.summary ?? "",
      hook: e.hook ?? "",
      sourceText: e.sourceText ?? "",
    })),
    series: {
      world: dto.draft.series?.world ?? "",
      bios: (dto.draft.series?.bios ?? []).map((b) => ({
        name: b.name,
        bio: b.bio ?? "",
      })),
      hooks: (dto.draft.series?.hooks ?? []).map((h) => ({
        text: h.text,
        status: h.status === "paid" ? "paid" : "open",
      })),
    },
    completedSteps:
      (dto.draft.completedSteps as ManjuProjectDraft["completedSteps"]) ?? [],
    lastAnalyzeJobId: dto.draft.lastAnalyzeJobId ?? null,
    lastReview: dto.draft.lastReview
      ? {
          jobId: dto.draft.lastReview.jobId ?? null,
          summary: dto.draft.lastReview.summary ?? "",
          findings: (dto.draft.lastReview.findings ?? []).map((f) => ({
            severity:
              f.severity === "error" || f.severity === "info"
                ? f.severity
                : "warn",
            code: f.code,
            message: f.message,
            target: f.target ?? "",
          })),
          updatedAt: dto.draft.lastReview.updatedAt ?? "",
        }
      : null,
    draftSnapshots: Array.isArray(dto.draft.draftSnapshots)
      ? (dto.draft.draftSnapshots as ManjuProjectDraft["draftSnapshots"])
      : [],
    createdAt:
      typeof dto.createdAt === "string"
        ? dto.createdAt
        : new Date(dto.createdAt).toISOString(),
    updatedAt:
      typeof dto.updatedAt === "string"
        ? dto.updatedAt
        : new Date(dto.updatedAt).toISOString(),
  };
}

export async function listManjuProjects() {
  return api<ManjuProjectListItem[]>("/manju/projects");
}

export async function createManjuProject(
  title?: string,
  folderId?: string | null,
) {
  return api<ManjuProjectDto>("/manju/projects", {
    method: "POST",
    body: { title, folderId: folderId ?? null },
  });
}

export async function getManjuProject(id: string) {
  return api<ManjuProjectDto>(`/manju/projects/${id}`);
}

export async function updateManjuProject(
  id: string,
  patch: { title?: string; draft?: ManjuDraft },
) {
  return api<ManjuProjectDto>(`/manju/projects/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function deleteManjuProject(id: string) {
  return api<{ ok: boolean }>(`/manju/projects/${id}`, {
    method: "DELETE",
  });
}

export async function submitManjuAnalyzeJob(input: {
  projectId: string;
  scriptText: string;
  modelId?: string;
  episodeId?: string | null;
  purpose?:
    | "analyze_assets"
    | "split_shots"
    | "script_plan"
    | "author_prompts"
    | "series_memory"
    | "plan_episodes"
    | "novel_analyze"
    | "manju_review";
  /** analyze_assets 资产合并方式 */
  analyzeMode?: "incremental" | "full_add" | "clear_reparse";
}) {
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "llm",
      input: {
        purpose: input.purpose ?? "analyze_assets",
        prompt: input.scriptText,
        manjuProjectId: input.projectId,
        manjuEpisodeId: input.episodeId?.trim() || undefined,
        modelId: input.modelId?.trim() || undefined,
        analyzeMode:
          (input.purpose ?? "analyze_assets") === "analyze_assets"
            ? (input.analyzeMode ?? "incremental")
            : undefined,
      },
    },
  });
}

export async function submitManjuScriptWriteJob(input: {
  projectId: string;
  prompt: string;
  modelId?: string;
  /** Defaults to script_write; advisor skills use catalog purposes */
  purpose?: string;
}) {
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "llm",
      input: {
        purpose: input.purpose?.trim() || "script_write",
        prompt: input.prompt,
        manjuProjectId: input.projectId,
        modelId: input.modelId?.trim() || undefined,
      },
    },
  });
}
