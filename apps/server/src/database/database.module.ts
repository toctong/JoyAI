import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { ENTITIES } from "./entities";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const configured =
          config.get<string>("DATABASE_PATH") ?? "./data/sql.db";
        const dbPath = isAbsolute(configured)
          ? configured
          : resolve(process.cwd(), configured);
        mkdirSync(dirname(dbPath), { recursive: true });

        return {
          // sql.js: pure WASM SQLite — no native build (Windows-friendly)
          type: "sqljs" as const,
          location: dbPath,
          autoSave: true,
          entities: [...ENTITIES],
          synchronize: true,
          logging: config.get<string>("TYPEORM_LOGGING") === "true",
        };
      },
    }),
    TypeOrmModule.forFeature([...ENTITIES]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
