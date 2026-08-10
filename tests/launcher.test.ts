import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const targetUrl =
  "https://script.google.com/a/macros/spxexpress.com/s/AKfycbxpxCw-YlSW0G60Yzr7QgWv2HxVNzkTxXyn9WWObnBRg0312loguB2d1Spqgvnx_wt3/exec";

test("launcher waits for a click before opening Apps Script", async () => {
  const html = await readFile(new URL("../launcher.html", import.meta.url), "utf8");

  assert.ok(html.includes(`href="${targetUrl}"`));
  assert.match(html, />\s*Mở ứng dụng\s*</);
  assert.doesNotMatch(html, /http-equiv=["']refresh["']/i);
  assert.doesNotMatch(html, /location\.(?:href|replace|assign)/i);
  assert.doesNotMatch(html, /setTimeout|setInterval/i);
  assert.doesNotMatch(html, /<script\b/i);
});

test("launcher manifest installs OPS FTE at the launcher page", async () => {
  const manifestText = await readFile(
    new URL("../public/launcher-manifest.json", import.meta.url),
    "utf8",
  );
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, "OPS FTE");
  assert.equal(manifest.short_name, "OPS FTE");
  assert.equal(manifest.start_url, "./launcher.html");
  assert.equal(manifest.display, "standalone");
  assert.ok(
    manifest.icons.some((icon: { sizes?: string }) => icon.sizes === "192x192"),
  );
  assert.ok(
    manifest.icons.some((icon: { sizes?: string }) => icon.sizes === "512x512"),
  );
});
