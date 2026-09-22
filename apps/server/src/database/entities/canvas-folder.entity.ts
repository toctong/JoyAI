import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";
import { User } from "./user.entity";
import type { CanvasProject } from "./canvas-project.entity";

@Entity("canvas_folder")
@Index("IDX_folder_user_parent_updated", ["userId", "parentId", "updatedAt"])
export class CanvasFolder {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, (u) => u.canvasFolders, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => CanvasFolder, (f) => f.children, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "parentId" })
  parent!: CanvasFolder | null;

  @OneToMany(() => CanvasFolder, (f) => f.parent)
  children!: CanvasFolder[];

  @Column({ default: "新建文件夹" })
  title!: string;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @OneToMany("CanvasProject", (p: CanvasProject) => p.folder)
  projects!: CanvasProject[];

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
