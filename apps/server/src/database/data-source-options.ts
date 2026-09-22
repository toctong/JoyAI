import type { DataSourceOptions } from "typeorm";
import { ENTITIES } from "./entities";

export const DEFAULT_DATABASE_URL =
  "mysql://joyai:joyai@127.0.0.1:3306/joyai";

export function databaseOptions(env: {
  get: (key: string) => string | undefined;
}): DataSourceOptions {
  return {
    type: "mysql",
    url: env.get("DATABASE_URL") ?? DEFAULT_DATABASE_URL,
    charset: "utf8mb4",
    // Treat DATETIME as UTC on the wire. Must match MySQL session/default UTC
    // (see docker --default-time-zone and pool SET time_zone).
    timezone: "Z",
    entities: [...ENTITIES],
    synchronize: true,
    logging: env.get("TYPEORM_LOGGING") === "true",
  };
}
