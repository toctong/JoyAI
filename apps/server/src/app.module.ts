import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ChannelsModule } from "./modules/channels/channels.module";
import { ModelsModule } from "./modules/models/models.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { StorageModule } from "./modules/storage/storage.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { CanvasModule } from "./modules/canvas/canvas.module";
import { ManjuModule } from "./modules/manju/manju.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { AdminModule } from "./modules/admin/admin.module";
import { HealthModule } from "./modules/health/health.module";
import { ExploreModule } from "./modules/explore/explore.module";
import { ChangelogModule } from "./modules/changelog/changelog.module";
import { AuditModule } from "./modules/audit/audit.module";
import { BootstrapService } from "./common/bootstrap.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>("REDIS_URL") ?? "redis://localhost:6379",
          // Producer fail-fast; Workers still override maxRetriesPerRequest internally.
          enableOfflineQueue: false,
          connectTimeout: 2_000,
        },
      }),
    }),
    DatabaseModule,
    CommonModule,
    HealthModule,
    ExploreModule,
    ChangelogModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ChannelsModule,
    ModelsModule,
    JobsModule,
    StorageModule,
    AssetsModule,
    CanvasModule,
    ManjuModule,
    SettingsModule,
    RealtimeModule,
    AdminModule,
  ],
  providers: [BootstrapService],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly bootstrap: BootstrapService) {}

  async onModuleInit() {
    await this.bootstrap.run();
  }
}
