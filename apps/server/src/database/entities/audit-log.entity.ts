import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";

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
  @CreateDateColumn()
  createdAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
