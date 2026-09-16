import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

const updateUrl = "https://taimesut.github.io/OPS-FTE/ops-fte.user.js";

test("userscript metadata includes a stable Violentmonkey update endpoint", async () => {
  const source = await readSource("../vite.userscript.config.ts");

  assert.match(source, /OPS_FTE_USERSCRIPT_VERSION/);
  assert.match(source, /OPS_FTE_USERSCRIPT_UPDATE_URL/);
  assert.match(source, /@updateURL\s+\$\{userscriptUpdateUrl\}/);
  assert.match(source, /@downloadURL\s+\$\{userscriptUpdateUrl\}/);
  assert.ok(source.includes(updateUrl));
});

test("userscript can call and confirm the Google Apps Script incident webhook", async () => {
  const metadata = await readSource("../vite.userscript.config.ts");
  const submitSource = await readSource(
    "../src/features/incident-report/incidentReportSubmit.ts",
  );

  assert.match(metadata, /@grant\s+GM_xmlhttpRequest/);
  assert.match(metadata, /@connect\s+script\.google\.com/);
  assert.match(metadata, /@connect\s+script\.googleusercontent\.com/);
  assert.match(submitSource, /GM_xmlhttpRequest/);
  assert.match(submitSource, /parseSubmitResult/);
  assert.match(submitSource, /response\.responseText/);
});

test("userscript release workflow builds, verifies and deploys the userscript", async () => {
  const workflow = await readSource("../.github/workflows/userscript-release.yml");

  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /npm run test:userscript/);
  assert.match(workflow, /npm run build:userscript/);
  assert.match(workflow, /0\.4\.\$\{GITHUB_RUN_NUMBER\}/);
  assert.ok(workflow.includes(updateUrl));
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
