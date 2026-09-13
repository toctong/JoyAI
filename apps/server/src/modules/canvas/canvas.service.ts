import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CanvasSnapshotSchema, normalizeCanvasSnapshot } from "@joyai/shared";
import { PrismaService } from "../../common/prisma/prisma.service";

function extractCoverUrl(snapshot: unknown): string | null {
  const normalized = normalizeCanvasSnapshot(snapshot);
  if (!normalized) return null;
  for (const node of normalized.nodes) {
    const url = node.data?.url;
    if (
      (node.type === "image" || node.type === "video") &&
      typeof url === "string" &&
      url.length > 0
    ) {
      return url;
    }
  }
  return null;
}

@Injectable()
export class CanvasService {
  constructor(private readonly prisma: PrismaService) {}

  async library(userId: string, folderId?: string | null) {
    const parentId = folderId ?? null;

    if (parentId) {
      const folder = await this.prisma.canvasFolder.findFirst({
        where: { id: parentId, userId },
        select: { id: true, title: true, parentId: true },
      });
      if (!folder) throw new NotFoundException("文件夹不存在");
    }

    const [folders, projects] = await Promise.all([
      this.prisma.canvasFolder.findMany({
        where: { userId, parentId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          projects: {
            take: 3,
            orderBy: { updatedAt: "desc" },
            select: { coverUrl: true },
          },
        },
      }),
      this.prisma.canvasProject.findMany({
        where: { userId, folderId: parentId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          coverUrl: true,
          folderId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      folderId: parentId,
      folders: folders.map((f) => ({
        id: f.id,
        title: f.title,
        parentId: f.parentId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        coverUrls: f.projects
          .map((p) => p.coverUrl)
          .filter((u): u is string => Boolean(u)),
      })),
      projects,
    };
  }

  listFolders(userId: string) {
    return this.prisma.canvasFolder.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        parentId: true,
        updatedAt: true,
      },
    });
  }

  async createFolder(
    userId: string,
    title?: string,
    parentId?: string | null,
  ) {
    if (parentId) await this.requireFolder(userId, parentId);
    return this.prisma.canvasFolder.create({
      data: {
        userId,
        title: title?.trim() || "新建文件夹",
        parentId: parentId ?? null,
      },
      select: {
        id: true,
        title: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
    return this.prisma.canvasFolder.update({
      where: { id: folder.id },
      data: {
        ...(data.title !== undefined
          ? { title: data.title.trim() || "新建文件夹" }
          : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      },
      select: {
        id: true,
        title: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteFolder(userId: string, id: string) {
    const folder = await this.requireFolder(userId, id);
    await this.prisma.$transaction([
      this.prisma.canvasProject.updateMany({
        where: { userId, folderId: id },
        data: { folderId: folder.parentId },
      }),
      this.prisma.canvasFolder.updateMany({
        where: { userId, parentId: id },
        data: { parentId: folder.parentId },
      }),
      this.prisma.canvasFolder.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  list(userId: string, folderId?: string | null) {
    return this.prisma.canvasProject.findMany({
      where: {
        userId,
        ...(folderId !== undefined ? { folderId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        coverUrl: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(userId: string, title?: string, folderId?: string | null) {
    if (folderId) await this.requireFolder(userId, folderId);
    const snapshot = {
      version: 1 as const,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
    };
    return this.prisma.canvasProject.create({
      data: {
        userId,
        title: title?.trim() || "未命名项目",
        folderId: folderId ?? null,
        snapshot,
      },
      select: {
        id: true,
        title: true,
        coverUrl: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(userId: string, id: string) {
    const project = await this.prisma.canvasProject.findFirst({
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
    await this.get(userId, id);
    if (data.folderId) {
      await this.requireFolder(userId, data.folderId);
    }
    const patch: Prisma.CanvasProjectUpdateInput = {};
    if (data.title !== undefined) {
      patch.title = data.title.trim() || "未命名项目";
    }
    if (data.folderId !== undefined) {
      patch.folder =
        data.folderId === null
          ? { disconnect: true }
          : { connect: { id: data.folderId } };
    }
    if (data.snapshot !== undefined) {
      const normalized = normalizeCanvasSnapshot(data.snapshot);
      if (!normalized) {
        throw new BadRequestException("画板快照格式无效");
      }
      // Also reject if raw fails schema (strict).
      const parsed = CanvasSnapshotSchema.safeParse(data.snapshot);
      if (!parsed.success) {
        throw new BadRequestException("画板快照格式无效");
      }
      patch.snapshot = normalized as unknown as Prisma.InputJsonValue;
      const cover = extractCoverUrl(normalized);
      if (cover) patch.coverUrl = cover;
    }
    return this.prisma.canvasProject.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        title: true,
        coverUrl: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async delete(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.canvasProject.delete({ where: { id } });
    return { ok: true };
  }

  async moveProjects(
    userId: string,
    ids: string[],
    folderId: string | null,
  ) {
    if (!ids.length) throw new BadRequestException("未选择项目");
    if (folderId) await this.requireFolder(userId, folderId);
    const result = await this.prisma.canvasProject.updateMany({
      where: { userId, id: { in: ids } },
      data: { folderId },
    });
    return { ok: true, count: result.count };
  }

  async deleteProjects(userId: string, ids: string[]) {
    if (!ids.length) throw new BadRequestException("未选择项目");
    const result = await this.prisma.canvasProject.deleteMany({
      where: { userId, id: { in: ids } },
    });
    return { ok: true, count: result.count };
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
    await this.prisma.canvasProject.update({
      where: { id: projectId },
      data: {
        snapshot: next as unknown as Prisma.InputJsonValue,
        coverUrl: extractCoverUrl(next) ?? project.coverUrl,
      },
    });
  }

  private async requireFolder(userId: string, id: string) {
    const folder = await this.prisma.canvasFolder.findFirst({
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
      const next: { parentId: string | null } | null =
        await this.prisma.canvasFolder.findFirst({
          where: { id: cursor, userId },
          select: { parentId: true },
        });
      cursor = next?.parentId ?? null;
    }
  }
}
