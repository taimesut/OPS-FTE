import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("Firefox build injects OPS FTE on SPX and grants webhook hosts", async () => {
  const source = await readSource("../vite.firefox.config.ts");

  assert.match(source, /manifest_version:\s*3/);
  assert.match(source, /ops-fte@taimesut/);
  assert.match(source, /strict_min_version:\s*"140\.0"/);
  assert.match(source, /data_collection_permissions/);
  assert.match(source, /websiteContent/);
  assert.match(source, /personallyIdentifyingInfo/);
  assert.match(source, /gecko_android/);
  assert.match(source, /strict_min_version:\s*"142\.0"/);
  assert.match(source, /https:\/\/spx\.shopee\.vn\/\*/);
  assert.match(source, /https:\/\/\*\.spx\.shopee\.vn\/\*/);
  assert.match(source, /https:\/\/script\.google\.com\/\*/);
  assert.match(source, /https:\/\/script\.googleusercontent\.com\/\*/);
  assert.match(source, /js:\s*\["content\.js"\]/);
  assert.match(source, /scripts:\s*\["background\.js"\]/);
  assert.match(source, /entry:\s*"src\/userscript\.tsx"/);
});

test("Firefox background performs the cross-origin Apps Script POST", async () => {
  const source = await readSource("../firefox/background.js");

  assert.match(source, /ops-fte:webhook-post/);
  assert.match(source, /browser\.runtime\.onMessage/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /redirect:\s*"follow"/);
  assert.match(source, /AbortController/);
});

test("incident submit uses the Firefox background bridge when available", async () => {
  const source = await readSource(
    "../src/features/incident-report/incidentReportSubmit.ts",
  );

  assert.match(source, /getFirefoxRuntime/);
  assert.match(source, /submitThroughFirefoxExtension/);
  assert.match(source, /ops-fte:webhook-post/);
  assert.match(source, /browser\.runtime/);
});

test("package exposes Firefox build and test commands", async () => {
  const packageJson = JSON.parse(await readSource("../package.json")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts?.["build:firefox"],
    "node node_modules/typescript/lib/tsc.js -b && vite build --config vite.firefox.config.ts",
  );
  assert.equal(
    packageJson.scripts?.["test:firefox"],
    "node --experimental-strip-types --test tests/firefoxExtension.test.ts",
  );
});
