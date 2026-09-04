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
  assert.doesNotMatch(text, /"secret"|"hidden"/);
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
