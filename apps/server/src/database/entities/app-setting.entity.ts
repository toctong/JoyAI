import {
  BeforeInsert,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { newId } from "../id";

/**
 * mysql2 + TypeORM `json` columns blow up on primitive string values:
 * driver already parses JSON, then TypeORM may `JSON.parse` again
 * (`JSON.parse("http://…")` → 500). Store as TEXT via transformers instead.
 */
export const SETTINGS_JSON_PRIM = "__joyai_prim";

export function wrapSettingValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  return { [SETTINGS_JSON_PRIM]: value };
}

export function unwrapSettingValue(value: unknown): unknown {
  if (value == null) return value;

  let parsed: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Legacy plain string (not JSON) — use as-is
      return value;
    }
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Object.keys(parsed as object).length === 1 &&
    Object.prototype.hasOwnProperty.call(parsed, SETTINGS_JSON_PRIM)
  ) {
    return (parsed as Record<string, unknown>)[SETTINGS_JSON_PRIM];
  }
  return parsed;
}

const settingValueText = {
  to: (value: unknown) => {
    const wrapped = wrapSettingValue(value);
    if (wrapped === null || wrapped === undefined) return null;
    return JSON.stringify(wrapped);
  },
  from: (value: unknown) => unwrapSettingValue(value),
};

@Entity("app_setting")
export class AppSetting {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ unique: true })
  key!: string;

  /** TEXT + manual JSON — avoids MySQL JSON + mysql2 double-parse 500s */
  @Column({ type: "text", nullable: true, transformer: settingValueText })
  value!: unknown;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
