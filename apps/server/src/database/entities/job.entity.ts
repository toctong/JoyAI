import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { JobKind, JobStatus } from "../enums";
import { newId } from "../id";
import { User } from "./user.entity";
import type { Asset } from "./asset.entity";

@Entity("job")
@Index("IDX_job_user_created", ["userId", "createdAt"])
export class Job {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, (u) => u.jobs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar" })
  kind!: JobKind;

  @Index()
  @Column({ type: "varchar", default: JobStatus.queued })
  status!: JobStatus;

  @Column({ type: "simple-json" })
  input!: Record<string, unknown>;

  @Column({ type: "simple-json", nullable: true })
  result!: Record<string, unknown> | null;

  @Column({ type: "varchar", nullable: true })
  error!: string | null;

  @Column({ type: "varchar", nullable: true })
  remoteTaskId!: string | null;

  @Column({ type: "integer", default: 0 })
  progress!: number;

  @Index()
  @Column({ type: "varchar", nullable: true })
  modelId!: string | null;

  @Column({ type: "varchar", nullable: true })
  modelName!: string | null;

  @Index()
  @Column({ type: "varchar", nullable: true })
  channelId!: string | null;

  @Column({ type: "varchar", nullable: true })
  channelName!: string | null;

  @Column({ type: "varchar", nullable: true })
  platform!: string | null;

  @Column({ type: "datetime", nullable: true })
  startedAt!: Date | null;

  @Column({ type: "datetime", nullable: true })
  finishedAt!: Date | null;

  @Column({ type: "varchar", nullable: true })
  canvasProjectId!: string | null;

  @Column({ type: "varchar", nullable: true })
  canvasNodeId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany("Asset", (a: Asset) => a.job)
  assets!: Asset[];

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
