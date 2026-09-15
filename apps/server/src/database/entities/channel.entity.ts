import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { newId } from "../id";
import type { Model } from "./model.entity";

@Entity("channel")
export class Channel {
  @PrimaryColumn("varchar")
  id!: string;

  @Column()
  name!: string;

  @Column()
  platform!: string;

  @Column()
  apiKey!: string;

  @Column()
  baseUrl!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: "simple-json", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany("Model", (m: Model) => m.channel)
  models!: Model[];

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
