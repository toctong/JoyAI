import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn } from "../utc-date-columns";

@Entity("audit_log")
export class AuditLog {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ type: "varchar", nullable: true })
  userId!: string | null;

  @Column()
  action!: string;

  @Column({ type: "json", nullable: true })
  detail!: Record<string, unknown> | null;

  @Index()
  @UtcCreateDateColumn()
  createdAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
