import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserRole } from "../enums";
import { newId } from "../id";
import type { Job } from "./job.entity";
import type { Asset } from "./asset.entity";
import type { CanvasProject } from "./canvas-project.entity";
import type { CanvasFolder } from "./canvas-folder.entity";

@Entity("user")
export class User {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ unique: true })
  username!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: "varchar", default: UserRole.creator })
  role!: UserRole;

  /** Base32 TOTP secret (Tencent / Google Authenticator). Null until setup. */
  @Column({ type: "varchar", nullable: true })
  totpSecret!: string | null;

  @Column({ type: "boolean", default: false })
  totpEnabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany("Job", (job: Job) => job.user)
  jobs!: Job[];

  @OneToMany("Asset", (asset: Asset) => asset.user)
  assets!: Asset[];

  @OneToMany("CanvasProject", (p: CanvasProject) => p.user)
  canvases!: CanvasProject[];

  @OneToMany("CanvasFolder", (f: CanvasFolder) => f.user)
  canvasFolders!: CanvasFolder[];

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
