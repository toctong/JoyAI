import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaModule } from "./common/prisma/prisma.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ChannelsModule } from "./modules/channels/channels.module";
import { ModelsModule } from "./modules/models/models.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { StorageModule } from "./modules/storage/storage.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { CanvasModule } from "./modules/canvas/canvas.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { AdminModule } from "./modules/admin/admin.module";
import { BootstrapService } from "./common/bootstrap.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>("REDIS_URL") ?? "redis://localhost:6379",
        },
      }),
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    ChannelsModule,
    ModelsModule,
    JobsModule,
    StorageModule,
    AssetsModule,
    CanvasModule,
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
