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
import { ManjuFolder } from "./manju-folder.entity";

@Entity("manju_project")
@Index("IDX_manju_user_updated", ["userId", "updatedAt"])
@Index("IDX_manju_user_folder_updated", ["userId", "folderId", "updatedAt"])
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

  @Column({ type: "varchar", nullable: true })
  coverUrl!: string | null;

  /** 完整草稿：script / settings / assets / shots / episodes … */
  @Column({ type: "simple-json", nullable: true })
  draft!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
