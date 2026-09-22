import { CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * Persist wall-clock-independent UTC. Pair with TypeORM `timezone: "Z"` and
 * MySQL session/default `+00:00`. Plain CURRENT_TIMESTAMP under Asia/Shanghai
 * + timezone Z was read as UTC and shown +8h in the browser.
 *
 * MySQL only allows CURRENT_TIMESTAMP (not UTC_TIMESTAMP) as DATETIME
 * DEFAULT / ON UPDATE. With session time_zone = '+00:00' they are equivalent.
 */
export function UtcCreateDateColumn(): PropertyDecorator {
  return CreateDateColumn({
    type: "datetime",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
  });
}

export function UtcUpdateDateColumn(): PropertyDecorator {
  return UpdateDateColumn({
    type: "datetime",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)",
  });
}
