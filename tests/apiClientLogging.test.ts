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
