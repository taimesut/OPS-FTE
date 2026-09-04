import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("apiClient attaches one request trace to direct requests", async () => {
  const source = await readFile(
    new URL("../src/utils/apiClient.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /createApiRequestTrace/);
  assert.match(source, /config\.apiTrace\s*\?\?=/);
  assert.match(source, /withCredentials:\s*true/);
  assert.doesNotMatch(source, /fetchShopeeApi/);
  assert.doesNotMatch(source, /x-shopee-cookie/);
  assert.doesNotMatch(source, /getCookies/);
  assert.doesNotMatch(source, /getProxyUrl/);
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
  assert.match(source, /Phiên đăng nhập SPX/);
  assert.doesNotMatch(source, /\[GAS Adapter Response Error\]/);
  assert.doesNotMatch(source, /\[API Response Error Object\]/);
});

test("apiClient keeps relative request URLs for SPX and local proxy runtimes", async () => {
  const source = await readFile(
    new URL("../src/utils/apiClient.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /https:\/\/spx\.shopee\.vn/);
  assert.doesNotMatch(source, /targetBase/);
  assert.match(source, /const errorConfig\s*=\s*error\?\.config/);
});
