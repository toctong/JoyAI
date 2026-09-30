import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SystemLogService } from "../modules/audit/system-log.service";

/**
 * Global HTTP error gate:
 * - Logs unexpected errors with stack
 * - Never leaks stack / SQL / internals to clients
 * - Turns objecty Nest messages (e.g. Zod flatten) into readable Chinese strings
 * - Persists warn/error into system_log for admin console
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Optional() private readonly systemLogs?: SystemLogService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = "服务内部错误，请稍后重试";
    let details: unknown;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = localizeHttpMessage(body, status);
      } else if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        details = record;
        message = localizeHttpMessage(
          stringifyMessage(record.message ?? record.error ?? message),
          status,
        );
      }
    } else {
      const errMsg =
        exception instanceof Error ? exception.message : String(exception);
      stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${errMsg}`,
        stack,
      );
      message = localizeHttpMessage(errMsg, status);
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${message}`,
      );
    } else if (status >= 400 && status < 500) {
      this.logger.warn(
        `${request.method} ${request.url} → ${status}: ${message}`,
      );
    }

    // Persist ops-relevant HTTP failures (skip noisy 401/404).
    if (this.systemLogs && shouldPersistHttp(status)) {
      const level = status >= 500 ? "error" : "warn";
      this.systemLogs.write({
        level,
        source: "http",
        message: `${request.method} ${request.url} → ${status}: ${message}`,
        context: {
          method: request.method,
          path: request.url,
          statusCode: status,
        },
        stack: stack ?? null,
        userId: (request as { user?: { id?: string } }).user?.id ?? null,
      });
    }

    void response.status(status).send({
      statusCode: status,
      message,
      error: httpStatusLabel(status),
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV !== "production" && details
        ? { details }
        : {}),
    });
  }
}

function shouldPersistHttp(status: number) {
  if (status >= 500) return true;
  if (status === 401 || status === 403 || status === 404) return false;
  // 429 / 400 validation etc. as warn — useful for ops
  return status === 400 || status === 409 || status === 422 || status === 429;
}

function stringifyMessage(raw: unknown): string {
  if (raw == null) return "服务内部错误，请稍后重试";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === "string" ? item : stringifyMessage(item)))
      .filter(Boolean)
      .join("；");
  }
  if (typeof raw === "object") {
    const obj = raw as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const parts: string[] = [];
    if (Array.isArray(obj.formErrors)) {
      for (const m of obj.formErrors) {
        if (m) parts.push(m);
      }
    }
    if (obj.fieldErrors && typeof obj.fieldErrors === "object") {
      for (const [key, msgs] of Object.entries(obj.fieldErrors)) {
        if (!msgs?.length) continue;
        parts.push(`${key}: ${msgs.join("、")}`);
      }
    }
    if (parts.length > 0) return parts.slice(0, 8).join("；");
    try {
      return JSON.stringify(raw);
    } catch {
      return "请求参数无效";
    }
  }
  return String(raw);
}

function localizeHttpMessage(message: string, status: number): string {
  const text = message.trim();
  if (!text || text === "[object Object]") {
    return status >= 500
      ? "服务内部错误，请稍后重试"
      : "请求无效，请检查参数后重试";
  }

  const lower = text.toLowerCase();
  if (
    lower === "internal server error" ||
    lower === "internal error" ||
    text === "Internal Server Error"
  ) {
    return "服务内部错误，请稍后重试";
  }
  if (lower === "bad gateway" || status === 502) {
    return "网关错误，请稍后重试";
  }
  if (lower === "service unavailable" || status === 503) {
    return "服务暂不可用，请稍后重试";
  }
  if (lower === "gateway timeout" || status === 504) {
    return "网关超时，请稍后重试";
  }
  if (lower.includes("econnrefused") || lower.includes("connect econnrefused")) {
    return "依赖服务未启动或连接失败，请稍后重试";
  }
  if (lower.includes("enotfound")) {
    return "依赖服务地址无法解析，请检查配置";
  }

  if (text.length > 280) return `${text.slice(0, 280)}…`;
  return text;
}

function httpStatusLabel(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    case 429:
      return "Too Many Requests";
    case 502:
      return "Bad Gateway";
    case 503:
      return "Service Unavailable";
    case 504:
      return "Gateway Timeout";
    default:
      return status >= 500 ? "Internal Error" : "Error";
  }
}
