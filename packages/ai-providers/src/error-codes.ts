/**
 * Provider API error-code → zh-CN labels.
 * Sources: Volcengine Ark public errors, DashScope/Model Studio common codes,
 * OpenAI-compatible relays (APIMart / ToAPIs).
 */

/** Shared / OpenAI-style codes seen across relays. */
const COMMON_CODES: Record<string, string> = {
  // auth
  AuthenticationError: "鉴权失败，请检查 API Key",
  invalid_api_key: "API Key 无效",
  InvalidApiKey: "API Key 无效",
  invalid_request_error: "请求无效",
  Unauthorized: "未授权，请检查 API Key",
  MissingAuthenticationHeader: "缺少鉴权请求头",
  AuthenticationHeaderIsInvalid: "鉴权信息无效",

  // params
  BadRequest: "请求错误",
  MissingParameter: "缺少必要参数",
  InvalidParameter: "请求参数无效",
  InvalidRequest: "请求无效",
  invalid_parameter_error: "请求参数无效",

  // access / billing
  AccessDenied: "没有访问该资源的权限",
  PermissionDenied: "权限不足",
  AccountOverdueError: "账号已欠费，请充值后重试",
  Arrearage: "账号已欠费，请充值后重试",
  BillingNotEnabled: "未开通计费或余额不足",
  InsufficientQuota: "额度不足",
  insufficient_quota: "额度不足",
  QuotaExceeded: "额度已用尽，请开通模型或提升配额",
  balance_not_enough: "余额不足",

  // rate limit
  RateLimitExceeded: "请求频率超限，请稍后重试",
  rate_limit_exceeded: "请求频率超限，请稍后重试",
  RateLimitError: "请求频率超限，请稍后重试",
  TooManyRequests: "请求过多，请稍后重试",
  ServerOverloaded: "服务繁忙，请稍后重试",
  ModelLoadingError: "模型加载中，请稍后重试",

  // not found
  NotFound: "资源不存在",
  ModelNotFound: "模型不存在",
  model_not_found: "模型不存在",
  InvalidEndpoint: "推理接入点无效",

  // content / safety
  ContentFilter: "内容未通过安全审核",
  content_filter: "内容未通过安全审核",
  ContentPolicyViolation: "内容违反平台政策",
  DataInspectionFailed: "内容审核未通过",
  InputTextSensitiveContentDetected: "输入文本包含敏感内容",
  OutputTextSensitiveContentDetected: "输出文本包含敏感内容",
  InputImageSensitiveContentDetected: "输入图片包含敏感内容",

  // server
  InternalServiceError: "上游内部错误，请稍后重试",
  InternalServerError: "上游服务异常，请稍后重试",
  ServiceUnavailable: "服务暂不可用，请稍后重试",
  Timeout: "请求超时，请稍后重试",
  RequestTimeOut: "请求超时，请稍后重试",
};

/** Volcengine Ark specific codes (and dotted variants). */
const VOLCENGINE_CODES: Record<string, string> = {
  ...COMMON_CODES,
  "InvalidEndpoint.ClosedEndpoint": "推理接入点已关闭或暂不可用",
  "InvalidEndpoint.NotFound": "推理接入点不存在或无效",
  "RateLimitExceeded.EndpointRPMExceeded": "接入点 RPM 超限，请稍后重试",
  "RateLimitExceeded.EndpointTPMExceeded": "接入点 TPM 超限，请稍后重试",
  "RateLimitExceeded.FoundationModelRPMExceeded": "基础模型 RPM 超限，请稍后重试",
  "RateLimitExceeded.FoundationModelTPMExceeded": "基础模型 TPM 超限，请稍后重试",
  ModelAccountRpmRateLimitExceeded: "账号模型 RPM 超限，请稍后重试",
  ModelAccountTpmRateLimitExceeded: "账号模型 TPM 超限，请稍后重试",
  InvalidEndpointOrModel: "模型或接入点不存在",
  "InvalidEndpointOrModel.NotFound":
    "模型或接入点不存在（请到火山方舟「开通管理」启用该模型，或创建对应推理接入点）",
  SensitiveContentDetected: "内容未通过安全审核",
  OutputImageSensitiveContentDetected: "生成图片未通过安全审核",
  InvalidImageSize: "图片尺寸不符合模型要求",
  InvalidImageURL: "图片 URL 无效或无法访问",
  InvalidVideoURL: "视频 URL 无效或无法访问",
  OperationDenied: "操作被拒绝",
  SetLimitExceeded: "已超过设定限额",
};

/** DashScope / 百炼 common codes. */
const DASHSCOPE_CODES: Record<string, string> = {
  ...COMMON_CODES,
  InvalidApiKey: "API Key 无效或已过期",
  InvalidParameter: "请求参数无效",
  "InvalidParameter.UnsupportedMediaType": "不支持的媒体类型",
  "InvalidParameter.DataInspection": "内容审核未通过",
  DataInspectionFailed: "内容审核未通过",
  Throttling: "触发限流，请稍后重试",
  "Throttling.RateQuota": "请求频率超限，请稍后重试",
  "Throttling.AllocationQuota": "Token 配额超限，请稍后重试",
  QuotaExhausted: "免费额度已用尽",
  FreeTierOnly: "仅支持免费额度调用",
  ModelNotExist: "模型不存在或未开通",
  ModelAccessDenied: "无权调用该模型，请先开通",
  AccessDenied: "无权访问该资源",
  RequestRateIncreasedTooQuickly: "请求频率突增被限流，请稍后重试",
  InternalError: "百炼内部错误，请稍后重试",
  "InternalError.Algo": "算法服务异常，请稍后重试",
  "InternalError.Timeout": "上游处理超时，请稍后重试",
  UnsupportedOperation: "不支持的操作",
  InvalidURL: "URL 无效或无法访问",
  DownloadFailed: "下载素材失败",
  MediaFormatInvalid: "媒体格式不支持或损坏",
  PayloadTooLarge: "请求体过大",
  WorkflowException: "工作流执行异常",
};

/** OpenAI-compatible relays (APIMart / ToAPIs). */
const OPENAI_COMPAT_CODES: Record<string, string> = {
  ...COMMON_CODES,
  billing_hard_limit_reached: "账单硬限额已达上限",
  billing_not_active: "计费未激活",
  account_deactivated: "账号已停用",
  engine_overloaded: "引擎过载，请稍后重试",
  server_error: "上游服务器错误",
  task_failed: "上游任务失败",
};

const HTTP_STATUS_ZH: Record<number, string> = {
  400: "请求参数错误",
  401: "鉴权失败，请检查 API Key",
  403: "无权限或账户异常（欠费/未开通）",
  404: "接口或资源不存在，请检查 Base URL / 模型 ID",
  408: "请求超时",
  413: "请求体过大",
  422: "参数校验失败",
  429: "请求过于频繁或额度不足",
  500: "上游服务内部错误",
  502: "上游网关错误",
  503: "上游服务暂不可用",
  504: "上游网关超时",
};

export type ProviderErrorPlatform =
  | "volcengine"
  | "dashscope"
  | "apimart"
  | "toapis"
  | "openai"
  | string;

function codeTableFor(platform?: string): Record<string, string> {
  switch (platform) {
    case "volcengine":
      return VOLCENGINE_CODES;
    case "dashscope":
      return DASHSCOPE_CODES;
    case "apimart":
    case "toapis":
    case "openai":
      return OPENAI_COMPAT_CODES;
    default:
      return {
        ...VOLCENGINE_CODES,
        ...DASHSCOPE_CODES,
        ...OPENAI_COMPAT_CODES,
      };
  }
}

/** Resolve a vendor error code to a Chinese label (supports dotted prefixes). */
export function translateErrorCode(
  code: string | null | undefined,
  platform?: ProviderErrorPlatform,
): string | undefined {
  if (!code) return undefined;
  const raw = String(code).trim();
  if (!raw) return undefined;

  const table = codeTableFor(platform);
  if (table[raw]) return table[raw];

  // InvalidParameter.size → InvalidParameter
  const base = raw.split(".")[0];
  if (base && table[base]) {
    const rest = raw.slice(base.length + 1);
    return rest ? `${table[base]}（${rest}）` : table[base];
  }

  // case-insensitive fallback
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(table)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export function translateHttpStatus(status: number | undefined): string | undefined {
  if (!status) return undefined;
  return HTTP_STATUS_ZH[status];
}

export type ParsedProviderError = {
  code?: string;
  type?: string;
  message?: string;
  status?: number;
  requestId?: string;
};

/** Pull code / message / type from heterogeneous provider JSON bodies. */
export function parseProviderErrorBody(
  data: unknown,
  status?: number,
): ParsedProviderError {
  const out: ParsedProviderError = { status };

  if (data == null) return out;
  if (typeof data === "string") {
    const text = data.trim();
    if (text) out.message = text.slice(0, 500);
    return out;
  }
  if (typeof data !== "object") return out;

  const root = data as Record<string, unknown>;
  const err =
    root.error && typeof root.error === "object"
      ? (root.error as Record<string, unknown>)
      : null;
  const dataField =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const nestedErr =
    dataField?.error && typeof dataField.error === "object"
      ? (dataField.error as Record<string, unknown>)
      : null;
  const output =
    root.output && typeof root.output === "object"
      ? (root.output as Record<string, unknown>)
      : null;

  // APIMart envelopes use top-level `code: 200` even on failed tasks;
  // the real reason lives under `data.error`.
  const rawRootCode = err?.code ?? root.code ?? output?.code;
  const rootCode =
    rawRootCode != null && !isSuccessBusinessCode(rawRootCode)
      ? String(rawRootCode)
      : undefined;

  const code =
    (nestedErr?.code as string | number | undefined) ??
    (err?.code as string | number | undefined) ??
    rootCode ??
    (nestedErr?.type as string | undefined) ??
    (err?.type as string | undefined);
  const type =
    (nestedErr?.type as string | undefined) ??
    (err?.type as string | undefined) ??
    (root.type as string | undefined);
  const message =
    (nestedErr?.message as string | undefined) ??
    (err?.message as string | undefined) ??
    (root.message as string | undefined) ??
    (root.msg as string | undefined) ??
    (output?.message as string | undefined) ??
    (dataField?.message as string | undefined);

  const requestId =
    (root.request_id as string | undefined) ??
    (root.requestId as string | undefined) ??
    (err?.request_id as string | undefined) ??
    (nestedErr?.request_id as string | undefined) ??
    extractRequestId(typeof message === "string" ? message : undefined);

  if (code != null && String(code).length) out.code = String(code);
  if (type) out.type = String(type);
  if (message) out.message = String(message).slice(0, 500);
  if (requestId) out.requestId = requestId;
  return out;
}

/** APIMart / similar gateways use numeric 200 as "HTTP-ish OK", not an error code. */
function isSuccessBusinessCode(code: unknown): boolean {
  if (code == null) return false;
  const s = String(code).trim().toLowerCase();
  return s === "200" || s === "0" || s === "ok" || s === "success";
}

function extractRequestId(message?: string): string | undefined {
  if (!message) return undefined;
  const m = message.match(/Request ID:\s*([a-zA-Z0-9-]+)/i);
  return m?.[1];
}

function stripRequestId(message: string): string {
  return message.replace(/\s*Request ID:\s*[a-zA-Z0-9-]+\s*/gi, " ").trim();
}

/**
 * Build a Chinese-first error string from parsed provider error fields.
 * Shape: `中文说明：原文补充` or just `中文说明` when message is redundant English boilerplate.
 */
export function formatParsedProviderError(
  parsed: ParsedProviderError,
  opts?: { platform?: ProviderErrorPlatform; fallback?: string },
): string {
  const fallback = opts?.fallback ?? "请求失败";
  const platform = opts?.platform;

  const zhFromCode =
    translateErrorCode(parsed.code, platform) ??
    translateErrorCode(parsed.type, platform) ??
    translateHttpStatus(parsed.status);

  const rawMsg = parsed.message ? stripRequestId(parsed.message) : undefined;
  const zhFromMsg = rawMsg ? translateEnglishMessage(rawMsg) : undefined;
  const msgLooksEnglish =
    rawMsg != null &&
    /[A-Za-z]/.test(rawMsg) &&
    !/[\u4e00-\u9fff]/.test(rawMsg);

  let text: string;
  if (zhFromCode || zhFromMsg) {
    const zh = zhFromCode ?? zhFromMsg!;
    // Avoid duplicating when vendor already returned Chinese
    if (rawMsg && !msgLooksEnglish && rawMsg !== zh) {
      text = `${zh}：${rawMsg}`;
    } else if (
      rawMsg &&
      msgLooksEnglish &&
      !zhFromMsg &&
      !isBoilerplateEnglish(rawMsg, parsed.code)
    ) {
      text = `${zh}：${rawMsg}`;
    } else {
      text = zh;
    }
  } else if (rawMsg) {
    text = rawMsg;
  } else if (parsed.code) {
    text = `上游错误（${parsed.code}）`;
  } else if (parsed.status) {
    text = `请求失败（HTTP ${parsed.status}）`;
  } else {
    text = fallback;
  }

  if (parsed.code && zhFromCode && !text.includes(parsed.code)) {
    text = `${text} [${parsed.code}]`;
  } else if (parsed.code && !zhFromCode) {
    text = `${text} [${parsed.code}]`;
  }

  return text;
}

function isBoilerplateEnglish(message: string, code?: string): boolean {
  const m = message.toLowerCase();
  if (code && m.includes(code.toLowerCase())) return true;
  return (
    m.includes("one or more parameters") ||
    m.includes("missing one or multiple required parameters") ||
    m.includes("api key or ak/sk") ||
    m.includes("please retry later") ||
    m.includes("request failed because") ||
    m.includes("exhausted its free trial quota") ||
    m.includes("access denied, please make sure your account")
  );
}

/** Map common English vendor messages when no machine code is present. */
function translateEnglishMessage(message: string): string | undefined {
  const m = message.toLowerCase();
  if (
    m.includes("content safety") ||
    m.includes("content policy") ||
    m.includes("rejected by the content") ||
    m.includes("safety system")
  ) {
    return "内容未通过安全审核";
  }
  if (m.includes("insufficient") && (m.includes("balance") || m.includes("credit"))) {
    return "余额不足";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "请求过于频繁，请稍后重试";
  }
  return undefined;
}
