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
