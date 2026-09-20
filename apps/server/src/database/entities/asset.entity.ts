import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { User } from "./user.entity";
import { Job } from "./job.entity";

@Entity("asset")
@Index("IDX_asset_user_created", ["userId", "createdAt"])
export class Asset {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, (u) => u.assets, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar", nullable: true })
  jobId!: string | null;

  @ManyToOne(() => Job, (j) => j.assets, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "jobId" })
  job!: Job | null;

  @Column()
  kind!: string;

  /** studio | canvas | manju | upload — null = legacy, infer at read time */
  @Index()
  @Column({ type: "varchar", nullable: true })
  source!: string | null;

  @Column()
  url!: string;

  @Index()
  @Column({ type: "varchar", nullable: true })
  md5!: string | null;

  @Column({ type: "varchar", nullable: true })
  mimeType!: string | null;

  @Column({ type: "integer", nullable: true })
  size!: number | null;

  @Column({ type: "integer", nullable: true })
  width!: number | null;

  @Column({ type: "integer", nullable: true })
  height!: number | null;

  @Column({ type: "simple-json", nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
