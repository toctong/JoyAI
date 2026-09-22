import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  JoinColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";
import type { ManjuProject } from "./manju-project.entity";

/** 漫剧合集（文件夹） */
@Entity("manju_folder")
@Index("IDX_manju_folder_user_parent", ["userId", "parentId", "updatedAt"])
export class ManjuFolder {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: "varchar", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => ManjuFolder, (f) => f.children, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "parentId" })
  parent!: ManjuFolder | null;

  @OneToMany(() => ManjuFolder, (f) => f.parent)
  children!: ManjuFolder[];

  @Column({ default: "新建合集" })
  title!: string;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @OneToMany("ManjuProject", (p: ManjuProject) => p.folder)
  projects!: ManjuProject[];

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
