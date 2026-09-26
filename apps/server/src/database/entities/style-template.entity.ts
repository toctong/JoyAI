import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";

export type StyleSurface = "manju" | "canvas";

@Entity("style_template")
@Index("IDX_style_template_enabled_sort", ["enabled", "sortOrder"])
export class StyleTemplate {
  @PrimaryColumn("varchar")
  id!: string;

  /** Stable key compatible with manju settings.styleId (e.g. `realistic`). */
  @Column({ unique: true, length: 64 })
  slug!: string;

  @Column({ type: "varchar", length: 80 })
  label!: string;

  /** Full style sentence written into generation prompts. */
  @Column({ type: "text" })
  prompt!: string;

  @Column({ type: "varchar", length: 1024 })
  thumbUrl!: string;

  /** CSS tone fallback when thumb is missing. */
  @Column({ type: "varchar", length: 64, default: "cinematic" })
  tone!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  /** Product surfaces that may list this style. */
  @Column({ type: "json" })
  surfaces!: StyleSurface[];

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
