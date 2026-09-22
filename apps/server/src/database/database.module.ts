import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { DataSource, type DataSourceOptions } from "typeorm";
import { ENTITIES } from "./entities";
import { databaseOptions } from "./data-source-options";

/** Ensure every pooled connection uses UTC so CURRENT_TIMESTAMP / UTC_TIMESTAMP agree with timezone: Z. */
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
        retryAttempts: 10,
        retryDelay: 3000,
      }),
      dataSourceFactory: async (options?: DataSourceOptions) => {
        if (!options) {
          throw new Error("TypeORM options missing");
        }
        const dataSource = await new DataSource(options).initialize();
        attachUtcSession(dataSource);
        await dataSource.query("SET time_zone = '+00:00'");
        return dataSource;
      },
    }),
    TypeOrmModule.forFeature([...ENTITIES]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
