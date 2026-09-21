import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { JobKind } from "../enums";
import { newId } from "../id";
import { Channel } from "./channel.entity";

@Entity("model")
@Unique("UQ_model_channel_remote", ["channelId", "remoteId"])
@Index("IDX_model_kind_enabled", ["kind", "enabled"])
export class Model {
  @PrimaryColumn("varchar")
  id!: string;

  @Index()
  @Column()
  channelId!: string;

  @ManyToOne(() => Channel, (c) => c.models, { onDelete: "CASCADE" })
  @JoinColumn({ name: "channelId" })
  channel!: Channel;

  @Column()
  name!: string;

  @Column({ type: "varchar" })
  kind!: JobKind;

  @Column()
  remoteId!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  description!: string | null;

  @Column({ type: "json", nullable: true })
  pricing!: Record<string, unknown> | null;

  @Column({ type: "json", nullable: true })
  capabilities!: Record<string, unknown> | null;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ default: false })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
