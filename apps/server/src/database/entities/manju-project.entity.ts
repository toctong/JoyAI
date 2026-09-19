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

@Entity("manju_project")
@Index("IDX_manju_user_updated", ["userId", "updatedAt"])
export class ManjuProject {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

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
