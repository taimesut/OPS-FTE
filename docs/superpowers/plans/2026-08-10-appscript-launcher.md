# Apps Script Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first static launcher that waits indefinitely and opens the supplied Apps Script web app only after the user presses `Mở ứng dụng`.

**Architecture:** Add an independent Vite HTML entry so the existing React application remains unchanged. The launcher uses one self-contained HTML document for markup and styling, a dedicated web manifest backed by the project's existing icons, and a separate build output suitable for uploading to the current redirect website.

**Tech Stack:** HTML5, CSS, Web App Manifest, Vite 8, Node.js built-in test runner

## Global Constraints

- Target URL: `https://script.google.com/a/macros/spxexpress.com/s/AKfycbxpxCw-YlSW0G60Yzr7QgWv2HxVNzkTxXyn9WWObnBRg0312loguB2d1Spqgvnx_wt3/exec`.
- The launcher must never navigate automatically or use a countdown.
- Navigation must happen in the same window through a normal anchor link.
- The visible product name and installed shortcut name must be `OPS FTE`.
- The main action label must be `Mở ứng dụng`.
- The page must remain usable without JavaScript.
- Reuse the existing PNG application icons in `public/icons/`.

---

### Task 1: Launcher contract test

**Files:**
- Create: `tests/launcher.test.ts`

**Interfaces:**
- Consumes: `launcher.html`, `public/launcher-manifest.json`, and the exact target URL from Global Constraints.
- Produces: A static contract test that protects manual-only navigation, install metadata, and Vietnamese launcher copy.

- [ ] **Step 1: Write the failing source contract test**

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const targetUrl =
  "https://script.google.com/a/macros/spxexpress.com/s/AKfycbxpxCw-YlSW0G60Yzr7QgWv2HxVNzkTxXyn9WWObnBRg0312loguB2d1Spqgvnx_wt3/exec";

test("launcher waits for a click before opening Apps Script", async () => {
  const html = await readFile(new URL("../launcher.html", import.meta.url), "utf8");

  assert.match(html, new RegExp(`href=["']${targetUrl}["']`));
  assert.match(html, />\s*Mở ứng dụng\s*</);
  assert.doesNotMatch(html, /http-equiv=["']refresh["']/i);
  assert.doesNotMatch(html, /location\.(?:href|replace|assign)/i);
  assert.doesNotMatch(html, /setTimeout|setInterval/i);
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
  assert.ok(manifest.icons.some((icon: { sizes?: string }) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon: { sizes?: string }) => icon.sizes === "512x512"));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/launcher.test.ts`

Expected: FAIL because `launcher.html` and `public/launcher-manifest.json` do not exist.

- [ ] **Step 3: Commit the failing contract test**

```bash
git add tests/launcher.test.ts
git commit -m "test: define launcher navigation contract"
```

### Task 2: Mobile launcher page and install manifest

**Files:**
- Create: `launcher.html`
- Create: `public/launcher-manifest.json`

**Interfaces:**
- Consumes: Existing icons at `/icons/icon-144.png`, `/icons/icon-152.png`, `/icons/icon-192.png`, and `/icons/icon-512.png`.
- Produces: `launcher.html`, a JavaScript-free mobile page with one target anchor; `launcher-manifest.json`, install metadata whose `start_url` is `./launcher.html`.

- [ ] **Step 1: Create the dedicated launcher manifest**

```json
{
  "name": "OPS FTE",
  "short_name": "OPS FTE",
  "description": "Lối tắt mở ứng dụng OPS FTE",
  "start_url": "./launcher.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#fff7f5",
  "theme_color": "#ee4d2d",
  "lang": "vi",
  "icons": [
    { "src": "icons/icon-144.png", "sizes": "144x144", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-152.png", "sizes": "152x152", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Create the mobile-first launcher document**

Create `launcher.html` with:

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#ee4d2d" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="OPS FTE" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="application-name" content="OPS FTE" />
    <meta name="description" content="Lối tắt mở ứng dụng OPS FTE" />
    <link rel="manifest" href="/launcher-manifest.json" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152.png" />
    <link rel="apple-touch-icon" sizes="144x144" href="/icons/icon-144.png" />
    <title>OPS FTE</title>
    <style>
      :root {
        color: #2b211f;
        background: #fff7f5;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-synthesis: none;
      }

      * { box-sizing: border-box; }

      body {
        min-width: 320px;
        min-height: 100vh;
        min-height: 100svh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
        background:
          radial-gradient(circle at 50% 0%, rgba(238, 77, 45, 0.18), transparent 42%),
          #fff7f5;
      }

      .launcher-card {
        width: min(100%, 420px);
        padding: 36px 24px 28px;
        text-align: center;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(238, 77, 45, 0.14);
        border-radius: 28px;
        box-shadow: 0 24px 60px rgba(78, 30, 20, 0.13);
      }

      .app-icon {
        display: block;
        margin: 0 auto 24px;
        border-radius: 22px;
        box-shadow: 0 12px 28px rgba(238, 77, 45, 0.24);
      }

      .eyebrow {
        margin: 0 0 8px;
        color: #b93720;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.14em;
      }

      h1 {
        margin: 0;
        color: #241916;
        font-size: clamp(2rem, 9vw, 2.75rem);
        line-height: 1.05;
        letter-spacing: -0.04em;
      }

      .instructions {
        margin: 18px auto 26px;
        color: #695652;
        font-size: 1rem;
        line-height: 1.65;
      }

      .launch-button {
        min-height: 58px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px 24px;
        color: #fff;
        background: #d94327;
        border-radius: 16px;
        box-shadow: 0 12px 24px rgba(217, 67, 39, 0.28);
        font-size: 1.05rem;
        font-weight: 800;
        text-decoration: none;
      }

      .launch-button:hover { background: #c93b22; }

      .launch-button:focus-visible {
        outline: 4px solid rgba(217, 67, 39, 0.3);
        outline-offset: 4px;
      }

      .privacy-note {
        margin: 18px 0 0;
        color: #89736e;
        font-size: 0.82rem;
        line-height: 1.5;
      }

      @media (max-width: 360px) {
        .launcher-card { padding-inline: 20px; border-radius: 22px; }
      }

      @media (prefers-reduced-motion: no-preference) {
        .launch-button { transition: background-color 160ms ease, transform 160ms ease; }
        .launch-button:active { transform: translateY(1px); }
      }
    </style>
  </head>
  <body>
    <main class="launcher-card">
      <img class="app-icon" src="/icons/icon-192.png" alt="" width="96" height="96" />
      <p class="eyebrow">LỐI TẮT ỨNG DỤNG</p>
      <h1>OPS FTE</h1>
      <p class="instructions">
        Hãy thêm trang này vào màn hình chính. Khi đã sẵn sàng, nhấn nút bên dưới để mở ứng dụng.
      </p>
      <a class="launch-button" href="https://script.google.com/a/macros/spxexpress.com/s/AKfycbxpxCw-YlSW0G60Yzr7QgWv2HxVNzkTxXyn9WWObnBRg0312loguB2d1Spqgvnx_wt3/exec">
        Mở ứng dụng
      </a>
      <p class="privacy-note">Trang chỉ chuyển hướng sau khi bạn nhấn nút.</p>
    </main>
  </body>
</html>
```

Use the complete inline CSS above. Do not add script tags or navigation JavaScript.

- [ ] **Step 3: Run the launcher contract test and verify it passes**

Run: `node --experimental-strip-types --test tests/launcher.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 4: Inspect the page at a mobile viewport**

Run: `npm run dev -- --host 127.0.0.1`

Open: `http://127.0.0.1:5173/launcher.html` at a 390 × 844 viewport.

Expected: No horizontal scrolling; all copy is readable; the primary button is at least 56px tall; waiting does not navigate away; pressing the button targets the exact Apps Script URL.

- [ ] **Step 5: Commit the launcher UI**

```bash
git add launcher.html public/launcher-manifest.json
git commit -m "feat: add manual Apps Script launcher"
```

### Task 3: Independent launcher build

**Files:**
- Create: `vite.launcher.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `launcher.html` and Vite's existing public directory.
- Produces: `npm run build:launcher`; deployable directory `launcher-dist/` containing `launcher.html`, `launcher-manifest.json`, favicon, and icons.

- [ ] **Step 1: Add a launcher-only Vite configuration**

```ts
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "launcher-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "launcher.html"),
    },
  },
});
```

- [ ] **Step 2: Add the launcher build command**

Add this entry to `package.json` under `scripts`:

```json
"build:launcher": "vite build --config vite.launcher.config.ts"
```

- [ ] **Step 3: Build the launcher output**

Run: `npm run build:launcher`

Expected: PASS and create `launcher-dist/launcher.html`, `launcher-dist/launcher-manifest.json`, and `launcher-dist/icons/icon-192.png`.

- [ ] **Step 4: Run regression checks**

Run: `node --experimental-strip-types --test tests/looseOrders.test.ts tests/stations.test.ts tests/launcher.test.ts`

Expected: All existing tests and both launcher tests PASS.

Run: `npm run lint`

Expected: PASS with no ESLint errors.

Run: `npm run build`

Expected: Existing application build PASS, confirming the main app is unchanged.

- [ ] **Step 5: Commit the build workflow**

```bash
git add vite.launcher.config.ts package.json
git commit -m "build: add launcher output"
```

### Task 4: Include launcher protection in the default test suite

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `tests/launcher.test.ts` from Task 1.
- Produces: `npm test` executes `launcher.test.ts` alongside the existing loose-order and station tests.

- [ ] **Step 1: Extend the test script**

Set the `test` script in `package.json` to:

```json
"test": "node --experimental-strip-types --test tests/looseOrders.test.ts tests/stations.test.ts tests/launcher.test.ts"
```

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: All existing tests and both launcher contract tests PASS.

- [ ] **Step 3: Verify the deployable output contains no automatic navigation**

Run:

```powershell
rg -n "http-equiv=[\"']refresh|location\.(href|replace|assign)|setTimeout|setInterval" launcher-dist/launcher.html
```

Expected: No matches and exit code 1.

- [ ] **Step 4: Commit the default test integration**

```bash
git add package.json
git commit -m "test: include launcher in default suite"
```
