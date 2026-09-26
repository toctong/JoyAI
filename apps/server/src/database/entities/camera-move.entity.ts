import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";

/** Video camera-move library item (运镜). */
@Entity("camera_move")
@Index("IDX_camera_move_enabled_sort", ["enabled", "sortOrder"])
@Index("IDX_camera_move_category", ["category", "sortOrder"])
export class CameraMove {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ unique: true, length: 64 })
  slug!: string;

  @Column({ type: "varchar", length: 80 })
  label!: string;

  /** Sentence appended to video generation prompts. */
  @Column({ type: "text" })
  prompt!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  thumbUrl!: string | null;

  /** Tab category, e.g. 基础控制 / 人物跟拍. */
  @Column({ type: "varchar", length: 64, default: "基础控制" })
  category!: string;

  /**
   * Moves sharing the same group replace each other when combining
   * (e.g. pan-left vs pan-right). Null = freely combinable.
   */
  @Column({ type: "varchar", length: 64, nullable: true })
  exclusiveGroup!: string | null;

  @Column({ default: true })
  enabled!: boolean;

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
