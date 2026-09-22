import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";
import { User } from "./user.entity";
import { ManjuFolder } from "./manju-folder.entity";

@Entity("manju_project")
@Index("IDX_manju_user_updated", ["userId", "updatedAt"])
@Index("IDX_manju_user_folder_updated", ["userId", "folderId", "updatedAt"])
@Index("IDX_manju_project_userId", ["userId"])
@Index("IDX_manju_project_folderId", ["folderId"])
export class ManjuProject {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  /** 所属合集；null = 工作台根目录 */
  @Column({ type: "varchar", nullable: true })
  folderId!: string | null;

  @ManyToOne(() => ManjuFolder, (f) => f.projects, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "folderId" })
  folder!: ManjuFolder | null;

  @Column({ default: "未命名漫剧" })
  title!: string;

  @Column({ type: "varchar", length: 2048, nullable: true })
  coverUrl!: string | null;

  /** 完整草稿：script / settings / assets / shots / episodes … */
  @Column({ type: "json", nullable: true })
  draft!: Record<string, unknown> | null;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
