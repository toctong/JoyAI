import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { newId } from "../id";

/** Per-project chat JSON, kept off canvas snapshots and manju drafts. */
@Entity("project_chat")
@Index("UQ_project_chat_scope_project", ["scope", "projectId"], { unique: true })
export class ProjectChat {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  /** canvas-agent | manju-script */
  @Column()
  scope!: string;

  @Column()
  projectId!: string;

  @Column({ type: "simple-json" })
  payload!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
