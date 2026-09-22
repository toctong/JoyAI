import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { DataSource, type DataSourceOptions } from "typeorm";
import { ENTITIES } from "./entities";
import { databaseOptions } from "./data-source-options";
import { ensureMysqlFkCoveringIndexes } from "./ensure-fk-indexes";

/** Ensure every pooled connection uses UTC so CURRENT_TIMESTAMP agrees with timezone: Z. */
function attachUtcSession(dataSource: DataSource) {
  const pool = (
    dataSource.driver as { pool?: { on?: (ev: string, fn: (conn: { query: (sql: string) => void }) => void) => void } }
  ).pool;
  pool?.on?.("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...databaseOptions(config),
        // Defer schema sync until FK covering indexes exist (dataSourceFactory).
        synchronize: false,
        retryAttempts: 10,
        retryDelay: 3000,
      }),
      dataSourceFactory: async (options?: DataSourceOptions) => {
        if (!options) {
          throw new Error("TypeORM options missing");
        }
        const dataSource = await new DataSource({
          ...options,
          synchronize: false,
        }).initialize();
        attachUtcSession(dataSource);
        await dataSource.query("SET time_zone = '+00:00'");
        await ensureMysqlFkCoveringIndexes(dataSource);
        // Matches data-source-options synchronize: true (dev/docker).
        await dataSource.synchronize();
        return dataSource;
      },
    }),
    TypeOrmModule.forFeature([...ENTITIES]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
