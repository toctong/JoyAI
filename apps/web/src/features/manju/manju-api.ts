import { api } from "@/shared/lib/api";
import type { ManjuDraft } from "@joyai/shared";
import type { ManjuProjectDraft } from "./manju-types";
import {
  DEFAULT_SETTINGS,
  createEmptyProject,
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
    scriptConfirmed: p.scriptConfirmed ?? false,
    settings: p.settings ?? DEFAULT_SETTINGS,
    assets: p.assets,
    shots: p.shots,
    episodes: p.episodes ?? [],
    completedSteps: p.completedSteps,
    lastAnalyzeJobId: p.lastAnalyzeJobId ?? null,
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
    scriptConfirmed: dto.draft.scriptConfirmed ?? false,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(dto.draft.settings ?? {}),
    },
    assets: (dto.draft.assets ?? []) as ManjuProjectDraft["assets"],
    shots: (dto.draft.shots ?? []) as ManjuProjectDraft["shots"],
    episodes: (dto.draft.episodes ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.summary ?? "",
    })),
    completedSteps:
      (dto.draft.completedSteps as ManjuProjectDraft["completedSteps"]) ?? [],
    lastAnalyzeJobId: dto.draft.lastAnalyzeJobId ?? null,
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

export async function createManjuProject(title?: string) {
  return api<ManjuProjectDto>("/manju/projects", {
    method: "POST",
    body: { title },
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
  purpose?: "analyze_assets" | "split_shots" | "script_plan" | "author_prompts";
}) {
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "llm",
      input: {
        purpose: input.purpose ?? "analyze_assets",
        prompt: input.scriptText,
        manjuProjectId: input.projectId,
        modelId: input.modelId,
      },
    },
  });
}
