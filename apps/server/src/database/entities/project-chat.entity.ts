import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";

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

  @Column({ type: "json" })
  payload!: Record<string, unknown>;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
