# Home VERSION, SeaTalk, and Cookie Clear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show SeaTalk contact and spreadsheet-backed release information on the home page, and let users immediately clear only the saved SPX Cookie from Settings.

**Architecture:** Add one read-only Google Apps Script function for sheet `VERSION`, isolate the `google.script.run` bridge and response normalization in a frontend utility, then keep `HomePage` responsible only for loading and rendering its three UI states. Put the cookie-only mutation in `src/utils/config.ts` so `SettingsPage` can clear one field while preserving the rest of the stored configuration.

**Tech Stack:** Google Apps Script, React 19, TypeScript 6, Vite 8, Tailwind CSS 4, DaisyUI 5, Lucide React, Node test runner with `--experimental-strip-types`.

## Global Constraints

- Read the sheet named exactly `VERSION` from the active spreadsheet.
- Read version from `A2` and latest update content from `B2` with `getDisplayValues()`.
- Missing, blank, malformed, or failed VERSION data must render `Chưa có thông tin phiên bản` without a global error toast.
- SeaTalk must open `https://link.seatalk.io/profile/open?seatalk_id=1386905313` in a new tab with `rel="noreferrer"`.
- `Xóa Cookie` must confirm, clear immediately, and preserve every non-cookie configuration field.
- Rename the existing full reset action to `Xóa toàn bộ` so it cannot be confused with cookie-only deletion.
- Add no dependencies and do not change Shopee API payloads or routes.
- Do not modify generated deployment artifacts such as `gas/index.html` unless packaging/deploy is separately requested.
- Do not change the unrelated `allowed: true` access override in `gas/code.gs`.

---

## File Structure

- Modify `gas/code.gs`: expose the read-only `getAppVersionInfo()` Apps Script function.
- Create `src/utils/appVersion.ts`: own VERSION response normalization and the `google.script.run` Promise bridge.
- Modify `src/pages/HomePage.tsx`: render the SeaTalk action and VERSION loading/data/fallback states.
- Modify `src/utils/config.ts`: own the cookie-only persisted configuration update.
- Modify `src/pages/SettingsPage.tsx`: confirm and trigger immediate Cookie deletion.
- Create `tests/appVersionGas.test.ts`: execute `gas/code.gs` in a VM and specify A2/B2 behavior.
- Create `tests/appVersion.test.ts`: specify frontend normalization, bridge fallback, and home-page contracts.
- Create `tests/config.test.ts`: specify cookie-only persistence and Settings UI contracts.
- Modify `package.json`: register each new test file in the repository test script.

---

### Task 1: Read VERSION A2/B2 in Google Apps Script

**Files:**
- Modify: `gas/code.gs`
- Create: `tests/appVersionGas.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SpreadsheetApp.getActiveSpreadsheet()` and sheet `VERSION` range `A2:B2`.
- Produces: global Apps Script function `getAppVersionInfo(): { version: string; updateContent: string }`.
- Preserves: `doGet`, `fetchShopeeApi`, access checks, and `doPost` behavior.

- [ ] **Step 1: Write the failing Apps Script tests**

Create `tests/appVersionGas.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type HarnessOptions = {
  values?: unknown[][];
  missingSheet?: boolean;
  sheetError?: Error;
};

async function createVersionHarness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../gas/code.gs", import.meta.url), "utf8");
  let requestedRange: number[] | null = null;
  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => {
          assert.equal(name, "VERSION");
          if (options.sheetError) throw options.sheetError;
          if (options.missingSheet) return null;
          return {
            getRange: (...args: number[]) => {
              requestedRange = args;
              return {
                getDisplayValues: () =>
                  options.values ?? [[" 1.2.3 ", " Sửa lỗi\nThêm tính năng "]],
              };
            },
          };
        },
      }),
    },
    console: { error() {} },
    JSON,
  });

  vm.runInContext(source, context);
  return { context, getRequestedRange: () => requestedRange };
}

test("reads VERSION A2 and B2 as display values", async () => {
  const harness = await createVersionHarness();
  const result = JSON.parse(
    JSON.stringify(harness.context.getAppVersionInfo()),
  );

  assert.deepEqual(harness.getRequestedRange(), [2, 1, 1, 2]);
  assert.deepEqual(result, {
    version: "1.2.3",
    updateContent: "Sửa lỗi\nThêm tính năng",
  });
});

test("returns empty version data when VERSION is missing", async () => {
  const { context } = await createVersionHarness({ missingSheet: true });
  assert.deepEqual(JSON.parse(JSON.stringify(context.getAppVersionInfo())), {
    version: "",
    updateContent: "",
  });
});

test("returns empty version data when A2 and B2 are blank", async () => {
  const { context } = await createVersionHarness({ values: [["  ", "\n"]] });
  assert.deepEqual(JSON.parse(JSON.stringify(context.getAppVersionInfo())), {
    version: "",
    updateContent: "",
  });
});

test("returns empty version data when the sheet read fails", async () => {
  const { context } = await createVersionHarness({
    sheetError: new Error("sheet failed"),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.getAppVersionInfo())), {
    version: "",
    updateContent: "",
  });
});
```

Append `tests/appVersionGas.test.ts` to the explicit `test` script in `package.json`.

- [ ] **Step 2: Run the test and confirm the intended failure**

Run:

```powershell
node --experimental-strip-types --test tests/appVersionGas.test.ts
```

Expected: FAIL because `getAppVersionInfo` does not exist.

- [ ] **Step 3: Implement the Apps Script reader**

Add near the top of `gas/code.gs`, after the access-sheet constants:

```js
var VERSION_SHEET_NAME = "VERSION";

function getAppVersionInfo() {
  var emptyVersionInfo = { version: "", updateContent: "" };

  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(VERSION_SHEET_NAME);
    if (!sheet) {
      return emptyVersionInfo;
    }

    var values = sheet.getRange(2, 1, 1, 2).getDisplayValues();
    var row = values && values[0] ? values[0] : [];
    return {
      version: String(row[0] || "").trim(),
      updateContent: String(row[1] || "").trim()
    };
  } catch (error) {
    console.error("Version info read failed");
    return emptyVersionInfo;
  }
}
```

Do not call `getCurrentUserAccess_`, `UrlFetchApp`, or `fetchShopeeApi` from this function.

- [ ] **Step 4: Run the Apps Script test**

Run:

```powershell
node --experimental-strip-types --test tests/appVersionGas.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the VERSION backend**

```powershell
git add -- gas/code.gs tests/appVersionGas.test.ts package.json
git commit -m "feat: read app version from spreadsheet"
```

---

### Task 2: Add the Frontend VERSION Bridge

**Files:**
- Create: `src/utils/appVersion.ts`
- Create: `tests/appVersion.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: an Apps Script runner exposing `getAppVersionInfo()`.
- Produces: `AppVersionInfo`, `AppVersionRunner`, `normalizeAppVersionInfo(value)`, and `loadAppVersionInfo(runner?)`.
- Used by: `HomePage` in Task 3.

- [ ] **Step 1: Write failing normalization and bridge tests**

Create `tests/appVersion.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAppVersionInfo,
  normalizeAppVersionInfo,
  type AppVersionRunner,
} from "../src/utils/appVersion.ts";

const createRunner = (outcome: unknown | Error): AppVersionRunner => {
  let successHandler: (value: unknown) => void = () => {};
  let failureHandler: () => void = () => {};

  return {
    withSuccessHandler(handler) {
      successHandler = handler;
      return this;
    },
    withFailureHandler(handler) {
      failureHandler = handler;
      return this;
    },
    getAppVersionInfo() {
      if (outcome instanceof Error) failureHandler();
      else successHandler(outcome);
    },
  };
};

test("normalizes valid VERSION data", () => {
  assert.deepEqual(
    normalizeAppVersionInfo({
      version: " 1.2.3 ",
      updateContent: " Sửa lỗi\nThêm tính năng ",
    }),
    { version: "1.2.3", updateContent: "Sửa lỗi\nThêm tính năng" },
  );
});

test("rejects empty and malformed VERSION data", () => {
  assert.equal(normalizeAppVersionInfo(null), null);
  assert.equal(normalizeAppVersionInfo({ version: "", updateContent: "" }), null);
  assert.equal(normalizeAppVersionInfo({ version: 123, updateContent: [] }), null);
});

test("loads VERSION data through the Apps Script runner", async () => {
  assert.deepEqual(
    await loadAppVersionInfo(
      createRunner({ version: "2.0", updateContent: "Bản mới" }),
    ),
    { version: "2.0", updateContent: "Bản mới" },
  );
});

test("falls back when Apps Script is unavailable or fails", async () => {
  assert.equal(await loadAppVersionInfo(null), null);
  assert.equal(await loadAppVersionInfo(createRunner(new Error("failed"))), null);
});
```

Append `tests/appVersion.test.ts` to the `test` script in `package.json`.

- [ ] **Step 2: Run the frontend utility test and confirm failure**

Run:

```powershell
node --experimental-strip-types --test tests/appVersion.test.ts
```

Expected: FAIL because `src/utils/appVersion.ts` does not exist.

- [ ] **Step 3: Implement normalization and the Promise bridge**

Create `src/utils/appVersion.ts`:

```ts
export interface AppVersionInfo {
  version: string;
  updateContent: string;
}

export interface AppVersionRunner {
  withSuccessHandler(handler: (value: unknown) => void): AppVersionRunner;
  withFailureHandler(handler: () => void): AppVersionRunner;
  getAppVersionInfo(): void;
}

type GoogleAppsScriptGlobal = typeof globalThis & {
  google?: { script?: { run?: AppVersionRunner } };
};

const getDefaultRunner = (): AppVersionRunner | null =>
  (globalThis as GoogleAppsScriptGlobal).google?.script?.run ?? null;

export const normalizeAppVersionInfo = (
  value: unknown,
): AppVersionInfo | null => {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const version = typeof record.version === "string" ? record.version.trim() : "";
  const updateContent =
    typeof record.updateContent === "string"
      ? record.updateContent.trim()
      : "";

  return version || updateContent ? { version, updateContent } : null;
};

export const loadAppVersionInfo = (
  runner: AppVersionRunner | null = getDefaultRunner(),
): Promise<AppVersionInfo | null> => {
  if (!runner) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      runner
        .withSuccessHandler((value) => resolve(normalizeAppVersionInfo(value)))
        .withFailureHandler(() => resolve(null))
        .getAppVersionInfo();
    } catch {
      resolve(null);
    }
  });
};
```

- [ ] **Step 4: Run utility tests and TypeScript**

Run:

```powershell
node --experimental-strip-types --test tests/appVersion.test.ts
node node_modules/typescript/lib/tsc.js -b
```

Expected: 4 tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit the frontend VERSION utility**

```powershell
git add -- src/utils/appVersion.ts tests/appVersion.test.ts package.json
git commit -m "feat: load app version in frontend"
```

---

### Task 3: Render SeaTalk and Release Information on HomePage

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Modify: `tests/appVersion.test.ts`

**Interfaces:**
- Consumes: `loadAppVersionInfo(): Promise<AppVersionInfo | null>`.
- Produces: SeaTalk contact link plus loading, data, and fallback release-information states.
- Preserves: existing Zalo, hotline, and email contact actions.

- [ ] **Step 1: Add a failing HomePage contract test**

Append to `tests/appVersion.test.ts`:

```ts
import { readFile } from "node:fs/promises";

test("HomePage renders SeaTalk and VERSION states", async () => {
  const source = await readFile(
    new URL("../src/pages/HomePage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /https:\/\/link\.seatalk\.io\/profile\/open\?seatalk_id=1386905313/,
  );
  assert.match(source, /loadAppVersionInfo/);
  assert.match(source, /Đang tải thông tin phiên bản/);
  assert.match(source, /Chưa có thông tin phiên bản/);
  assert.match(source, /whitespace-pre-wrap/);
});
```

- [ ] **Step 2: Run the test and confirm the UI contract fails**

Run:

```powershell
node --experimental-strip-types --test tests/appVersion.test.ts
```

Expected: utility tests PASS and the HomePage contract FAILS because SeaTalk and VERSION UI are absent.

- [ ] **Step 3: Add HomePage loading state and one-time load**

In `src/pages/HomePage.tsx`:

- import `useEffect`, `useState` from React;
- import `MessagesSquare` and `History` from `lucide-react` alongside existing icons;
- import `loadAppVersionInfo` and `type AppVersionInfo` from `../utils/appVersion`;
- add state and the guarded one-time effect inside `HomePage`:

```tsx
const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
const [versionLoading, setVersionLoading] = useState(true);

useEffect(() => {
  let active = true;
  void loadAppVersionInfo().then((info) => {
    if (!active) return;
    setVersionInfo(info);
    setVersionLoading(false);
  });
  return () => {
    active = false;
  };
}, []);
```

- [ ] **Step 4: Add the SeaTalk action**

Place this action in the existing contact button group:

```tsx
<a
  href="https://link.seatalk.io/profile/open?seatalk_id=1386905313"
  target="_blank"
  rel="noreferrer"
  className="btn min-h-11 w-full gap-2 rounded-2xl border-info/30 bg-info/10 text-sm font-bold text-info hover:bg-info/20"
>
  <MessagesSquare className="h-5 w-5" aria-hidden="true" />
  <span>Liên hệ qua SeaTalk</span>
</a>
```

- [ ] **Step 5: Render loading, content, and fallback states**

Add a release-information section below contact actions and above the email footer:

```tsx
<section
  className="rounded-2xl border border-base-200 bg-base-200/35 p-3 text-left"
  aria-live="polite"
  aria-label="Thông tin phiên bản"
>
  {versionLoading ? (
    <p className="text-xs text-base-content/60">
      Đang tải thông tin phiên bản...
    </p>
  ) : versionInfo ? (
    <div className="space-y-2">
      {versionInfo.version ? (
        <div className="flex items-center gap-2 text-sm font-bold text-primary">
          <History className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Phiên bản {versionInfo.version}</span>
        </div>
      ) : null}
      {versionInfo.updateContent ? (
        <div>
          <p className="text-xs font-bold text-base-content/75">
            Nội dung cập nhật
          </p>
          <p className="mt-1 whitespace-pre-wrap break-safe text-xs leading-relaxed text-base-content/65">
            {versionInfo.updateContent}
          </p>
        </div>
      ) : null}
    </div>
  ) : (
    <p className="text-xs text-base-content/60">
      Chưa có thông tin phiên bản
    </p>
  )}
</section>
```

- [ ] **Step 6: Run HomePage tests, lint, and build**

Run:

```powershell
node --experimental-strip-types --test tests/appVersion.test.ts tests/appVersionGas.test.ts
npm run lint
npm run build
```

Expected: all VERSION tests PASS, lint PASS, and production build PASS.

- [ ] **Step 7: Commit the HomePage feature**

```powershell
git add -- src/pages/HomePage.tsx tests/appVersion.test.ts
git commit -m "feat: show contact and release info on home"
```

---

### Task 4: Clear Only the Saved SPX Cookie

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Create: `tests/config.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `getConfigs()` and `saveConfigs(config)`.
- Produces: `clearCookies(): AppConfig` and a confirmed immediate `Xóa Cookie` Settings action.
- Preserves: all properties except `cookies`, including unknown valid properties retained by object spread.

- [ ] **Step 1: Write failing cookie-only persistence and UI contract tests**

Create `tests/config.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { clearCookies } from "../src/utils/config.ts";

test("clearCookies preserves every non-cookie configuration value", () => {
  let stored = JSON.stringify({
    soc: "Pleiku SOC",
    soc_id: "1001",
    cookies: "SPC_EC=secret",
    hubs: ["Hub A"],
    hub_ids: { "Hub A": "2001" },
    socs: ["DN SOC"],
    soc_ids: { "DN SOC": "3001" },
    group_socs: { "DN SOC": ["DN SOC"] },
    proxy_url: "https://proxy.example",
    ggsheet_log_url: "https://log.example",
    scanner_url: "https://scanner.example",
  });
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (key === "configs" ? stored : null),
      setItem: (key: string, value: string) => {
        if (key === "configs") stored = value;
      },
    },
  });

  try {
    const result = clearCookies();
    const persisted = JSON.parse(stored);
    assert.equal(result.cookies, "");
    assert.equal(persisted.cookies, "");
    assert.equal(persisted.soc, "Pleiku SOC");
    assert.deepEqual(persisted.hubs, ["Hub A"]);
    assert.equal(persisted.proxy_url, "https://proxy.example");
    assert.equal(persisted.ggsheet_log_url, "https://log.example");
    assert.equal(persisted.scanner_url, "https://scanner.example");
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("Settings exposes separate cookie and full reset actions", async () => {
  const source = await readFile(
    new URL("../src/pages/SettingsPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /clearCookies/);
  assert.match(source, /Bạn có chắc chắn muốn xóa Cookie SPX đã lưu/);
  assert.match(source, /Xóa Cookie/);
  assert.match(source, /Xóa toàn bộ/);
  assert.match(source, /Các cấu hình khác được giữ nguyên/);
});
```

Append `tests/config.test.ts` to the explicit `test` script in `package.json`.

- [ ] **Step 2: Run the test and confirm failure**

Run:

```powershell
node --experimental-strip-types --test tests/config.test.ts
```

Expected: FAIL because `clearCookies` and the two distinct Settings actions do not exist.

- [ ] **Step 3: Implement the cookie-only config update**

Append to `src/utils/config.ts` immediately after `saveConfigs`:

```ts
export const clearCookies = (): AppConfig => {
  const nextConfig = { ...getConfigs(), cookies: "" };
  saveConfigs(nextConfig);
  return nextConfig;
};
```

- [ ] **Step 4: Add the confirmed Settings handler**

In `src/pages/SettingsPage.tsx`:

- import `clearCookies` from `../utils/config`;
- import `Trash2` from `lucide-react`;
- add this handler before `handleReset`:

```tsx
const handleClearCookies = () => {
  const hasSavedCookie = Boolean(getConfigs().cookies);
  if (!cookies.trim() && !hasSavedCookie) return;
  if (!confirm("Bạn có chắc chắn muốn xóa Cookie SPX đã lưu?")) return;

  try {
    clearCookies();
    setCookies("");
    showToast(
      "Đã xóa Cookie SPX. Các cấu hình khác được giữ nguyên.",
      "success",
    );
  } catch {
    showToast("Không thể xóa Cookie SPX. Vui lòng thử lại.", "error");
  }
};
```

- [ ] **Step 5: Add the Cookie action and clarify the full reset label**

Inside the Cookie surface, after the helper text, add:

```tsx
<div className="flex justify-end border-t border-base-200 pt-3">
  <button
    type="button"
    onClick={handleClearCookies}
    disabled={!cookies.trim() && !getConfigs().cookies}
    className="btn btn-outline min-h-11 gap-2 rounded-xl border-error/30 text-error hover:bg-error/10"
  >
    <Trash2 className="h-4 w-4" aria-hidden="true" />
    Xóa Cookie
  </button>
</div>
```

Change the existing action-bar label from `Xóa` to `Xóa toàn bộ`. Preserve `handleReset` and its full-config confirmation unchanged.

- [ ] **Step 6: Run config tests, lint, and build**

Run:

```powershell
node --experimental-strip-types --test tests/config.test.ts
npm run lint
npm run build
```

Expected: 2 tests PASS, lint PASS, and production build PASS.

- [ ] **Step 7: Commit the Cookie control**

```powershell
git add -- src/utils/config.ts src/pages/SettingsPage.tsx tests/config.test.ts package.json
git commit -m "feat: clear saved SPX cookie separately"
```

---

### Task 5: Final Regression and Responsive Verification

**Files:**
- Verify only; modify a source or test file only when a failure is directly caused by Tasks 1–4.

**Interfaces:**
- Consumes: every output from Tasks 1–4.
- Produces: evidence that VERSION, SeaTalk, Cookie deletion, lint, build, and repository state are correct.

- [ ] **Step 1: Run all feature tests together**

```powershell
node --experimental-strip-types --test tests/appVersionGas.test.ts tests/appVersion.test.ts tests/config.test.ts
```

Expected: all feature tests PASS.

- [ ] **Step 2: Run the repository test script**

```powershell
npm test
```

Expected: all new and feature-related tests PASS. The only permitted failures are the two pre-existing `gasAccessControl.test.ts` failures caused by the intentional `allowed: true` override in `gas/code.gs`; record exact totals.

- [ ] **Step 3: Run lint and production build**

```powershell
npm run lint
npm run build
```

Expected: both commands exit `0`. Record final patched `dist/index.html` size and do not copy it into `gas/index.html`.

- [ ] **Step 4: Perform local responsive UI QA**

Run the Vite development server and inspect the Home and Settings pages at these viewports:

- `375 × 812` light mode;
- `375 × 812` dark mode;
- `812 × 375` landscape;
- `1024 × 768` desktop.

Verify:

- SeaTalk action has a minimum 44px touch target and the exact profile URL;
- local/Vite fallback displays `Chưa có thông tin phiên bản` after loading;
- release copy wraps without page-level horizontal scrolling;
- `Xóa Cookie` and `Xóa toàn bộ` are visually and textually distinct;
- disabled Cookie deletion is not focusable/clickable when no Cookie exists;
- no console errors or warnings are introduced.

- [ ] **Step 5: Inspect the final diff and worktree**

```powershell
git diff --check
git status --short
git log --oneline -7
```

Expected: no whitespace errors, no generated deployment artifact staged, and only intentional changes present.

- [ ] **Step 6: Commit only direct regression corrections**

If final verification required a feature-scoped correction, stage only the exact corrected files and commit:

```powershell
git add -- gas/code.gs src/utils/appVersion.ts src/pages/HomePage.tsx src/utils/config.ts src/pages/SettingsPage.tsx tests/appVersionGas.test.ts tests/appVersion.test.ts tests/config.test.ts package.json
git commit -m "fix: stabilize app release information"
```

If verification requires no correction, do not create an empty commit.
