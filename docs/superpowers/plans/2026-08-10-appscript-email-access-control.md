# Apps Script Email Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the Apps Script UI and Shopee proxy to signed-in Google users whose normalized email appears in `account!A2:A` of the bound spreadsheet.

**Architecture:** Keep authorization entirely on the Apps Script server. A shared access helper reads the active Google identity and the bound spreadsheet, while `doGet()` renders either the existing app or a safe denial page and `fetchShopeeApi()` returns `403` before any outbound request for unauthorized sessions.

**Tech Stack:** Google Apps Script V8, Spreadsheet service, Session service, HTML service, Node.js built-in test runner and VM module

## Global Constraints

- The allowlist source is the bound spreadsheet sheet `account`, column A, starting at row 2.
- Normalize emails with `trim().toLowerCase()` and compare exact normalized strings.
- Blank identity, missing sheet, spreadsheet read failure, or absent email must deny access.
- Do not cache the allowlist.
- Do not expose the allowlist, stack traces, SPX cookies, or internal errors in the denial page.
- Protect both `doGet()` and `fetchShopeeApi()`.
- Keep `doPost()` behavior unchanged.
- Deployment must use `Execute as: User accessing the web app`.

---

### Task 1: Server authorization contract tests

**Files:**
- Create: `tests/gasAccessControl.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Global functions declared by `gas/code.gs` and Apps Script globals supplied through a Node VM context.
- Produces: Regression tests for `normalizeEmail_()`, `getCurrentUserAccess_()`, `doGet()`, denial-page escaping, proxy blocking, and unchanged `doPost()` presence.

- [ ] **Step 1: Add a VM harness for Apps Script source**

Create `tests/gasAccessControl.test.ts` with a helper that reads `gas/code.gs`, runs it through `node:vm`, and supplies mocks for `Session`, `SpreadsheetApp`, `HtmlService`, `UrlFetchApp`, `ContentService`, and `console`.

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type HarnessOptions = {
  email?: string;
  allowedEmails?: string[];
  missingSheet?: boolean;
  sheetError?: Error;
};

async function createHarness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../gas/code.gs", import.meta.url), "utf8");
  let outboundFetchCount = 0;

  const htmlOutput = (content: string) => ({
    content,
    title: "",
    setTitle(title: string) { this.title = title; return this; },
    addMetaTag() { return this; },
    setXFrameOptionsMode() { return this; },
  });

  const context = vm.createContext({
    Session: {
      getActiveUser: () => ({ getEmail: () => options.email ?? "" }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => {
          if (options.sheetError) throw options.sheetError;
          if (name === "account" && !options.missingSheet) {
            const values = options.allowedEmails ?? [];
            return {
              getLastRow: () => values.length + 1,
              getRange: () => ({ getDisplayValues: () => values.map((value) => [value]) }),
            };
          }
          return null;
        },
      }),
    },
    HtmlService: {
      createHtmlOutputFromFile: (name: string) => htmlOutput(`FILE:${name}`),
      createHtmlOutput: (content: string) => htmlOutput(content),
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    },
    UrlFetchApp: {
      fetch: () => { outboundFetchCount += 1; throw new Error("Unexpected outbound request"); },
    },
    ContentService: {
      createTextOutput: (content: string) => ({ content, setMimeType() { return this; } }),
      MimeType: { JSON: "JSON" },
    },
    console: { error() {} },
    JSON,
  });

  vm.runInContext(source, context);
  return { context, getOutboundFetchCount: () => outboundFetchCount };
}
```

- [ ] **Step 2: Add failing authorization and route tests**

Append focused tests that assert:

```ts
test("normalizes and exactly matches an allowlisted email", async () => {
  const { context } = await createHarness({
    email: "  User@SPXExpress.com ",
    allowedEmails: ["user@spxexpress.com"],
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.getCurrentUserAccess_())),
    { allowed: true, email: "user@spxexpress.com", reason: "AUTHORIZED" },
  );
  assert.equal(context.doGet().content, "FILE:index");
});

test("denies blank, absent, partial, missing-sheet, and read-error identities", async () => {
  const cases: HarnessOptions[] = [
    { email: "", allowedEmails: ["user@spxexpress.com"] },
    { email: "other@spxexpress.com", allowedEmails: ["user@spxexpress.com"] },
    { email: "user", allowedEmails: ["user@spxexpress.com"] },
    { email: "user@spxexpress.com", missingSheet: true },
    { email: "user@spxexpress.com", sheetError: new Error("sheet failure") },
  ];
  for (const item of cases) {
    const { context } = await createHarness(item);
    assert.equal(context.getCurrentUserAccess_().allowed, false);
    assert.match(context.doGet().content, /Không có quyền truy cập/);
  }
});

test("escapes the displayed identity and hides internal details", async () => {
  const { context } = await createHarness({
    email: "<img src=x onerror=alert(1)>",
    sheetError: new Error("SECRET_STACK_DETAIL"),
  });
  const html = context.doGet().content;
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /SECRET_STACK_DETAIL/);
});

test("blocks unauthorized proxy calls before UrlFetchApp", async () => {
  const harness = await createHarness({
    email: "blocked@spxexpress.com",
    allowedEmails: ["allowed@spxexpress.com"],
  });
  const result = harness.context.fetchShopeeApi("/api/test", "secret", "get");
  assert.equal(result.status, 403);
  assert.equal(harness.getOutboundFetchCount(), 0);
});

test("keeps the HTTP log endpoint available", async () => {
  const { context } = await createHarness();
  assert.equal(typeof context.doPost, "function");
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/gasAccessControl.test.ts`

Expected: FAIL because authorization helpers and denial routing do not exist yet.

- [ ] **Step 4: Include the new test in the default suite**

Set the `test` script in `package.json` to:

```json
"test": "node --experimental-strip-types --test tests/looseOrders.test.ts tests/stations.test.ts tests/launcher.test.ts tests/gasAccessControl.test.ts"
```

- [ ] **Step 5: Commit the failing security contract**

```bash
git add tests/gasAccessControl.test.ts package.json
git commit -m "test: define Apps Script access control contract"
```

### Task 2: Shared email authorization helpers

**Files:**
- Modify: `gas/code.gs`

**Interfaces:**
- Produces: `normalizeEmail_(value): string`, `getAllowedEmails_(): string[]`, and `getCurrentUserAccess_(): { allowed: boolean, email: string, reason: string }`.
- Consumes: `Session.getActiveUser()`, `SpreadsheetApp.getActiveSpreadsheet()`, and `account!A2:A`.

- [ ] **Step 1: Add allowlist constants and normalization**

Add above `doGet()`:

```js
var ACCESS_SHEET_NAME = "account";
var ACCESS_EMAIL_COLUMN = 1;
var ACCESS_FIRST_DATA_ROW = 2;

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}
```

- [ ] **Step 2: Add the bound-sheet reader**

```js
function getAllowedEmails_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(ACCESS_SHEET_NAME);
  if (!sheet) {
    throw new Error("Access sheet is missing");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < ACCESS_FIRST_DATA_ROW) {
    return [];
  }

  return sheet
    .getRange(
      ACCESS_FIRST_DATA_ROW,
      ACCESS_EMAIL_COLUMN,
      lastRow - ACCESS_FIRST_DATA_ROW + 1,
      1
    )
    .getDisplayValues()
    .map(function (row) { return normalizeEmail_(row[0]); })
    .filter(function (email) { return email !== ""; });
}
```

- [ ] **Step 3: Add fail-closed access evaluation**

```js
function getCurrentUserAccess_() {
  var email = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!email) {
    return { allowed: false, email: "", reason: "EMAIL_UNAVAILABLE" };
  }

  try {
    var allowed = getAllowedEmails_().indexOf(email) !== -1;
    return {
      allowed: allowed,
      email: email,
      reason: allowed ? "AUTHORIZED" : "NOT_LISTED"
    };
  } catch (error) {
    console.error("Access check failed");
    return { allowed: false, email: email, reason: "ACCESS_CHECK_FAILED" };
  }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `node --experimental-strip-types --test tests/gasAccessControl.test.ts`

Expected: Authorization helper assertions pass; routing and denial-page assertions still fail until Task 3.

- [ ] **Step 5: Commit the authorization helpers**

```bash
git add gas/code.gs
git commit -m "feat: add Apps Script email allowlist"
```

### Task 3: Protected UI, denial page, and proxy

**Files:**
- Modify: `gas/code.gs`

**Interfaces:**
- Consumes: `getCurrentUserAccess_()` from Task 2.
- Produces: Protected `doGet()`, `createAccessDeniedOutput_(access)`, `escapeHtml_(value)`, and a `403` early return from `fetchShopeeApi()`.

- [ ] **Step 1: Add safe HTML escaping**

```js
function escapeHtml_(value) {
  return String(value || "").replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[character];
  });
}
```

- [ ] **Step 2: Add the Vietnamese denial output**

```js
function createAccessDeniedOutput_(access) {
  var accountMessage = access.email
    ? "Tài khoản hiện tại: <strong>" + escapeHtml_(access.email) + "</strong>"
    : "Không xác định được email đăng nhập. Hãy mở lại bằng tài khoản công ty.";

  var html = [
    "<!doctype html>",
    '<html lang="vi">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>Không có quyền truy cập</title>",
    "<style>",
    "*{box-sizing:border-box}",
    "body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#f3f5f7;color:#17212b;font-family:Arial,sans-serif}",
    ".card{width:min(100%,430px);padding:32px 24px;background:#fff;border:1px solid #dce1e5;border-top:7px solid #ee4d2d;border-radius:10px;box-shadow:0 20px 50px rgba(30,43,56,.13);text-align:center}",
    ".icon{width:64px;height:64px;margin:0 auto 20px;display:grid;place-items:center;border-radius:50%;background:#fff0ed;color:#d94327;font-size:32px;font-weight:800}",
    "h1{margin:0 0 14px;font-size:1.75rem}",
    "p{margin:10px 0;color:#596773;line-height:1.55;overflow-wrap:anywhere}",
    "strong{color:#17212b}",
    ".help{margin-top:22px;padding-top:18px;border-top:1px solid #e4e8eb;font-size:.9rem}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="card">',
    '<div class="icon" aria-hidden="true">!</div>',
    "<h1>Không có quyền truy cập</h1>",
    "<p>" + accountMessage + "</p>",
    '<p class="help">Liên hệ quản trị viên để thêm email vào danh sách được phép.</p>',
    "</main>",
    "</body>",
    "</html>"
  ].join("");

  return HtmlService.createHtmlOutput(html)
    .setTitle("Không có quyền truy cập")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}
```

- [ ] **Step 3: Protect the main HTML route**

Replace `doGet()` with:

```js
function doGet() {
  var access = getCurrentUserAccess_();
  if (!access.allowed) {
    return createAccessDeniedOutput_(access);
  }

  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("PLEIKU SOC Logistics System")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

- [ ] **Step 4: Block unauthorized proxy calls before processing secrets**

At the first line inside `fetchShopeeApi()` add:

```js
var access = getCurrentUserAccess_();
if (!access.allowed) {
  return {
    status: 403,
    error: "Bạn không có quyền sử dụng chức năng này."
  };
}
```

This check must appear before constructing the Shopee URL, reading the cookie into request options, or calling `UrlFetchApp.fetch`.

- [ ] **Step 5: Run focused and complete checks**

Run: `node --experimental-strip-types --test tests/gasAccessControl.test.ts`

Expected: All access-control tests PASS.

Run: `npm test`

Expected: All repository tests PASS.

Run: `npm run lint`

Expected: PASS with no ESLint errors.

Run: `npm run build`

Expected: Existing app build PASS and regenerate `dist/index.html` without changing the access-control server source.

- [ ] **Step 6: Commit protected routing**

```bash
git add gas/code.gs
git commit -m "feat: enforce Apps Script email access"
```

### Task 4: Deployment handoff verification

**Files:**
- Verify: `gas/code.gs`
- Verify: `gas/index.html`
- Verify: `gas/appsscript.json`

**Interfaces:**
- Consumes: The completed server authorization implementation.
- Produces: A deployment checklist for the user; no source mutation unless the regenerated app HTML is intentionally copied to `gas/index.html`.

- [ ] **Step 1: Confirm the protected source and allowlist contract**

Run:

```powershell
rg -n "getCurrentUserAccess_|account|ACCESS_FIRST_DATA_ROW|createAccessDeniedOutput_|status: 403" gas/code.gs
```

Expected: Each protection symbol appears and the first data row is `2`.

- [ ] **Step 2: Confirm the Apps Script project files are ready to upload**

Run: `Get-ChildItem gas | Select-Object Name, Length`

Expected: `code.gs`, `index.html`, and `appsscript.json` are present.

- [ ] **Step 3: Record the manual deployment settings**

Use these exact settings when updating the Apps Script deployment:

```text
Deploy > Manage deployments > Edit
Execute as: User accessing the web app
Who has access: Anyone in spxexpress.com (or the domain-only equivalent shown)
Deploy a new version, then test with one allowlisted and one blocked account.
```

- [ ] **Step 4: Verify the working tree only contains intended changes**

Run: `git status --short`

Expected: No uncommitted access-control source changes; preserve unrelated user-created archive files.
