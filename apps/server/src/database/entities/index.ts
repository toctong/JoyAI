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
};
