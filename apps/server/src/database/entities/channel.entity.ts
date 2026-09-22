import {
  BeforeInsert,
  Column,
  Entity,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";
import type { Model } from "./model.entity";

@Entity("channel")
export class Channel {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  name!: string;

  @Column()
  platform!: string;

  @Column({ type: "varchar", length: 2048 })
  apiKey!: string;

  @Column({ type: "varchar", length: 1024 })
  baseUrl!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: "json", nullable: true })
  metadata!: Record<string, unknown> | null;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @OneToMany("Model", (m: Model) => m.channel)
  models!: Model[];

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
