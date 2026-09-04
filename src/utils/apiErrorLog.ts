export const API_LOG_TEXT_LIMIT = 4_000;

const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const SENSITIVE_KEYS = new Set([
  "cookie",
  "setcookie",
  "authorization",
  "proxyauthorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "xshopeecookie",
  "apikey",
]);

export interface ApiRequestTrace {
  requestId: string;
  startedAtMs: number;
  endpoint: string;
}

export interface ApiErrorRecord {
  source: "frontend";
  timestamp: string;
  requestId: string;
  method: string;
  endpoint: string;
  status: number | null;
  durationMs: number;
  payload: unknown;
  response: unknown;
  error: { name: string; message: string; code: string };
  stack: string;
}

export interface ApiLogConsole {
  groupCollapsed?: (...values: unknown[]) => void;
  error: (...values: unknown[]) => void;
  groupEnd?: () => void;
}

const normalizeKey = (key: string): string =>
  key.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");

const truncateText = (value: string): string => {
  if (value.length <= API_LOG_TEXT_LIMIT) return value;
  return `${value.slice(0, API_LOG_TEXT_LIMIT - TRUNCATED.length)}${TRUNCATED}`;
};

const parseJsonBody = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const sanitizeNested = (
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown => {
  if (typeof value === "string") return truncateText(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return "[Undefined]";
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  if (depth >= 8) return "[MaxDepth]";

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNested(item, seen, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(normalizeKey(key))
      ? REDACTED
      : sanitizeNested(item, seen, depth + 1);
  }
  return result;
};

export const sanitizeApiLogValue = (value: unknown): unknown => {
  try {
    const sanitized = sanitizeNested(parseJsonBody(value), new WeakSet(), 0);
    const serialized = JSON.stringify(sanitized);
    if (!serialized || serialized.length <= API_LOG_TEXT_LIMIT) return sanitized;
    return { truncated: true, preview: truncateText(serialized) };
  } catch {
    return "[Unserializable]";
  }
};

const fallbackRequestId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through to a non-cryptographic diagnostic identifier.
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createApiRequestTrace = (
  endpoint: string,
  nowMs = Date.now(),
  requestId = fallbackRequestId(),
): ApiRequestTrace => ({ requestId, startedAtMs: nowMs, endpoint });

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null ? (value as UnknownRecord) : null;

const readTrace = (value: unknown): ApiRequestTrace | null => {
  const trace = asRecord(value);
  return trace &&
    typeof trace.requestId === "string" &&
    typeof trace.startedAtMs === "number" &&
    typeof trace.endpoint === "string"
    ? (trace as unknown as ApiRequestTrace)
    : null;
};

export const createApiErrorRecord = (
  error: unknown,
  nowMs = Date.now(),
): ApiErrorRecord => {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const config = asRecord(root?.config) ?? asRecord(response?.config);
  const trace = readTrace(config?.apiTrace);
  const startedAtMs = trace?.startedAtMs ?? nowMs;
  const status =
    typeof response?.status === "number" && Number.isFinite(response.status)
      ? response.status
      : null;
  const name = typeof root?.name === "string" ? root.name : "ApiError";
  const message =
    typeof root?.message === "string" && root.message
      ? root.message
      : typeof response?.statusText === "string" && response.statusText
        ? response.statusText
        : "Unknown API error";

  return {
    source: "frontend",
    timestamp: new Date(nowMs).toISOString(),
    requestId: trace?.requestId ?? "untracked",
    method: String(config?.method ?? "GET").toUpperCase(),
    endpoint: trace?.endpoint ?? String(config?.url ?? "unknown"),
    status,
    durationMs: Math.max(0, Math.round(nowMs - startedAtMs)),
    payload: sanitizeApiLogValue(config?.data),
    response: sanitizeApiLogValue(response?.data),
    error: {
      name,
      message: truncateText(message),
      code: typeof root?.code === "string" ? root.code : "",
    },
    stack: truncateText(typeof root?.stack === "string" ? root.stack : ""),
  };
};

export const safeLogApiError = (
  record: ApiErrorRecord,
  sink: ApiLogConsole = console,
): void => {
  try {
    if (typeof sink.groupCollapsed === "function") {
      sink.groupCollapsed(
        `[API Error] ${record.method} ${record.endpoint} (${record.requestId})`,
      );
      sink.error(record);
      sink.groupEnd?.();
      return;
    }
    sink.error("[API Error]", record);
  } catch {
    try {
      sink.error("[API Error logging failed]", {
        requestId: record.requestId,
        method: record.method,
        endpoint: record.endpoint,
        message: record.error.message,
      });
    } catch {
      // Console diagnostics must never affect request control flow.
    }
  }
};
