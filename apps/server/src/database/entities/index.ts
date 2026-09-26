import { User } from "./user.entity";
import { Channel } from "./channel.entity";
import { Model } from "./model.entity";
import { Job } from "./job.entity";
import { Asset } from "./asset.entity";
import { CanvasFolder } from "./canvas-folder.entity";
import { CanvasProject } from "./canvas-project.entity";
import { ManjuProject } from "./manju-project.entity";
import { ManjuFolder } from "./manju-folder.entity";
import { AppSetting } from "./app-setting.entity";
import { AuditLog } from "./audit-log.entity";
import { ProjectChat } from "./project-chat.entity";
import { Skill } from "./skill.entity";
import { InspireBanner } from "./inspire-banner.entity";
import { PromptPreset } from "./prompt-preset.entity";
import { StyleTemplate } from "./style-template.entity";
import { CameraMove } from "./camera-move.entity";

export const ENTITIES = [
  User,
  Channel,
  Model,
  Job,
  Asset,
  CanvasFolder,
  CanvasProject,
  ManjuProject,
  ManjuFolder,
  AppSetting,
  AuditLog,
  ProjectChat,
  Skill,
  InspireBanner,
  PromptPreset,
  StyleTemplate,
  CameraMove,
] as const;

export {
  User,
  Channel,
  Model,
  Job,
  Asset,
  CanvasFolder,
  CanvasProject,
  ManjuProject,
  ManjuFolder,
  AppSetting,
  AuditLog,
  ProjectChat,
  Skill,
  InspireBanner,
  PromptPreset,
  StyleTemplate,
  CameraMove,
};
