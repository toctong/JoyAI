import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import JSZip from "jszip";
import { normalizeManjuDraft } from "@joyai/shared";
import { ManjuProject } from "../../database/entities/manju-project.entity";

@Injectable()
export class ManjuJianyingService {
  constructor(
    @InjectRepository(ManjuProject)
    private readonly projects: Repository<ManjuProject>,
  ) {}

  async buildZip(
    userId: string,
    projectId: string,
    episodeId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.projects.findOne({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException("漫剧项目不存在");

    const draft = normalizeManjuDraft(project.draft);
    const shots = draft.shots
      .filter((s) => Boolean(s.videoUrl))
      .filter((s) => !episodeId || s.episodeId === episodeId)
      .sort((a, b) => a.index - b.index);

    if (shots.length === 0) {
      throw new BadRequestException("没有可导出的镜头视频");
    }

    const zip = new JSZip();
    const media = zip.folder("media");
    if (!media) throw new BadRequestException("无法创建导出包");

    const defaultDuration = draft.settings.duration || 5;
    const clips: Array<{
      index: number;
      path: string;
      duration: number;
      dialogue: string;
      visual: string;
    }> = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]!;
      const url = shot.videoUrl!.trim();
      const pad = String(i + 1).padStart(3, "0");
      const path = `media/shot_${pad}.mp4`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        media.file(`shot_${pad}.mp4`, buf);
        clips.push({
          index: shot.index,
          path,
          duration: shot.duration ?? defaultDuration,
          dialogue: shot.dialogue || "",
          visual: shot.visual || "",
        });
      } catch {
        // skip failed downloads; continue packing others
      }
    }

    if (clips.length === 0) {
      throw new BadRequestException("镜头视频全部下载失败，无法导出");
    }

    const draftContent = {
      version: 1 as const,
      name: project.title,
      aspect: draft.settings.ratio || "9:16",
      clips,
    };
    zip.file("draft_content.json", JSON.stringify(draftContent, null, 2));
    zip.file(
      "README.txt",
      [
        "此包为 FrameRally 剪映兼容导出；将 media 导入剪映时间线，或按 draft_content.json 顺序排列。",
        "",
        "说明：",
        "- media/ 目录下为各镜头视频文件（shot_001.mp4 …）",
        "- draft_content.json 为简易时间线元数据（非 pyjianyingdraft 原样草稿）",
        "- 请在剪映中手动导入并按 clips 顺序排列",
        "",
      ].join("\n"),
    );

    const buffer = Buffer.from(
      await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    );
    const safeTitle = project.title.replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40) || "manju";
    const filename = `${safeTitle}_jianying.zip`;
    return { buffer, filename };
  }
}
