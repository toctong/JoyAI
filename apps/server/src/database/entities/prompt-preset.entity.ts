import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";

export type PromptPresetScope = "global" | "canvas";

@Entity("prompt_preset")
@Index("IDX_prompt_preset_scope_enabled_sort", ["scope", "enabled", "sortOrder"])
@Index("IDX_prompt_preset_canvas_project", ["canvasProjectId", "updatedAt"])
export class PromptPreset {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ type: "varchar", length: 50 })
  title!: string;

  @Column({ type: "text" })
  text!: string;

  @Column({ type: "varchar", length: 16 })
  scope!: PromptPresetScope;

  /** Required when scope=canvas; null for global. */
  @Column({ type: "varchar", nullable: true })
  canvasProjectId!: string | null;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @Column({ type: "varchar", nullable: true })
  createdByUserId!: string | null;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
