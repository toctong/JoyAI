import "./common/crud.config";
import "./common/load-env";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Logger, ValidationPipe, BadRequestException } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { SystemLogService } from "./modules/audit/system-log.service";

async function bootstrap() {
  const bootLogger = new Logger("Bootstrap");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Nest Logger already covers boot/request errors; Fastify/Pino would spam
    // raw JSON "Server listening at http://…" for every NIC.
    new FastifyAdapter({ logger: false }),
  );

  const systemLogs = app.get(SystemLogService);
  process.on("unhandledRejection", (reason) => {
    const message =
      reason instanceof Error ? reason.message : String(reason);
    bootLogger.error(
      `unhandledRejection: ${message}`,
      reason instanceof Error ? reason.stack : undefined,
    );
    systemLogs.error("bootstrap", `unhandledRejection: ${message}`, {
      stack: reason instanceof Error ? reason.stack ?? null : null,
    });
  });
  process.on("uncaughtException", (err) => {
    bootLogger.error(`uncaughtException: ${err.message}`, err.stack);
    systemLogs.error("bootstrap", `uncaughtException: ${err.message}`, {
      stack: err.stack ?? null,
    });
  });

  const config = app.get(ConfigService);
  const isProd = config.get<string>("NODE_ENV") === "production";
  const origins = (config.get<string>("CORS_ORIGINS") ?? "http://localhost:9000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const reflectAnyOrigin = !isProd || origins.includes("*");
  app.enableCors({
    // Dev reflects any Origin so LAN IP access works. Prod is an allowlist,
    // unless CORS_ORIGINS contains * (home NAS, browser host is not fixed).
    origin: reflectAnyOrigin ? true : origins,
    credentials: true,
    // Nest+Fastify 默认只有 GET,HEAD,POST；管理端更新/删除需要 PATCH/PUT/DELETE
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.setGlobalPrefix("api");
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const msgs = errors.flatMap((e) =>
          Object.values(e.constraints ?? {}),
        );
        return new BadRequestException(
          msgs.length > 0 ? msgs.join("；") : "请求参数无效",
        );
      },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle("FrameRally API")
    .setDescription("FrameRally AIGC platform API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));

  const port = Number(config.get("PORT") ?? 3001);
  await app.listen(port, "0.0.0.0");
  bootLogger.log(`listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("bootstrap failed", err);
  process.exit(1);
});
