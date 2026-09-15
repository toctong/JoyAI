import {
  BeforeInsert,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { newId } from "../id";

@Entity("app_setting")
export class AppSetting {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column({ type: "simple-json" })
  value!: unknown;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
