import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { newId } from "../id";
import { User } from "./user.entity";
import { CanvasFolder } from "./canvas-folder.entity";

@Entity("canvas_project")
@Index("IDX_project_user_folder_updated", ["userId", "folderId", "updatedAt"])
@Index("IDX_project_user_updated", ["userId", "updatedAt"])
export class CanvasProject {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, (u) => u.canvases, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar", nullable: true })
  folderId!: string | null;

  @ManyToOne(() => CanvasFolder, (f) => f.projects, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "folderId" })
  folder!: CanvasFolder | null;

  @Column({ default: "未命名项目" })
  title!: string;

  @Column({ type: "varchar", length: 2048, nullable: true })
  coverUrl!: string | null;

  @Column({ type: "json", nullable: true })
  snapshot!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
