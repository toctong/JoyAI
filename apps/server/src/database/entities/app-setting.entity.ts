import {
  BeforeInsert,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { newId } from "../id";

/**
 * mysql2 already parses JSON columns. TypeORM then does
 * `typeof value === "string" ? JSON.parse(value)` which throws for
 * primitive string settings (e.g. proxy URL / TOS keys). Wrap primitives
 * as objects so round-trip works.
 */
const JSON_PRIM = "__joyai_prim";

const jsonPrimitiveSafe = {
  to: (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return value;
    return { [JSON_PRIM]: value };
  },
  from: (value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 1 &&
      Object.prototype.hasOwnProperty.call(value, JSON_PRIM)
    ) {
      return (value as Record<string, unknown>)[JSON_PRIM];
    }
    return value;
  },
};

@Entity("app_setting")
export class AppSetting {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column({ type: "json", transformer: jsonPrimitiveSafe })
  value!: unknown;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
