import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Repository } from "typeorm";
import { CanvasSnapshotSchema, normalizeCanvasSnapshot } from "@joyai/shared";
import type { CanvasNode, CanvasSnapshot } from "@joyai/shared";
import { CanvasFolder } from "../../database/entities/canvas-folder.entity";
import { CanvasProject } from "../../database/entities/canvas-project.entity";

function extractCoverUrl(snapshot: unknown): string | null {
  const normalized = normalizeCanvasSnapshot(snapshot);
  if (!normalized) return null;
  let videoUrl: string | null = null;
  for (const node of normalized.nodes) {
    const url = node.data?.url;
    if (typeof url !== "string" || !url || url.startsWith("data:")) continue;
    if (node.type === "image" || node.type === "panorama") return url;
    if (node.type === "video" && !videoUrl) videoUrl = url;
  }
  return videoUrl;
}

/** Keep server-side succeeded media when a stale client save still says "running". */
function mergeSnapshotPreservingJobResults(
  incoming: CanvasSnapshot,
  existingRaw: unknown,
): CanvasSnapshot {
  const existing = normalizeCanvasSnapshot(existingRaw);
  if (!existing) return incoming;

  const byId = new Map(existing.nodes.map((node) => [node.id, node]));
  const nodes: CanvasNode[] = incoming.nodes.map((node) => {
    const prev = byId.get(node.id);
    if (!prev) return node;

    const prevStatus = String(prev.data.status ?? "");
    const nextStatus = String(node.data.status ?? "");
    const prevUrl = String(prev.data.url ?? "");
    const nextUrl = String(node.data.url ?? "");
    const prevJob = String(prev.data.jobId ?? "");
    const nextJob = String(node.data.jobId ?? "");
    const prevDone =
      prevStatus === "succeeded" &&
      Boolean(prevUrl) &&
      !prevUrl.startsWith("data:");
    const nextBusy = nextStatus === "queued" || nextStatus === "running";
    const sameJob = Boolean(prevJob) && prevJob === nextJob;
    const nextEmpty = !nextUrl || nextUrl.startsWith("data:");

    if (prevDone && nextBusy && sameJob && nextEmpty) {
      return {
        ...node,
        data: {
          ...node.data,
          url: prev.data.url,
          assetId: prev.data.assetId,
          status: "succeeded",
          error: "",
          jobId: prev.data.jobId ?? node.data.jobId,
        },
      };
    }
    return node;
  });

  return { ...incoming, nodes };
}

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(CanvasFolder)
    private readonly folders: Repository<CanvasFolder>,
    @InjectRepository(CanvasProject)
    private readonly projects: Repository<CanvasProject>,
    private readonly dataSource: DataSource,
  ) {}

  async library(userId: string, folderId?: string | null) {
    const parentId = folderId ?? null;

    if (parentId) {
      const folder = await this.folders.findOne({
        where: { id: parentId, userId },
        select: ["id", "title", "parentId"],
      });
      if (!folder) throw new NotFoundException("文件夹不存在");
    }

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
        title: title?.trim() || "新建文件夹",
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
        throw new BadRequestException("不能将文件夹移动到自身");
      }
      await this.requireFolder(userId, data.parentId);
      await this.assertNotDescendant(userId, id, data.parentId);
    }
    if (data.title !== undefined) {
      folder.title = data.title.trim() || "新建文件夹";
    }
    if (data.parentId !== undefined) {
      folder.parentId = data.parentId;
    }
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
        CanvasProject,
        { userId, folderId: id },
        { folderId: folder.parentId },
      );
      await manager.update(
        CanvasFolder,
        { userId, parentId: id },
        { parentId: folder.parentId },
      );
      await manager.delete(CanvasFolder, { id });
    });
    return { ok: true };
  }

  list(userId: string, folderId?: string | null) {
    return this.projects.find({
      where: {
        userId,
        ...(folderId !== undefined
          ? { folderId: folderId === null ? IsNull() : folderId }
          : {}),
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
    });
  }

  async create(
    userId: string,
    title?: string,
    folderId?: string | null,
    snapshotRaw?: unknown,
  ) {
    if (folderId) await this.requireFolder(userId, folderId);
    let snapshot: Record<string, unknown> = {
      version: 1 as const,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
    };
    if (snapshotRaw !== undefined) {
      const normalized = normalizeCanvasSnapshot(snapshotRaw);
      if (!normalized) {
        throw new BadRequestException("画板快照格式无效");
      }
      snapshot = normalized as unknown as Record<string, unknown>;
    }
    const project = await this.projects.save(
      this.projects.create({
        userId,
        title: title?.trim() || "未命名项目",
        folderId: folderId ?? null,
        snapshot,
        coverUrl: extractCoverUrl(snapshot),
      }),
    );
    return {
      id: project.id,
      title: project.title,
      coverUrl: project.coverUrl,
      folderId: project.folderId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  async get(userId: string, id: string) {
    const project = await this.projects.findOne({
      where: { id, userId },
    });
    if (!project) throw new NotFoundException("画板项目不存在");
    return project;
  }

  async update(
    userId: string,
    id: string,
    data: {
      title?: string;
      snapshot?: unknown;
      folderId?: string | null;
    },
  ) {
    const project = await this.get(userId, id);
    if (data.folderId) {
      await this.requireFolder(userId, data.folderId);
    }
    if (data.title !== undefined) {
      project.title = data.title.trim() || "未命名项目";
    }
    if (data.folderId !== undefined) {
      project.folderId = data.folderId;
    }
    if (data.snapshot !== undefined) {
      const normalized = normalizeCanvasSnapshot(data.snapshot);
      if (!normalized) {
        throw new BadRequestException("画板快照格式无效");
      }
      const parsed = CanvasSnapshotSchema.safeParse(data.snapshot);
      if (!parsed.success) {
        throw new BadRequestException("画板快照格式无效");
      }
      const merged = mergeSnapshotPreservingJobResults(
        normalized,
        project.snapshot,
      );
      project.snapshot = merged as unknown as Record<string, unknown>;
      const cover = extractCoverUrl(merged);
      if (cover) project.coverUrl = cover;
    }
    const saved = await this.projects.save(project);
    return {
      id: saved.id,
      title: saved.title,
      coverUrl: saved.coverUrl,
      folderId: saved.folderId,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async delete(userId: string, id: string) {
    await this.get(userId, id);
    await this.projects.delete(id);
    return { ok: true };
  }

  async moveProjects(
    userId: string,
    ids: string[],
    folderId: string | null,
  ) {
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
    const result = await this.projects.delete({
      userId,
      id: In(ids),
    });
    return { ok: true, count: result.affected ?? 0 };
  }

  async patchNodeAsset(
    userId: string,
    projectId: string,
    nodeId: string,
    asset: { assetId: string; url: string; jobId: string },
  ) {
    const project = await this.get(userId, projectId);
    const snapshot = normalizeCanvasSnapshot(project.snapshot);
    if (!snapshot) return;

    const nodes = snapshot.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        data: {
          ...node.data,
          assetId: asset.assetId,
          url: asset.url,
          jobId: asset.jobId,
          status: "succeeded",
        },
      };
    });

    const next = { ...snapshot, version: 2 as const, nodes };
    project.snapshot = next as unknown as Record<string, unknown>;
    project.coverUrl = extractCoverUrl(next) ?? project.coverUrl;
    await this.projects.save(project);
  }

  private async requireFolder(userId: string, id: string) {
    const folder = await this.folders.findOne({
      where: { id, userId },
    });
    if (!folder) throw new NotFoundException("文件夹不存在");
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
        throw new BadRequestException("不能将文件夹移动到其子文件夹中");
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
}
