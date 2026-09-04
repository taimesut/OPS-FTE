# API Error Logging and GAS Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add credential-safe, correlated Console logs for every failed shared API call and a deterministic `npm run bundle:gas` command that combines all `gas/**/*.gs` sources into `gas-dist/code.gs`.

**Architecture:** A pure frontend utility creates request traces, sanitizes bounded diagnostic values, normalizes Axios-like errors, and safely writes Console groups. The shared Axios client attaches the trace and passes its request ID to a GAS-native logger in `fetchShopeeApi`; a separate Node ESM CLI recursively assembles `.gs` sources into an ignored deployment artifact.

**Tech Stack:** TypeScript 6, Axios 1, React/Vite, Google Apps Script V8, Node.js ESM and Node test runner.

## Global Constraints

- Log detailed errors only to browser Console and Apps Script Execution logs; add no log UI.
- Never log Cookie, authorization, token, API-key, full headers, or other listed credential values.
- Use one request ID in frontend and GAS logs for the same proxied request.
- Log before applying `suppressErrorToast`; suppression affects only the toast.
- Preserve the existing toast copy and API resolved/rejected behavior.
- Bound each large text/serialized diagnostic value to 4,000 characters and append `[TRUNCATED]` within that limit.
- Logging must be fail-safe and must never replace or swallow the original API outcome.
- `bundle:gas` bundles only `gas/**/*.gs` into `gas-dist/code.gs`; it does not build frontend assets, modify `gas/index.html`, modify source `.gs` files, or deploy.
- Add `gas-dist/` to `.gitignore` and do not commit generated bundle content.
- Preserve and do not stage, edit, or revert the unrelated user changes in `src/layouts/MobileLayout.tsx` and `src/pages/HomePage.tsx`.

---

## File Structure

- Create `src/utils/apiErrorLog.ts`: frontend trace creation, recursive redaction, size bounding, error normalization, and safe Console output.
- Modify `src/utils/apiClient.ts`: attach metadata, propagate request ID to GAS, centralize rejection logging before toast suppression, and retain toast behavior.
- Modify `gas/code.gs`: add GAS-native redaction/log helpers and instrument `fetchShopeeApi` failures.
- Create `bundle-gas.mjs`: recursive deterministic bundler plus CLI entry point.
- Create `tests/apiErrorLog.test.ts`, `tests/apiClientLogging.test.ts`, `tests/apiErrorLoggingGas.test.ts`, and `tests/gasBundler.test.ts`.
- Modify `package.json`: register tests and add `bundle:gas`.
- Modify `.gitignore`: ignore `gas-dist/`.

---

### Task 1: Pure Frontend API Error Logger

**Files:**
- Create: `src/utils/apiErrorLog.ts`
- Create: `tests/apiErrorLog.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: request endpoint/timing data, Axios-like unknown errors, optional current time, and a Console-like sink.
- Produces: `ApiRequestTrace`, `ApiErrorRecord`, `createApiRequestTrace(endpoint, nowMs?, requestId?)`, `sanitizeApiLogValue(value)`, `createApiErrorRecord(error, nowMs?)`, and `safeLogApiError(record, sink?)`.
- Used by: `src/utils/apiClient.ts` in Task 2.

- [ ] **Step 1: Write failing redaction, truncation, normalization, and fail-safe tests**

Create `tests/apiErrorLog.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiErrorRecord,
  createApiRequestTrace,
  safeLogApiError,
  sanitizeApiLogValue,
} from "../src/utils/apiErrorLog.ts";

test("redacts credential keys recursively and handles circular values", () => {
  const input: Record<string, unknown> = {
    Cookie: "cookie-secret",
    nested: {
      authorization: "bearer-secret",
      access_token: "access-secret",
      safe: "visible",
    },
    list: [{ "x-shopee-cookie": "nested-cookie" }],
  };
  input.self = input;
  const sanitized = sanitizeApiLogValue(input) as Record<string, unknown>;
  const text = JSON.stringify(sanitized);
  assert.doesNotMatch(text, /cookie-secret|bearer-secret|access-secret|nested-cookie/);
  assert.match(text, /\[REDACTED\]/);
  assert.match(text, /\[Circular\]/);
  assert.match(text, /visible/);
});

test("parses JSON bodies before redaction and bounds large text", () => {
  const sanitized = sanitizeApiLogValue(
    JSON.stringify({ token: "secret-token", body: "x".repeat(5_000) }),
  );
  const text = JSON.stringify(sanitized);
  assert.doesNotMatch(text, /secret-token/);
  assert.match(text, /\[TRUNCATED\]/);
  assert.ok(text.length <= 4_100);
});

test("creates a correlated normalized frontend error record", () => {
  const trace = createApiRequestTrace("/api/orders", 1_000, "req-123");
  const error = Object.assign(new Error("Request failed"), {
    code: "ERR_BAD_RESPONSE",
    config: {
      method: "post",
      url: "https://spx.shopee.vn/api/orders",
      data: { shipment_id: "SPX01", cookie: "secret" },
      apiTrace: trace,
    },
    response: {
      status: 500,
      data: { message: "SPX failed", refresh_token: "hidden" },
    },
  });
  const record = createApiErrorRecord(error, 1_275);
  assert.equal(record.source, "frontend");
  assert.equal(record.requestId, "req-123");
  assert.equal(record.method, "POST");
  assert.equal(record.endpoint, "/api/orders");
  assert.equal(record.status, 500);
  assert.equal(record.durationMs, 275);
  assert.equal(record.error.message, "Request failed");
  assert.match(record.stack, /Request failed/);
  const text = JSON.stringify(record);
  assert.match(text, /SPX01|SPX failed/);
  assert.doesNotMatch(text, /secret|hidden/);
});

test("reads adapter config nested under response and defaults transport fields", () => {
  const record = createApiErrorRecord(
    {
      message: "Adapter failed",
      response: {
        status: 502,
        config: {
          method: "get",
          url: "/api/test",
          apiTrace: createApiRequestTrace("/api/test", 200, "req-adapter"),
        },
      },
    },
    250,
  );
  assert.equal(record.requestId, "req-adapter");
  assert.equal(record.status, 502);
  assert.equal(record.durationMs, 50);
});

test("safe Console output groups when possible, falls back, and never throws", () => {
  const calls: string[] = [];
  const sink = {
    groupCollapsed: () => calls.push("group"),
    error: () => calls.push("error"),
    groupEnd: () => calls.push("end"),
  };
  const record = createApiErrorRecord(new Error("boom"), 100);
  assert.doesNotThrow(() => safeLogApiError(record, sink));
  assert.deepEqual(calls, ["group", "error", "end"]);
  assert.doesNotThrow(() =>
    safeLogApiError(record, {
      groupCollapsed: () => {
        throw new Error("console unavailable");
      },
      error: () => {
        throw new Error("console unavailable");
      },
      groupEnd: () => {},
    }),
  );
});
```

- [ ] **Step 2: Register and run the test to prove it fails**

Append `tests/apiErrorLog.test.ts` to the explicit `test` script in `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/apiErrorLog.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/apiErrorLog.ts`.

- [ ] **Step 3: Implement trace creation, sensitive-key matching, and bounded sanitization**

Create `src/utils/apiErrorLog.ts` with these public types and constants:

```ts
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
```

Implement key normalization, request ID fallback, JSON-body parsing, circular-safe traversal, and total-value bounding:

```ts
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
```

- [ ] **Step 4: Implement structural error normalization and fail-safe Console output**

Append helpers that read only selected structural fields, including the GAS adapter's `response.config` fallback:

```ts
type UnknownRecord = Record<string, unknown>;
const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;

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
```

- [ ] **Step 5: Run focused tests and TypeScript**

```powershell
node --experimental-strip-types --test tests/apiErrorLog.test.ts
node node_modules/typescript/lib/tsc.js -b
```

Expected: five logger tests PASS and TypeScript exits `0`.

- [ ] **Step 6: Commit the pure logger**

```powershell
git add -- src/utils/apiErrorLog.ts tests/apiErrorLog.test.ts package.json
git commit -m "feat: normalize API error diagnostics"
```

---

### Task 2: Axios and GAS Adapter Correlation

**Files:**
- Modify: `src/utils/apiClient.ts:1-168`
- Create: `tests/apiClientLogging.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createApiRequestTrace`, `createApiErrorRecord`, `safeLogApiError`, Axios config, and GAS `google.script.run`.
- Produces: typed `apiTrace` metadata on each request, shared request-ID propagation, one detailed browser error record for all rejection paths, and unchanged toast decisions.
- Used by: all existing API utilities without call-site changes.

- [ ] **Step 1: Write failing source contract tests**

Create `tests/apiClientLogging.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("apiClient attaches and propagates one request trace", async () => {
  const source = await readFile(
    new URL("../src/utils/apiClient.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /createApiRequestTrace/);
  assert.match(source, /config\.apiTrace\s*\?\?=/);
  assert.match(source, /config\.apiTrace\?\.requestId/);
  assert.match(
    source,
    /fetchShopeeApi\([\s\S]*config\.apiTrace\?\.requestId[\s\S]*\)/,
  );
});

test("apiClient logs before toast suppression and preserves toast branches", async () => {
  const source = await readFile(
    new URL("../src/utils/apiClient.ts", import.meta.url),
    "utf8",
  );
  const logIndex = source.indexOf("safeLogApiError(createApiErrorRecord(error))");
  const suppressIndex = source.indexOf("if (errorConfig?.suppressErrorToast)");
  assert.ok(logIndex >= 0);
  assert.ok(suppressIndex > logIndex);
  assert.match(source, /case 401:/);
  assert.match(source, /case 403:/);
  assert.match(source, /case 404:/);
  assert.match(source, /case 500:/);
  assert.doesNotMatch(source, /\[GAS Adapter Response Error\]/);
  assert.doesNotMatch(source, /\[API Response Error Object\]/);
});

test("adapter rejections expose config at the top level", async () => {
  const source = await readFile(
    new URL("../src/utils/apiClient.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /reject\(\{[\s\S]*config,[\s\S]*response:/);
  assert.match(source, /const errorConfig\s*=\s*error\?\.config/);
});
```

- [ ] **Step 2: Register and run the source contract test**

Append `tests/apiClientLogging.test.ts` to `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/apiClientLogging.test.ts
```

Expected: FAIL because the current client has no trace metadata and logs before suppression are not centralized.

- [ ] **Step 3: Add typed metadata and pass request ID to GAS**

Import the Task 1 utility in `src/utils/apiClient.ts`:

```ts
import {
  createApiErrorRecord,
  createApiRequestTrace,
  safeLogApiError,
  type ApiRequestTrace,
} from "./apiErrorLog";
```

Extend the existing Axios declaration:

```ts
declare module "axios" {
  interface AxiosRequestConfig {
    suppressErrorToast?: boolean;
    apiTrace?: ApiRequestTrace;
  }
}
```

At the beginning of the fulfilled request interceptor, before URL rewriting, attach the trace once:

```ts
config.apiTrace ??= createApiRequestTrace(config.url || "unknown");
```

Change the GAS invocation to pass the same request ID as the optional fifth argument:

```ts
.fetchShopeeApi(
  endpoint,
  cookies,
  config.method || "get",
  config.data,
  config.apiTrace?.requestId,
);
```

- [ ] **Step 4: Normalize GAS adapter rejections for the shared interceptor**

Remove direct GAS request/success/error Console calls whose raw values bypass sanitization. Preserve successful resolution. For a non-success GAS response, reject with selected fields and top-level config:

```ts
reject({
  name: "GasProxyError",
  message: errMsg,
  config,
  response: {
    data: res ? res.data ?? { error: res.error } : null,
    status: res ? res.status : 500,
    statusText: errMsg,
    headers: {},
    config,
  },
});
```

For `.withFailureHandler`, reject:

```ts
reject({
  name: "GasExecutionError",
  message: errMsg,
  stack: typeof err?.stack === "string" ? err.stack : "",
  config,
});
```

- [ ] **Step 5: Log once before evaluating toast suppression**

Replace the response rejection prologue with:

```ts
(error) => {
  safeLogApiError(createApiErrorRecord(error));
  const errorConfig = error?.config ?? error?.response?.config;
  if (errorConfig?.suppressErrorToast) {
    return Promise.reject(error);
  }
```

Keep the existing `if (error.response)`, status switch, network/setup toast branches, and final `Promise.reject(error)` below this prologue. Remove the raw `console.error` calls that print complete unsanitized error/response objects.

- [ ] **Step 6: Run focused logger/client tests, lint, and build**

```powershell
node --experimental-strip-types --test tests/apiErrorLog.test.ts tests/apiClientLogging.test.ts
npm run lint
npm run build
```

Expected: all focused tests PASS, lint exits `0`, and production build exits `0`.

- [ ] **Step 7: Commit the shared client integration**

```powershell
git add -- src/utils/apiClient.ts tests/apiClientLogging.test.ts package.json
git commit -m "feat: correlate frontend API error logs"
```

---

### Task 3: Credential-Safe GAS Proxy Error Logs

**Files:**
- Modify: `gas/code.gs:301-354`
- Create: `tests/apiErrorLoggingGas.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: endpoint, Cookie, method, body data, optional shared request ID, access result, SPX response, and thrown fetch errors.
- Produces: `sanitizeGasApiLogValue_`, `createGasApiErrorRecord_`, `safeLogGasApiError_`, and instrumented `fetchShopeeApi(endpoint, cookie, method, bodyData, requestId)`.
- Preserves: existing `{status, data}` and `{status, error}` return shapes and all unrelated GAS functions.

- [ ] **Step 1: Write a dedicated GAS VM harness and failing error-log tests**

Create `tests/apiErrorLoggingGas.test.ts`. The harness reads `gas/code.gs`, supplies an authorized email/sheet, captures `console.error`, and accepts either a response fixture or thrown fetch error:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type HarnessOptions = {
  responseCode?: number;
  responseBody?: string;
  fetchError?: Error;
};

async function createHarness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../gas/code.gs", import.meta.url), "utf8");
  const logs: string[] = [];
  const context = vm.createContext({
    Session: { getActiveUser: () => ({ getEmail: () => "user@spxexpress.com" }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) =>
          name === "account"
            ? {
                getLastRow: () => 2,
                getRange: () => ({
                  getDisplayValues: () => [["user@spxexpress.com"]],
                }),
              }
            : null,
      }),
    },
    UrlFetchApp: {
      fetch: () => {
        if (options.fetchError) throw options.fetchError;
        return {
          getResponseCode: () => options.responseCode ?? 500,
          getContentText: () =>
            options.responseBody ??
            JSON.stringify({ message: "failed", refresh_token: "response-secret" }),
        };
      },
    },
    console: { error: (value: unknown) => logs.push(String(value)) },
    JSON,
    Date,
    Math,
  });
  vm.runInContext(source, context);
  return { context, logs };
}

test("logs non-2xx SPX responses with correlation and no credentials", async () => {
  const { context, logs } = await createHarness();
  const result = context.fetchShopeeApi(
    "/api/test",
    "COOKIE_SECRET",
    "post",
    { shipment_id: "SPX01", authorization: "TOKEN_SECRET" },
    "req-123",
  );
  assert.equal(result.status, 500);
  assert.equal(logs.length, 1);
  const text = logs[0];
  assert.match(text, /req-123|POST|\/api\/test|SPX01|500/);
  assert.match(text, /\[REDACTED\]/);
  assert.doesNotMatch(text, /COOKIE_SECRET|TOKEN_SECRET|response-secret/);
});

test("logs thrown UrlFetchApp errors and preserves the 500 return", async () => {
  const { context, logs } = await createHarness({
    fetchError: new Error("network exploded"),
  });
  const result = context.fetchShopeeApi(
    "/api/test",
    "COOKIE_SECRET",
    "get",
    null,
    "req-throw",
  );
  assert.equal(result.status, 500);
  assert.match(result.error, /network exploded/);
  assert.match(logs[0], /req-throw|network exploded/);
  assert.doesNotMatch(logs[0], /COOKIE_SECRET/);
});

test("bounds large GAS response logs", async () => {
  const { context, logs } = await createHarness({
    responseBody: JSON.stringify({ message: "x".repeat(8_000) }),
  });
  context.fetchShopeeApi("/api/test", "secret", "get", null, "req-large");
  assert.match(logs[0], /\[TRUNCATED\]/);
  assert.ok(logs[0].length < 6_000);
});
```

- [ ] **Step 2: Register and run the GAS log tests to confirm failure**

Append `tests/apiErrorLoggingGas.test.ts` to `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/apiErrorLoggingGas.test.ts
```

Expected: FAIL because `fetchShopeeApi` does not accept/record request IDs and does not log non-2xx responses.

- [ ] **Step 3: Add GAS-native redaction, body parsing, and truncation helpers**

Add above `fetchShopeeApi` in `gas/code.gs`:

```js
var API_ERROR_LOG_TEXT_LIMIT_ = 4000;
var API_ERROR_LOG_REDACTED_ = "[REDACTED]";
var API_ERROR_LOG_TRUNCATED_ = "[TRUNCATED]";

function normalizeApiLogKey_(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveApiLogKey_(key) {
  return [
    "cookie", "setcookie", "authorization", "proxyauthorization",
    "token", "accesstoken", "refreshtoken", "xshopeecookie", "apikey"
  ].indexOf(normalizeApiLogKey_(key)) !== -1;
}

function truncateApiLogText_(value) {
  var text = String(value == null ? "" : value);
  if (text.length <= API_ERROR_LOG_TEXT_LIMIT_) return text;
  return text.slice(
    0,
    API_ERROR_LOG_TEXT_LIMIT_ - API_ERROR_LOG_TRUNCATED_.length
  ) + API_ERROR_LOG_TRUNCATED_;
}

function parseGasApiLogBody_(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function sanitizeGasApiLogNested_(value, ancestors, depth) {
  if (typeof value === "string") return truncateApiLogText_(value);
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object") return "[" + typeof value + "]";
  if (ancestors.indexOf(value) !== -1) return "[Circular]";
  if (depth >= 8) return "[MaxDepth]";
  var nextAncestors = ancestors.concat([value]);
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return sanitizeGasApiLogNested_(item, nextAncestors, depth + 1);
    });
  }
  var result = {};
  Object.keys(value).forEach(function (key) {
    result[key] = isSensitiveApiLogKey_(key)
      ? API_ERROR_LOG_REDACTED_
      : sanitizeGasApiLogNested_(value[key], nextAncestors, depth + 1);
  });
  return result;
}

function sanitizeGasApiLogValue_(value) {
  try {
    var sanitized = sanitizeGasApiLogNested_(
      parseGasApiLogBody_(value),
      [],
      0
    );
    var serialized = JSON.stringify(sanitized);
    if (!serialized || serialized.length <= API_ERROR_LOG_TEXT_LIMIT_) {
      return sanitized;
    }
    return { truncated: true, preview: truncateApiLogText_(serialized) };
  } catch (error) {
    return "[Unserializable]";
  }
}
```

- [ ] **Step 4: Add record creation and fail-safe one-line GAS logging**

Add:

```js
function createGasApiErrorRecord_(details) {
  var now = Date.now();
  var error = details.error;
  return {
    source: "gas",
    timestamp: new Date(now).toISOString(),
    requestId: String(details.requestId || "gas-untracked"),
    method: String(details.method || "get").toUpperCase(),
    endpoint: String(details.endpoint || "unknown"),
    status: typeof details.status === "number" ? details.status : null,
    durationMs: Math.max(0, now - Number(details.startedAtMs || now)),
    payload: sanitizeGasApiLogValue_(details.payload),
    response: sanitizeGasApiLogValue_(details.response),
    error: {
      name: error && error.name ? String(error.name) : "ApiError",
      message: truncateApiLogText_(
        error && error.message ? error.message : details.message || "SPX API error"
      )
    },
    stack: truncateApiLogText_(error && error.stack ? error.stack : "")
  };
}

function safeLogGasApiError_(details) {
  try {
    console.error(JSON.stringify(createGasApiErrorRecord_(details)));
  } catch (error) {
    try {
      console.error(JSON.stringify({
        source: "gas",
        requestId: String(details.requestId || "gas-untracked"),
        method: String(details.method || "get").toUpperCase(),
        endpoint: String(details.endpoint || "unknown"),
        error: "API error logging failed"
      }));
    } catch (ignored) {
      // Logging must not change proxy behavior.
    }
  }
}
```

- [ ] **Step 5: Instrument access denial, non-2xx response, and thrown fetch errors**

Change the signature and establish timing before the access check:

```js
function fetchShopeeApi(endpoint, cookie, method, bodyData, requestId) {
  var startedAtMs = Date.now();
  var httpMethod = (method || "get").toLowerCase();
  var access = getCurrentUserAccess_();
```

Before returning an access-denied response, call `safeLogGasApiError_` with status `403`, no Cookie, and message `Access denied`. Remove the later duplicate `httpMethod` declaration.

After parsing the SPX response and before returning, log only non-success status codes:

```js
if (responseCode < 200 || responseCode >= 300) {
  safeLogGasApiError_({
    requestId: requestId,
    method: httpMethod,
    endpoint: endpoint,
    status: responseCode,
    startedAtMs: startedAtMs,
    payload: bodyData,
    response: parsedData,
    message: "SPX returned HTTP " + responseCode
  });
}
```

In the catch block, log the exception before returning the existing status/error shape:

```js
safeLogGasApiError_({
  requestId: requestId,
  method: httpMethod,
  endpoint: endpoint,
  status: null,
  startedAtMs: startedAtMs,
  payload: bodyData,
  response: null,
  error: err
});
```

Never pass `cookie` or `options.headers` to a logging helper.

- [ ] **Step 6: Run GAS diagnostics and regression tests**

```powershell
node --experimental-strip-types --test tests/apiErrorLoggingGas.test.ts tests/gasAccessControl.test.ts tests/stationCatalogGas.test.ts tests/appVersionGas.test.ts
```

Expected: all three new GAS diagnostic tests PASS; station/version tests PASS; only the same two pre-existing access-control assertions may fail because `allowed: true` remains intentionally present.

- [ ] **Step 7: Commit GAS logging**

```powershell
git add -- gas/code.gs tests/apiErrorLoggingGas.test.ts package.json
git commit -m "feat: log detailed GAS proxy failures"
```

---

### Task 4: Deterministic Recursive GAS Bundler

**Files:**
- Create: `bundle-gas.mjs`
- Create: `tests/gasBundler.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Generate but do not stage: `gas-dist/code.gs`

**Interfaces:**
- Consumes: a source directory tree and output file path.
- Produces: `collectGasSourceFiles(sourceDir)`, `assembleGasBundle(sourceDir, sourceFiles)`, `bundleGas({sourceDir, outputFile})`, and CLI execution through `npm run bundle:gas`.
- Preserves: every source file, `gas/index.html`, and frontend build artifacts.

- [ ] **Step 1: Write failing recursive ordering and repeatability tests**

Create `tests/gasBundler.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assembleGasBundle,
  bundleGas,
  collectGasSourceFiles,
} from "../bundle-gas.mjs";

test("recursively discovers and deterministically orders only gs files", async () => {
  const root = await mkdtemp(join(tmpdir(), "fte-gas-bundle-"));
  const sourceDir = join(root, "gas");
  await mkdir(join(sourceDir, "nested"), { recursive: true });
  await writeFile(join(sourceDir, "z.gs"), "function z() {}\r\n", "utf8");
  await writeFile(join(sourceDir, "a.gs"), "\uFEFFfunction a() {}\r", "utf8");
  await writeFile(join(sourceDir, "nested", "b.GS"), "function b() {}\n", "utf8");
  await writeFile(join(sourceDir, "ignore.txt"), "ignored", "utf8");
  const files = await collectGasSourceFiles(sourceDir);
  assert.deepEqual(
    files.map((path) => path.replaceAll("\\", "/").slice(sourceDir.length + 1)),
    ["a.gs", "nested/b.GS", "z.gs"],
  );
  const bundle = await assembleGasBundle(sourceDir, files);
  assert.equal(
    bundle,
    [
      "// ===== SOURCE: gas/a.gs =====",
      "function a() {}",
      "",
      "// ===== SOURCE: gas/nested/b.GS =====",
      "function b() {}",
      "",
      "// ===== SOURCE: gas/z.gs =====",
      "function z() {}",
      "",
    ].join("\n"),
  );
});

test("writes byte-identical output on repeated runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "fte-gas-repeat-"));
  const sourceDir = join(root, "gas");
  const outputFile = join(root, "gas-dist", "code.gs");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "code.gs"), "function doGet() {}\n", "utf8");
  const first = await bundleGas({ sourceDir, outputFile });
  const firstBytes = await readFile(outputFile);
  const second = await bundleGas({ sourceDir, outputFile });
  const secondBytes = await readFile(outputFile);
  assert.equal(first.sourceCount, 1);
  assert.equal(second.sourceCount, 1);
  assert.deepEqual(secondBytes, firstBytes);
});

test("rejects an empty GAS source tree without replacing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "fte-gas-empty-"));
  const sourceDir = join(root, "gas");
  const outputFile = join(root, "gas-dist", "code.gs");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(join(root, "gas-dist"), { recursive: true });
  await writeFile(outputFile, "previous bundle", "utf8");
  await assert.rejects(bundleGas({ sourceDir, outputFile }), /không tìm thấy.*\.gs/i);
  assert.equal(await readFile(outputFile, "utf8"), "previous bundle");
});
```

- [ ] **Step 2: Register the test and add the npm command**

Append `tests/gasBundler.test.ts` to the test script and add:

```json
"bundle:gas": "node bundle-gas.mjs"
```

Run:

```powershell
node --experimental-strip-types --test tests/gasBundler.test.ts
```

Expected: FAIL because `bundle-gas.mjs` does not exist.

- [ ] **Step 3: Implement deterministic discovery and assembly**

Create `bundle-gas.mjs` with these imports and pure functions:

```js
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = dirname(scriptPath);
const normalizePath = (value) => value.replaceAll("\\", "/");
const ordinalCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

export async function collectGasSourceFiles(sourceDir) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".gs")) {
        files.push(fullPath);
      }
    }
  }
  await visit(sourceDir);
  return files.sort((left, right) =>
    ordinalCompare(
      normalizePath(relative(sourceDir, left)),
      normalizePath(relative(sourceDir, right)),
    ),
  );
}

const normalizeSource = (source) =>
  source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/u, "");

export async function assembleGasBundle(sourceDir, sourceFiles) {
  const sections = [];
  for (const sourceFile of sourceFiles) {
    const relativePath = normalizePath(relative(sourceDir, sourceFile));
    const source = normalizeSource(await readFile(sourceFile, "utf8"));
    sections.push(`// ===== SOURCE: gas/${relativePath} =====\n${source}`);
  }
  return `${sections.join("\n\n")}\n`;
}
```

- [ ] **Step 4: Implement atomic output and CLI reporting**

Append:

```js
export async function bundleGas({ sourceDir, outputFile }) {
  const sourceFiles = await collectGasSourceFiles(sourceDir);
  if (sourceFiles.length === 0) {
    throw new Error(`Không tìm thấy file .gs trong ${sourceDir}`);
  }
  const content = await assembleGasBundle(sourceDir, sourceFiles);
  await mkdir(dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryFile, content, "utf8");
    try {
      await rename(temporaryFile, outputFile);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "EEXIST" || error.code === "EPERM")
      ) {
        await rm(outputFile, { force: true });
        await rename(temporaryFile, outputFile);
      } else {
        throw error;
      }
    }
  } finally {
    await rm(temporaryFile, { force: true });
  }
  return {
    sourceCount: sourceFiles.length,
    sourceFiles,
    outputFile,
    byteSize: Buffer.byteLength(content, "utf8"),
  };
}

async function runCli() {
  const sourceDir = resolve(repositoryRoot, "gas");
  const outputFile = resolve(repositoryRoot, "gas-dist", "code.gs");
  const result = await bundleGas({ sourceDir, outputFile });
  console.log("GAS sources:");
  result.sourceFiles.forEach((file) =>
    console.log(`- ${normalizePath(relative(repositoryRoot, file))}`),
  );
  console.log(
    `Bundled ${result.sourceCount} file(s) -> ${normalizePath(relative(repositoryRoot, result.outputFile))} (${result.byteSize} bytes)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runCli().catch((error) => {
    console.error(
      `[bundle:gas] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
```

The inner `rename` catch handles Windows replacement errors only; all other errors propagate. The temporary-file cleanup remains in `finally`.

- [ ] **Step 5: Ignore generated output and run bundler tests**

Append to `.gitignore`:

```gitignore

# Generated Apps Script bundle
gas-dist/
```

Run:

```powershell
node --experimental-strip-types --test tests/gasBundler.test.ts
npm run bundle:gas
npm run bundle:gas
```

Expected: three bundler tests PASS; both real runs report one source (`gas/code.gs`) and write byte-identical ignored `gas-dist/code.gs`.

- [ ] **Step 6: Verify real bundle markers and source immutability**

```powershell
rg -n "SOURCE: gas/code.gs|function fetchShopeeApi|function doGet|function getStationCatalog" gas-dist/code.gs
git diff -- gas/code.gs gas/index.html
git status --short --ignored
```

Expected: all markers are present; bundling introduces no diff to `gas/code.gs` or `gas/index.html`; `gas-dist/` appears only as ignored output.

- [ ] **Step 7: Commit the bundler, excluding generated output**

```powershell
git add -- bundle-gas.mjs tests/gasBundler.test.ts package.json .gitignore
git commit -m "feat: bundle Apps Script sources"
```

---

### Task 5: Full Regression and Security Review

**Files:**
- Verify all Task 1–4 source/test files.
- Modify only a Task 1–4 file when a failure is directly caused by this feature.

**Interfaces:**
- Consumes: frontend/GAS logging and bundler outputs.
- Produces: evidence that diagnostics are safe, API behavior is preserved, and bundling is deterministic.

- [ ] **Step 1: Run all new tests together**

```powershell
node --experimental-strip-types --test tests/apiErrorLog.test.ts tests/apiClientLogging.test.ts tests/apiErrorLoggingGas.test.ts tests/gasBundler.test.ts
```

Expected: every new test PASS.

- [ ] **Step 2: Run the full test suite**

```powershell
npm test
```

Expected: every feature-related test PASS. Only the two known baseline failures in `tests/gasAccessControl.test.ts` caused by the intentional `allowed: true` override are permitted; record exact pass/fail totals.

- [ ] **Step 3: Run lint and the frontend production build**

```powershell
npm run lint
npm run build
```

Expected: both commands exit `0`. Do not copy `dist/index.html` into `gas/index.html`.

- [ ] **Step 4: Rebuild GAS twice and compare hashes**

```powershell
npm run bundle:gas
$firstHash = (Get-FileHash -LiteralPath 'gas-dist\code.gs' -Algorithm SHA256).Hash
npm run bundle:gas
$secondHash = (Get-FileHash -LiteralPath 'gas-dist\code.gs' -Algorithm SHA256).Hash
if ($firstHash -ne $secondHash) { throw 'GAS bundle is not deterministic.' }
$firstHash
```

Expected: both hashes are identical and the command prints the SHA-256 value.

- [ ] **Step 5: Audit generated and source content for leaked test credentials**

```powershell
rg -n "COOKIE_SECRET|TOKEN_SECRET|response-secret|secret-token" src gas gas-dist --glob "*.ts" --glob "*.gs"
```

Expected: no production or generated file contains test credential literals. Test fixtures may contain them only under `tests/`.

- [ ] **Step 6: Inspect final diffs and worktree scope**

```powershell
git diff --check
git status --short --ignored
git log --oneline -8
```

Expected: no whitespace errors; `gas-dist/` is ignored; no `dist` or generated GAS content is staged; only the two pre-existing user files remain modified outside committed feature work.

- [ ] **Step 7: Commit a direct regression correction only when needed**

If verification required a feature-scoped correction, stage only the exact affected feature files and commit:

```powershell
git add -- src/utils/apiErrorLog.ts src/utils/apiClient.ts gas/code.gs bundle-gas.mjs tests/apiErrorLog.test.ts tests/apiClientLogging.test.ts tests/apiErrorLoggingGas.test.ts tests/gasBundler.test.ts package.json .gitignore
git commit -m "fix: stabilize API diagnostics and GAS bundle"
```

If verification requires no correction, do not create an empty commit.
