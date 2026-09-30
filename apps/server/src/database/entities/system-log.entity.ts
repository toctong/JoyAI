import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn } from "../utc-date-columns";

/** Ops log levels persisted for admin console (阿里云 SLS / 云监控风格). */
export type SystemLogLevel = "error" | "warn" | "info" | "debug";

@Entity("system_log")
export class SystemLog {
  @PrimaryColumn("varchar")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 16 })
  level!: SystemLogLevel;

  /** Module / subsystem, e.g. http, jobs, auth, redis, bootstrap */
  @Index()
  @Column({ type: "varchar", length: 64 })
  source!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "json", nullable: true })
  context!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  stack!: string | null;

  @Column({ type: "varchar", nullable: true })
  userId!: string | null;

  @Index()
  @UtcCreateDateColumn()
  createdAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
