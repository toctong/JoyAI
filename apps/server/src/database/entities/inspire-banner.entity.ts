import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";

/** Inspire home promo carousel slide. */
@Entity("inspire_banner")
@Index("IDX_inspire_banner_enabled_sort", ["enabled", "sortOrder"])
export class InspireBanner {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  title!: string;

  @Column({ type: "varchar", length: 240, nullable: true })
  subtitle!: string | null;

  /** Cover image or video URL (http(s) or site-relative). */
  @Column({ type: "varchar", length: 1024 })
  coverUrl!: string;

  @Column({ type: "varchar", length: 16, default: "image" })
  coverKind!: "image" | "video";

  /** Poster / first-frame image for video covers (optional). */
  @Column({ type: "varchar", length: 1024, nullable: true })
  posterUrl!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ctaLabel!: string | null;

  /** Click target — internal path or absolute URL. */
  @Column({ type: "varchar", length: 1024, nullable: true })
  href!: string | null;

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
