import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";

/** Product surface that owns the skill. */
export type SkillCategory = "manju" | "canvas" | "tools" | "general";

@Entity("skill")
@Index("IDX_skill_category_enabled", ["category", "enabled"])
export class Skill {
  @PrimaryColumn("varchar")
  id!: string;

  /** Stable key, e.g. `script-write`. */
  @Column({ unique: true })
  slug!: string;

  @Column()
  name!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 32 })
  category!: SkillCategory;

  /**
   * LLM job `input.purpose` this skill serves
   * (e.g. `script_write`, `analyze_assets`, `canvas_text`).
   */
  @Column({ type: "varchar", length: 64 })
  @Index()
  purpose!: string;

  @Column({ type: "longtext" })
  systemPrompt!: string;

  @Column({ default: true })
  enabled!: boolean;

  /** Seeded catalog row — cannot delete, slug/purpose locked. */
  @Column({ default: false })
  builtin!: boolean;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
