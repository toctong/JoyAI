import { randomBytes } from "node:crypto";

/** Cuid-like id that works under Nest CommonJS (no ESM-only deps). */
export function newId(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}
