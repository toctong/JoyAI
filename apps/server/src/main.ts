import "./common/crud.config";
import "./common/load-env";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
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
}

bootstrap();
