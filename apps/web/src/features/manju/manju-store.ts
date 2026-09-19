"use client";

import { create } from "zustand";
import type { ManjuStepId } from "./config/manju-steps";
import {
  createEmptyAsset,
  createEmptyShot,
  autoLinkAssetsToShots,
  type ManjuAssetDraft,
  type ManjuJobStatus,
  type ManjuProjectDraft,
  type ManjuShotDraft,
  type ManjuVideoSettings,
} from "./manju-types";
import {
  createManjuProject,
  deleteManjuProject,
  draftFromProject,
  getManjuProject,
  listManjuProjects,
  projectFromDto,
  updateManjuProject,
} from "./manju-api";

type ManjuState = {
  projects: ManjuProjectDraft[];
  listMeta: Array<{
    id: string;
    title: string;
    coverUrl: string | null;
    updatedAt: string;
  }>;
  savingIds: Record<string, boolean>;
  analyzingIds: Record<string, boolean>;

  setProjects: (projects: ManjuProjectDraft[]) => void;
  upsertProject: (project: ManjuProjectDraft) => void;
  loadList: () => Promise<void>;
  loadProject: (id: string) => Promise<ManjuProjectDraft | null>;
  createProject: (title?: string) => Promise<ManjuProjectDraft>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<ManjuProjectDraft | null>;
  flushSave: (id: string) => Promise<void>;
  scheduleSave: (id: string) => void;

  updateProject: (
    id: string,
    patch: Partial<
      Pick<
        ManjuProjectDraft,
        | "title"
        | "scriptText"
        | "overview"
        | "scriptConfirmed"
        | "settings"
        | "assets"
        | "shots"
        | "episodes"
        | "completedSteps"
        | "lastAnalyzeJobId"
      >
    >,
  ) => void;
  patchSettings: (id: string, patch: Partial<ManjuVideoSettings>) => void;
  markStepComplete: (id: string, step: ManjuStepId) => void;
  getProject: (id: string) => ManjuProjectDraft | undefined;

  addAsset: (projectId: string, kind: ManjuAssetDraft["kind"]) => string;
  updateAsset: (
    projectId: string,
    assetId: string,
    patch: Partial<ManjuAssetDraft>,
  ) => void;
  removeAsset: (projectId: string, assetId: string) => void;

  addShot: (projectId: string, afterIndex?: number) => string;
  updateShot: (
    projectId: string,
    shotId: string,
    patch: Partial<ManjuShotDraft>,
  ) => void;
  removeShot: (projectId: string, shotId: string) => void;
  moveShot: (projectId: string, shotId: string, dir: -1 | 1) => void;
  setShots: (projectId: string, shots: ManjuShotDraft[]) => void;
  mergeExtractedAssets: (
    projectId: string,
    extracted: ManjuAssetDraft[],
  ) => number;
  autoLinkShotAssets: (projectId: string) => void;

  bindJobToAsset: (
    projectId: string,
    assetId: string,
    jobId: string,
    status?: ManjuJobStatus,
  ) => void;
  bindJobToShotStoryboard: (
    projectId: string,
    shotId: string,
    jobId: string,
    status?: ManjuJobStatus,
  ) => void;
  bindJobToShotVideo: (
    projectId: string,
    shotId: string,
    jobId: string,
    status?: ManjuJobStatus,
  ) => void;
  applyJobResult: (payload: {
    jobId: string;
    status: ManjuJobStatus;
    url?: string | null;
    assetId?: string | null;
  }) => void;
  setAnalyzing: (id: string, busy: boolean) => void;
};

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function reindex(shots: ManjuShotDraft[]): ManjuShotDraft[] {
  return shots.map((s, i) => ({ ...s, index: i + 1 }));
}

function touch(
  projects: ManjuProjectDraft[],
  id: string,
  map: (p: ManjuProjectDraft) => ManjuProjectDraft,
): ManjuProjectDraft[] {
  const now = new Date().toISOString();
  return projects.map((p) => (p.id === id ? { ...map(p), updatedAt: now } : p));
}

export const useManjuStore = create<ManjuState>((set, get) => {
  const mutate = (
    id: string,
    map: (p: ManjuProjectDraft) => ManjuProjectDraft,
  ) => {
    set((s) => ({ projects: touch(s.projects, id, map) }));
    get().scheduleSave(id);
  };

  return {
    projects: [],
    listMeta: [],
    savingIds: {},
    analyzingIds: {},

    setProjects: (projects) => set({ projects }),
    upsertProject: (project) =>
      set((s) => {
        const idx = s.projects.findIndex((p) => p.id === project.id);
        if (idx < 0) return { projects: [project, ...s.projects] };
        const next = [...s.projects];
        next[idx] = project;
        return { projects: next };
      }),

    loadList: async () => {
      const rows = await listManjuProjects();
      set({
        listMeta: rows.map((r) => ({
          id: r.id,
          title: r.title,
          coverUrl: r.coverUrl,
          updatedAt:
            typeof r.updatedAt === "string"
              ? r.updatedAt
              : new Date(r.updatedAt).toISOString(),
        })),
      });
    },

    loadProject: async (id) => {
      const dto = await getManjuProject(id);
      const project = projectFromDto(dto);
      get().upsertProject(project);
      return project;
    },

    createProject: async (title) => {
      const dto = await createManjuProject(title);
      const project = projectFromDto(dto);
      get().upsertProject(project);
      await get().loadList();
      return project;
    },

    deleteProject: async (id) => {
      await deleteManjuProject(id);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        listMeta: s.listMeta.filter((p) => p.id !== id),
      }));
    },

    duplicateProject: async (id) => {
      const src =
        get().getProject(id) ??
        (await get().loadProject(id).catch(() => null));
      if (!src) return null;
      const created = await createManjuProject(`${src.title} 副本`);
      const draft = draftFromProject({
        ...src,
        id: created.id,
        title: created.title,
      });
      const dto = await updateManjuProject(created.id, {
        title: created.title,
        draft,
      });
      const project = projectFromDto(dto);
      get().upsertProject(project);
      await get().loadList();
      return project;
    },

    flushSave: async (id) => {
      const project = get().getProject(id);
      if (!project) return;
      set((s) => ({ savingIds: { ...s.savingIds, [id]: true } }));
      try {
        const dto = await updateManjuProject(id, {
          title: project.title,
          draft: draftFromProject(project),
        });
        // Keep local richer job status; only sync timestamps/title if server ahead
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  title: dto.title,
                  updatedAt:
                    typeof dto.updatedAt === "string"
                      ? dto.updatedAt
                      : new Date(dto.updatedAt).toISOString(),
                }
              : p,
          ),
        }));
      } finally {
        set((s) => ({ savingIds: { ...s.savingIds, [id]: false } }));
      }
    },

    scheduleSave: (id) => {
      const prev = saveTimers.get(id);
      if (prev) clearTimeout(prev);
      saveTimers.set(
        id,
        setTimeout(() => {
          saveTimers.delete(id);
          void get().flushSave(id);
        }, 800),
      );
    },

    updateProject: (id, patch) => {
      mutate(id, (p) => ({ ...p, ...patch }));
    },
    patchSettings: (id, patch) => {
      mutate(id, (p) => ({
        ...p,
        settings: { ...p.settings, ...patch },
      }));
    },
    markStepComplete: (id, step) => {
      const project = get().getProject(id);
      if (!project || project.completedSteps.includes(step)) return;
      get().updateProject(id, {
        completedSteps: [...project.completedSteps, step],
      });
    },
    getProject: (id) => get().projects.find((p) => p.id === id),

    addAsset: (projectId, kind) => {
      const asset = createEmptyAsset(kind);
      mutate(projectId, (p) => ({
        ...p,
        assets: [...p.assets, asset],
      }));
      return asset.id;
    },
    updateAsset: (projectId, assetId, patch) => {
      mutate(projectId, (p) => ({
        ...p,
        assets: p.assets.map((a) =>
          a.id === assetId ? { ...a, ...patch } : a,
        ),
      }));
    },
    removeAsset: (projectId, assetId) => {
      mutate(projectId, (p) => ({
        ...p,
        assets: p.assets.filter((a) => a.id !== assetId),
        shots: p.shots.map((shot) => ({
          ...shot,
          assetRefs: shot.assetRefs.filter((x) => x !== assetId),
        })),
      }));
    },

    addShot: (projectId, afterIndex) => {
      let newShotId = "";
      mutate(projectId, (p) => {
        const shots = [...p.shots];
        const insertAt =
          afterIndex == null
            ? shots.length
            : Math.min(shots.length, Math.max(0, afterIndex));
        const shot = createEmptyShot(insertAt + 1);
        newShotId = shot.id;
        shots.splice(insertAt, 0, shot);
        return { ...p, shots: reindex(shots) };
      });
      return newShotId;
    },
    updateShot: (projectId, shotId, patch) => {
      mutate(projectId, (p) => ({
        ...p,
        shots: p.shots.map((shot) =>
          shot.id === shotId ? { ...shot, ...patch } : shot,
        ),
      }));
    },
    removeShot: (projectId, shotId) => {
      mutate(projectId, (p) => ({
        ...p,
        shots: reindex(p.shots.filter((shot) => shot.id !== shotId)),
      }));
    },
    moveShot: (projectId, shotId, dir) => {
      mutate(projectId, (p) => {
        const idx = p.shots.findIndex((shot) => shot.id === shotId);
        if (idx < 0) return p;
        const next = idx + dir;
        if (next < 0 || next >= p.shots.length) return p;
        const shots = [...p.shots];
        const [item] = shots.splice(idx, 1);
        shots.splice(next, 0, item!);
        return { ...p, shots: reindex(shots) };
      });
    },
    setShots: (projectId, shots) => {
      mutate(projectId, (p) => ({ ...p, shots: reindex(shots) }));
    },
    mergeExtractedAssets: (projectId, extracted) => {
      let added = 0;
      mutate(projectId, (p) => {
        const existing = new Set(p.assets.map((a) => `${a.kind}:${a.name}`));
        const next = [...p.assets];
        for (const a of extracted) {
          const key = `${a.kind}:${a.name}`;
          if (existing.has(key)) continue;
          existing.add(key);
          next.push(a);
          added += 1;
        }
        return { ...p, assets: next };
      });
      return added;
    },
    autoLinkShotAssets: (projectId) => {
      mutate(projectId, (p) => ({
        ...p,
        shots: autoLinkAssetsToShots(p.shots, p.assets),
      }));
    },

    bindJobToAsset: (projectId, assetId, jobId, status = "queued") => {
      get().updateAsset(projectId, assetId, { jobId, status });
    },
    bindJobToShotStoryboard: (
      projectId,
      shotId,
      jobId,
      status = "queued",
    ) => {
      get().updateShot(projectId, shotId, {
        storyboardJobId: jobId,
        storyboardStatus: status,
      });
    },
    bindJobToShotVideo: (projectId, shotId, jobId, status = "queued") => {
      get().updateShot(projectId, shotId, {
        videoJobId: jobId,
        videoStatus: status,
      });
    },
    applyJobResult: ({ jobId, status, url, assetId }) => {
      set((s) => ({
        projects: s.projects.map((p) => {
          let changed = false;
          const assets = p.assets.map((a) => {
            if (a.jobId !== jobId) return a;
            changed = true;
            return {
              ...a,
              status,
              imageUrl: url ?? a.imageUrl,
              assetId: assetId ?? a.assetId,
            };
          });
          const shots = p.shots.map((shot) => {
            if (shot.storyboardJobId === jobId) {
              changed = true;
              return {
                ...shot,
                storyboardStatus: status,
                storyboardImageUrl: url ?? shot.storyboardImageUrl,
                storyboardAssetId: assetId ?? shot.storyboardAssetId,
              };
            }
            if (shot.videoJobId === jobId) {
              changed = true;
              return {
                ...shot,
                videoStatus: status,
                videoUrl: url ?? shot.videoUrl,
                videoAssetId: assetId ?? shot.videoAssetId,
              };
            }
            return shot;
          });
          return changed
            ? { ...p, assets, shots, updatedAt: new Date().toISOString() }
            : p;
        }),
      }));
      // Persist media urls after generation settles
      if (status === "succeeded" || status === "failed") {
        for (const p of get().projects) {
          const hit =
            p.assets.some((a) => a.jobId === jobId) ||
            p.shots.some(
              (s) =>
                s.storyboardJobId === jobId || s.videoJobId === jobId,
            );
          if (hit) get().scheduleSave(p.id);
        }
      }
    },

    setAnalyzing: (id, busy) =>
      set((s) => ({
        analyzingIds: { ...s.analyzingIds, [id]: busy },
      })),
  };
});
