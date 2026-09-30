import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Logger, Optional } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Server, Socket } from "socket.io";
import { SystemLogService } from "../audit/system-log.service";

/** Admin ops room — all job lifecycle events for /admin/jobs without HTTP polling. */
export const ADMIN_JOBS_ROOM = "admin:jobs";

@WebSocketGateway({
  namespace: "/jobs",
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly systemLogs?: SystemLogService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify<{
        sub: string;
        role?: string;
      }>(token, {
        secret: this.config.get<string>("JWT_SECRET") ?? "dev-secret",
      });
      await client.join(`user:${payload.sub}`);
      if (payload.role === "admin") {
        await client.join(ADMIN_JOBS_ROOM);
      }
    } catch (e) {
      this.logger.warn(`WS auth failed: ${e}`);
      client.disconnect();
    }
  }

  emitJob(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
    this.emitAdminJob(userId, event, payload);

    if (event !== "job:failed" || !this.systemLogs) return;
    const body = (payload ?? {}) as {
      jobId?: string;
      error?: string;
      status?: string;
      kind?: string;
      purpose?: string;
    };
    const err = (body.error ?? "").trim();
    if (!err || err === "已中断" || body.status === "cancelled") return;
    this.systemLogs.error("jobs", err, {
      userId,
      context: {
        jobId: body.jobId ?? null,
        kind: body.kind ?? null,
        purpose: body.purpose ?? null,
      },
    });
  }

  /** Lightweight fan-out for admin job list (patch rows, no full reload). */
  private emitAdminJob(userId: string, event: string, payload: unknown) {
    if (!this.server) return;
    if (
      event !== "job:progress" &&
      event !== "job:completed" &&
      event !== "job:failed"
    ) {
      return;
    }
    const body = (payload ?? {}) as Record<string, unknown>;
    const nested = (body.job as { id?: string; status?: string } | undefined) ?? undefined;
    const jobId = String(body.jobId ?? nested?.id ?? body.id ?? "").trim();
    if (!jobId) return;

    let status = String(body.status ?? nested?.status ?? "").trim();
    if (!status) {
      if (event === "job:completed") status = "succeeded";
      else if (event === "job:failed") status = "failed";
    }

    this.server.to(ADMIN_JOBS_ROOM).emit("admin:job", {
      event,
      jobId,
      userId,
      status: status || null,
      progress:
        typeof body.progress === "number" ? body.progress : undefined,
      error: typeof body.error === "string" ? body.error : null,
      kind: typeof body.kind === "string" ? body.kind : null,
      purpose: typeof body.purpose === "string" ? body.purpose : null,
      finishedAt:
        event === "job:completed" || event === "job:failed"
          ? new Date().toISOString()
          : null,
    });
  }
}
