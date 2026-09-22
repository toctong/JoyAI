import { CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * Persist wall-clock-independent UTC. Pair with TypeORM `timezone: "Z"` and
 * MySQL session/default `+00:00`. Plain CURRENT_TIMESTAMP under Asia/Shanghai
 * + timezone Z was read as UTC and shown +8h in the browser.
 */
export function UtcCreateDateColumn(): PropertyDecorator {
  return CreateDateColumn({
    type: "datetime",
    precision: 3,
    default: () => "UTC_TIMESTAMP(3)",
  });
}

export function UtcUpdateDateColumn(): PropertyDecorator {
  return UpdateDateColumn({
    type: "datetime",
    precision: 3,
    default: () => "UTC_TIMESTAMP(3)",
    onUpdate: "UTC_TIMESTAMP(3)",
  });
}
