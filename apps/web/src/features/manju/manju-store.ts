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
import { collectAssetIdsToRemove } from "./lib/asset-registry";
import { renameAssetInProject } from "./lib/rename-asset";
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
        | "series"
        | "completedSteps"
        | "lastAnalyzeJobId"
      >
    >,
  ) => void;
  patchSettings: (id: string, patch: Partial<ManjuVideoSettings>) => void;
  markStepComplete: (id: string, step: ManjuStepId) => void;
  getProject: (id: string) => ManjuProjectDraft | undefined;

  addAsset: (
    projectId: string,
    kind: ManjuAssetDraft["kind"],
    parentId?: string | null,
  ) => string;
  updateAsset: (
    projectId: string,
    assetId: string,
    patch: Partial<ManjuAssetDraft>,
  ) => void;
  /** 改名并级联重写 @[登记名] */
  renameAsset: (projectId: string, assetId: string, name: string) => void;
  removeAsset: (projectId: string, assetId: string) => void;

  addShot: (
    projectId: string,
    afterIndex?: number,
    opts?: { episodeId?: string | null },
  ) => string;
  updateShot: (
    projectId: string,
    shotId: string,
    patch: Partial<ManjuShotDraft>,
  ) => void;
  removeShot: (projectId: string, shotId: string) => void;
  moveShot: (projectId: string, shotId: string, dir: -1 | 1) => void;
  setShots: (
    projectId: string,
    shots: ManjuShotDraft[],
    opts?: { preserveConfirm?: boolean },
  ) => void;
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
/** Bumped when a server reload wins; in-flight PATCH must not overwrite it. */
const saveEpoch = new Map<string, number>();

function cancelScheduledSave(id: string) {
  const prev = saveTimers.get(id);
  if (prev) clearTimeout(prev);
  saveTimers.delete(id);
}

function bumpSaveEpoch(id: string) {
  const next = (saveEpoch.get(id) ?? 0) + 1;
  saveEpoch.set(id, next);
  cancelScheduledSave(id);
  return next;
}

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
      bumpSaveEpoch(id);
      const epoch = saveEpoch.get(id) ?? 0;
      const dto = await getManjuProject(id);
      if ((saveEpoch.get(id) ?? 0) !== epoch) return get().getProject(id) ?? null;
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
      const epoch = saveEpoch.get(id) ?? 0;
      const project = get().getProject(id);
      if (!project) return;
      if ((saveEpoch.get(id) ?? 0) !== epoch) return;
      set((s) => ({ savingIds: { ...s.savingIds, [id]: true } }));
      try {
        const dto = await updateManjuProject(id, {
          title: project.title,
          draft: draftFromProject(project),
        });
        if ((saveEpoch.get(id) ?? 0) !== epoch) return;
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
      if (get().analyzingIds[id]) return;
      cancelScheduledSave(id);
      saveTimers.set(
        id,
        setTimeout(() => {
          saveTimers.delete(id);
          if (get().analyzingIds[id]) return;
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

    addAsset: (projectId, kind, parentId = null) => {
      const parent = parentId
        ? get().getProject(projectId)?.assets.find((a) => a.id === parentId)
        : null;
      const asset = createEmptyAsset(
        parent?.kind ?? kind,
        "",
        parent?.id ?? null,
      );
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
    renameAsset: (projectId, assetId, name) => {
      mutate(projectId, (p) => {
        const next = renameAssetInProject(p.assets, p.shots, assetId, name);
        return { ...p, assets: next.assets, shots: next.shots };
      });
    },
    removeAsset: (projectId, assetId) => {
      mutate(projectId, (p) => {
        const drop = collectAssetIdsToRemove(p.assets, assetId);
        return {
          ...p,
          assets: p.assets.filter((a) => !drop.has(a.id)),
          shots: p.shots.map((shot) => ({
            ...shot,
            assetRefs: shot.assetRefs.filter((x) => !drop.has(x)),
          })),
        };
      });
    },

    addShot: (projectId, afterIndex, opts) => {
      let newShotId = "";
      mutate(projectId, (p) => {
        const shots = [...p.shots];
        const insertAt =
          afterIndex == null
            ? shots.length
            : Math.min(shots.length, Math.max(0, afterIndex));
        const shot = {
          ...createEmptyShot(insertAt + 1),
          episodeId: opts?.episodeId ?? null,
        };
        newShotId = shot.id;
        shots.splice(insertAt, 0, shot);
        return { ...p, shots: reindex(shots), scriptConfirmed: false };
      });
      return newShotId;
    },
    updateShot: (projectId, shotId, patch) => {
      const contentEdited =
        patch.visual !== undefined || patch.dialogue !== undefined;
      mutate(projectId, (p) => ({
        ...p,
        scriptConfirmed: contentEdited ? false : p.scriptConfirmed,
        shots: p.shots.map((shot) => {
          if (shot.id !== shotId) return shot;
          const next = { ...shot, ...patch };
          if (!contentEdited) return next;
          if (shot.storyboardImageUrl || shot.storyboardAssetId) {
            next.storyboardStale = true;
          }
          if (shot.videoUrl || shot.videoAssetId) {
            next.videoStale = true;
          }
          return next;
        }),
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
    setShots: (projectId, shots, opts) => {
      mutate(projectId, (p) => ({
        ...p,
        shots: reindex(shots),
        scriptConfirmed: opts?.preserveConfirm ? p.scriptConfirmed : false,
      }));
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
      get().markStepComplete(projectId, "storyboard-video");
    },
    applyJobResult: ({ jobId, status, url, assetId }) => {
      const touchedIds: string[] = [];
      set((s) => ({
        projects: s.projects.map((p) => {
          let changed = false;
          let assetHit = false;
          let storyboardHit = false;
          let videoHit = false;
          const assets = p.assets.map((a) => {
            if (a.jobId !== jobId) return a;
            changed = true;
            assetHit = true;
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
              storyboardHit = true;
              return {
                ...shot,
                storyboardStatus: status,
                storyboardImageUrl: url ?? shot.storyboardImageUrl,
                storyboardAssetId: assetId ?? shot.storyboardAssetId,
                storyboardStale:
                  status === "succeeded" && url ? false : shot.storyboardStale,
              };
            }
            if (shot.videoJobId === jobId) {
              changed = true;
              videoHit = true;
              return {
                ...shot,
                videoStatus: status,
                videoUrl: url ?? shot.videoUrl,
                videoAssetId: assetId ?? shot.videoAssetId,
                videoStale: status === "succeeded" && url ? false : shot.videoStale,
              };
            }
            return shot;
          });
          if (!changed) return p;
          touchedIds.push(p.id);
          const completed = new Set(p.completedSteps);
          if (status === "succeeded") {
            if (assetHit) completed.add("assets");
            if (storyboardHit) completed.add("storyboard-script");
            if (videoHit) {
              completed.add("storyboard-video");
              completed.add("preview");
            }
          }
          return {
            ...p,
            assets,
            shots,
            completedSteps: [...completed],
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
      // Persist media urls after generation settles
      if (status === "succeeded" || status === "failed") {
        for (const id of touchedIds) {
          get().scheduleSave(id);
        }
      }
    },

    setAnalyzing: (id, busy) => {
      if (busy) cancelScheduledSave(id);
      set((s) => ({
        analyzingIds: { ...s.analyzingIds, [id]: busy },
      }));
    },
  };
});
