# Internal Hub Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Overview page that checks every configured internal Hub with bounded concurrency, summarizes loose and packed orders per Hub, exposes existing TO detail, and enforces a reload-proof two-minute manual refresh cooldown.

**Architecture:** A pure `internalHubOverview` utility owns result types, aggregation, validation, cooldown math and the three-worker scheduler. A small API module performs the two requests for one Hub and returns independent settled branch results. The page orchestrates state while a presentation component renders responsive desktop/mobile summaries and reuses `TOTable` for the selected Hub.

**Tech Stack:** React 19, TypeScript 6, React Router 7, Axios client already configured in the app, Tailwind CSS 4, DaisyUI 5, Lucide React, Node built-in test runner, Vite 8.

## Global Constraints

- Check every Hub returned by `getHubs()`; do not require selecting a Hub.
- Run at most 3 Hubs concurrently; each Hub may run its loose and packed requests in parallel.
- Start the 120,000 ms cooldown only after configuration validation succeeds and immediately before the first request.
- Persist the last-start timestamp in localStorage so reload cannot bypass cooldown.
- Do not automatically refresh and do not expose per-Hub retry during cooldown.
- Preserve successful branch data when the sibling branch fails, and preserve the last successful data while refreshing or after a new failure.
- Reuse `TOTable` for detail; opening detail must not send another request.
- Do not change the existing internal-check page, request contracts, QR behavior or dependencies.
- Keep the pre-existing untracked `.superpowers/` and `scanner-dist/scanner-dist.zip` out of every commit.

## File Map

- Create `src/utils/internalHubOverview.ts`: pure types, initial rows, validation, branch merging, totals, cooldown and bounded scheduler.
- Create `src/utils/internalHubOverviewApi.ts`: packed-order URL/response handling and two-branch per-Hub request.
- Create `tests/internalHubOverview.test.ts`: pure model, aggregation, cooldown, validation and concurrency tests.
- Create `src/components/InternalHubOverviewTable.tsx`: responsive table/cards and Hub-detail selector action.
- Create `src/pages/InternalHubOverviewPage.tsx`: configuration, cooldown timer, batch orchestration, summary cards and `TOTable` detail.
- Modify `src/App.tsx`: register `/check-sot/noi-tinh/overview`.
- Modify `src/layouts/MobileLayout.tsx`: add the Overview navigation item.
- Modify `package.json`: include the new test file in the explicit test command.

---

### Task 1: Pure overview model, cooldown and bounded scheduler

**Files:**
- Create: `src/utils/internalHubOverview.ts`
- Create: `tests/internalHubOverview.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `TransferOrder`, `LooseOrderSummary`, Hub name/ID pairs, a clock timestamp and a `StorageLike` object.
- Produces: `HubOverviewRow`, `OverviewTotals`, `validateOverviewConfig`, `mergeHubBranchResult`, `summarizeOverview`, `getOverviewCooldownRemaining`, `startOverviewCooldown`, and `runWithConcurrency`.

- [ ] **Step 1: Write failing tests for validation and initial rows**

Start `tests/internalHubOverview.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialHubRows,
  validateOverviewConfig,
} from "../src/utils/internalHubOverview.ts";

test("creates one idle row per configured Hub", () => {
  assert.deepEqual(
    createInitialHubRows([
      { name: "Hub A", id: "101" },
      { name: "Hub B", id: "102" },
    ]).map(({ name, id, status }) => ({ name, id, status })),
    [
      { name: "Hub A", id: "101", status: "idle" },
      { name: "Hub B", id: "102", status: "idle" },
    ],
  );
});

test("validates SOC, cookie, Hub list and every Hub ID before requests", () => {
  assert.match(validateOverviewConfig({ soc: "", socId: "1", cookies: "x", hubs: [] }) ?? "", /SOC/i);
  assert.match(validateOverviewConfig({ soc: "SOC", socId: "", cookies: "x", hubs: [] }) ?? "", /ID/i);
  assert.match(validateOverviewConfig({ soc: "SOC", socId: "1", cookies: "", hubs: [] }) ?? "", /Cookie/i);
  assert.match(validateOverviewConfig({ soc: "SOC", socId: "1", cookies: "x", hubs: [] }) ?? "", /Hub/i);
  assert.match(
    validateOverviewConfig({
      soc: "SOC",
      socId: "1",
      cookies: "x",
      hubs: [{ name: "Hub A", id: "" }, { name: "Hub B", id: "2" }],
    }) ?? "",
    /Hub A/,
  );
  assert.equal(
    validateOverviewConfig({
      soc: "SOC",
      socId: "1",
      cookies: "x",
      hubs: [{ name: "Hub A", id: "2" }],
    }),
    null,
  );
});
```

- [ ] **Step 2: Write failing tests for branch merging and totals**

Append tests which build two rows, merge a successful loose summary and packed list, then assert:

```ts
const packedOrders = [
  { to_number: "TO-A", quantity: 5, dg_type: [1], high_value: 1 },
  { to_number: "TO-B", quantity: 3, dg_type: [2], high_value: 2 },
] as never[];

test("merges branches independently and totals only successful data", () => {
  let [row] = createInitialHubRows([{ name: "Hub A", id: "101" }]);
  row = mergeHubBranchResult(row, "loose", {
    ok: true,
    data: { total: 7, dgCount: 2, highValueCount: 1 },
  });
  row = mergeHubBranchResult(row, "packed", { ok: true, data: packedOrders });
  row = finishHubRefresh(row, 1_000);

  assert.deepEqual(row.packed.metrics, {
    totalQuantity: 8,
    dgBagCount: 1,
    gtcBagCount: 1,
  });
  assert.equal(row.status, "success");
  assert.deepEqual(summarizeOverview([row]), {
    completedHubs: 1,
    totalHubs: 1,
    looseTotal: 7,
    looseDg: 2,
    looseGtc: 1,
    packedTo: 2,
    packedQuantity: 8,
    packedDg: 1,
    packedGtc: 1,
    latestUpdatedAt: 1_000,
  });
});

test("keeps previous successful data when a refresh branch fails", () => {
  let [row] = createInitialHubRows([{ name: "Hub A", id: "101" }]);
  row = mergeHubBranchResult(row, "packed", { ok: true, data: packedOrders });
  row = finishHubRefresh(row, 1_000);
  row = beginHubRefresh(row);
  row = mergeHubBranchResult(row, "packed", { ok: false, error: "Packed timeout" });
  row = finishHubRefresh(row, 2_000);
  assert.equal(row.packed.orders.length, 2);
  assert.equal(row.packed.error, "Packed timeout");
  assert.equal(row.packed.stale, true);
  assert.equal(row.status, "error");
});
```

Import `beginHubRefresh`, `finishHubRefresh`, `mergeHubBranchResult`, and `summarizeOverview` in this test file.

- [ ] **Step 3: Write failing tests for persistent cooldown**

```ts
const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

test("persists a 120-second cooldown and expires exactly on time", () => {
  const storage = createStorage();
  startOverviewCooldown(storage, 10_000);
  assert.equal(getOverviewCooldownRemaining(storage, 10_000), 120_000);
  assert.equal(getOverviewCooldownRemaining(storage, 70_000), 60_000);
  assert.equal(getOverviewCooldownRemaining(storage, 130_000), 0);
});

test("malformed or future cooldown timestamps do not lock the page", () => {
  const malformed = createStorage({ "internal-hub-overview:last-start-v1": "bad" });
  const future = createStorage({ "internal-hub-overview:last-start-v1": "999999" });
  assert.equal(getOverviewCooldownRemaining(malformed, 5_000), 0);
  assert.equal(getOverviewCooldownRemaining(future, 5_000), 0);
});
```

- [ ] **Step 4: Write a failing concurrency test**

```ts
test("runs no more than three Hub workers concurrently and preserves order", async () => {
  let active = 0;
  let maximum = 0;
  const release: Array<() => void> = [];
  const work = [1, 2, 3, 4, 5].map((value) => async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => release.push(resolve));
    active -= 1;
    return value * 10;
  });

  const resultPromise = runWithConcurrency(work, 3);
  await Promise.resolve();
  assert.equal(active, 3);
  while (release.length) {
    release.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.deepEqual(await resultPromise, [10, 20, 30, 40, 50]);
  assert.equal(maximum, 3);
});
```

- [ ] **Step 5: Run the focused tests and verify failure**

```powershell
node --experimental-strip-types --test tests/internalHubOverview.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/internalHubOverview.ts`.

- [ ] **Step 6: Implement the pure model and helpers**

Create `src/utils/internalHubOverview.ts` with these exact public types and constants:

```ts
import type { TransferOrder } from "../components/TOTable";
import type { LooseOrderSummary } from "./looseOrders";
import { summarizePackedOrders, type PackedOrderMetrics } from "./packedOrderMetrics";

export const OVERVIEW_COOLDOWN_MS = 120_000;
export const OVERVIEW_COOLDOWN_KEY = "internal-hub-overview:last-start-v1";
export const OVERVIEW_HUB_CONCURRENCY = 3;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HubDefinition { name: string; id: string }
export type HubOverviewStatus = "idle" | "loading" | "success" | "error";
export type BranchResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface HubOverviewRow {
  name: string;
  id: string;
  status: HubOverviewStatus;
  loose: { data: LooseOrderSummary | null; error: string | null; stale: boolean };
  packed: {
    orders: TransferOrder[];
    metrics: PackedOrderMetrics;
    hasData: boolean;
    error: string | null;
    stale: boolean;
  };
  updatedAt: number | null;
}

export interface OverviewConfigInput {
  soc: string;
  socId: string;
  cookies: string;
  hubs: HubDefinition[];
}

export interface OverviewTotals {
  completedHubs: number;
  totalHubs: number;
  looseTotal: number;
  looseDg: number;
  looseGtc: number;
  packedTo: number;
  packedQuantity: number;
  packedDg: number;
  packedGtc: number;
  latestUpdatedAt: number | null;
}
```

Implement the functions with these semantics:

```ts
export const createInitialHubRows = (hubs: readonly HubDefinition[]): HubOverviewRow[] =>
  hubs.map(({ name, id }) => ({
    name,
    id,
    status: "idle",
    loose: { data: null, error: null, stale: false },
    packed: {
      orders: [],
      metrics: { totalQuantity: 0, dgBagCount: 0, gtcBagCount: 0 },
      hasData: false,
      error: null,
      stale: false,
    },
    updatedAt: null,
  }));

export const validateOverviewConfig = (input: OverviewConfigInput): string | null => {
  if (!input.soc.trim()) return "Chưa cấu hình SOC nguồn.";
  if (!input.socId.trim()) return "SOC nguồn chưa có ID.";
  if (!input.cookies.trim()) return "Chưa có Cookie SPX.";
  if (input.hubs.length === 0) return "Chưa cấu hình Hub nội tỉnh.";
  const missing = input.hubs.filter((hub) => !hub.id.trim()).map((hub) => hub.name);
  return missing.length ? `Các Hub chưa có ID: ${missing.join(", ")}` : null;
};
```

`beginHubRefresh` sets `status: "loading"`, clears branch errors, and keeps old data. `mergeHubBranchResult` replaces a successful branch; on failure it keeps old data, writes the error, and marks `stale` only when old data exists. `finishHubRefresh` sets `updatedAt` only if at least one branch succeeded and derives `success` versus `error` from branch errors. `summarizeOverview` adds only branches with data, counts a Hub completed when `updatedAt !== null`, and selects the maximum `updatedAt`.

Implement cooldown defensively: accept only a finite timestamp `<= now`; return `Math.max(0, OVERVIEW_COOLDOWN_MS - (now - startedAt))`; wrap storage reads/writes in `try/catch`. Implement `runWithConcurrency<T>(tasks, limit)` with `Math.min(limit, tasks.length)` async workers consuming a shared next index and writing results at the original index; throw when `limit < 1`.

- [ ] **Step 7: Add the test file to `npm test` and verify**

Append `tests/internalHubOverview.test.ts` to the current `package.json` `test` script, then run:

```powershell
node --experimental-strip-types --test tests/internalHubOverview.test.ts
npm test
```

Expected: focused tests PASS and all existing tests remain green.

- [ ] **Step 8: Commit the pure model slice**

```powershell
git add src/utils/internalHubOverview.ts tests/internalHubOverview.test.ts package.json
git commit -m "feat: model internal hub overview"
```

---

### Task 2: Per-Hub API service with independent branches

**Files:**
- Create: `src/utils/internalHubOverviewApi.ts`
- Modify: `tests/internalHubOverview.test.ts`

**Interfaces:**
- Consumes: SOC name/ID, Hub definition and current epoch seconds.
- Produces: `createPackedOrdersSearchPath`, `parsePackedOrdersForSoc`, and `fetchHubOverviewBranches` returning independent `BranchResult` values.

- [ ] **Step 1: Add failing URL and response tests**

Append:

```ts
import {
  createPackedOrdersSearchPath,
  parsePackedOrdersForSoc,
} from "../src/utils/internalHubOverviewApi.ts";

test("builds the exact seven-day packed-order search URL", () => {
  assert.equal(
    createPackedOrdersSearchPath("44-GLI An Khe Hub", 1_000_000),
    "/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=44-GLI%20An%20Khe%20Hub&status=2&ctime=395200,1000000",
  );
});

test("keeps only packed orders currently at the configured SOC", () => {
  const response = {
    data: { list: [
      { to_number: "A", current_station_name: "Pleiku SOC" },
      { to_number: "B", current_station_name: "Other SOC" },
    ] },
  };
  assert.deepEqual(
    parsePackedOrdersForSoc(response, "Pleiku SOC").map((item) => item.to_number),
    ["A"],
  );
});
```

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
node --experimental-strip-types --test tests/internalHubOverview.test.ts
```

Expected: FAIL because `internalHubOverviewApi.ts` does not exist.

- [ ] **Step 3: Implement packed parsing and the two-branch request**

Create `src/utils/internalHubOverviewApi.ts`:

```ts
import apiClient from "./apiClient";
import type { TransferOrder } from "../components/TOTable";
import { fetchLooseOrderSummary } from "./looseOrdersApi";
import type { BranchResult, HubDefinition } from "./internalHubOverview";
import type { LooseOrderSummary } from "./looseOrders";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export const createPackedOrdersSearchPath = (hubName: string, nowSeconds: number): string => {
  const from = nowSeconds - SEVEN_DAYS_SECONDS;
  return `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(hubName)}&status=2&ctime=${from},${nowSeconds}`;
};

export const parsePackedOrdersForSoc = (payload: unknown, soc: string): TransferOrder[] => {
  const root = payload as { data?: { list?: unknown } } | null;
  const list = Array.isArray(root?.data?.list) ? root.data.list : [];
  return list.filter(
    (item): item is TransferOrder =>
      typeof item === "object" && item !== null &&
      (item as { current_station_name?: unknown }).current_station_name === soc,
  );
};

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "Không thể tải dữ liệu.";

export interface HubBranchResults {
  loose: BranchResult<LooseOrderSummary>;
  packed: BranchResult<TransferOrder[]>;
}

export const fetchHubOverviewBranches = async (
  soc: string,
  socId: string,
  hub: HubDefinition,
  nowSeconds: number,
): Promise<HubBranchResults> => {
  const [packed, loose] = await Promise.allSettled([
    apiClient.get(createPackedOrdersSearchPath(hub.name, nowSeconds), { suppressErrorToast: true }),
    fetchLooseOrderSummary(socId, [hub.id]),
  ]);
  return {
    packed: packed.status === "fulfilled"
      ? { ok: true, data: parsePackedOrdersForSoc(packed.value.data, soc) }
      : { ok: false, error: errorMessage(packed.reason) },
    loose: loose.status === "fulfilled"
      ? { ok: true, data: loose.value }
      : { ok: false, error: errorMessage(loose.reason) },
  };
};
```

Verify the `apiClient.get` option type supports `suppressErrorToast`; if TypeScript rejects it, match the existing Axios augmentation used by `apiClient` without changing runtime behavior.

- [ ] **Step 4: Run tests, lint and type-check**

```powershell
node --experimental-strip-types --test tests/internalHubOverview.test.ts
npx eslint src/utils/internalHubOverview.ts src/utils/internalHubOverviewApi.ts tests/internalHubOverview.test.ts
node node_modules/typescript/lib/tsc.js -b
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the API slice**

```powershell
git add src/utils/internalHubOverviewApi.ts tests/internalHubOverview.test.ts
git commit -m "feat: fetch overview data per Hub"
```

---

### Task 3: Responsive Overview table and mobile cards

**Files:**
- Create: `src/components/InternalHubOverviewTable.tsx`

**Interfaces:**
- Consumes: `rows: readonly HubOverviewRow[]`, `totals: OverviewTotals`, `selectedHubName: string | null`, and `onSelectHub(name: string): void`.
- Produces: desktop comparison table, mobile cards, total row and accessible detail actions without issuing requests.

- [ ] **Step 1: Implement the presentation component**

Create `src/components/InternalHubOverviewTable.tsx` with:

```ts
interface InternalHubOverviewTableProps {
  rows: readonly HubOverviewRow[];
  totals: OverviewTotals;
  selectedHubName: string | null;
  onSelectHub: (name: string) => void;
}
```

Add module-level helpers `formatMetric(value, available)` returning `—` when the branch has no data and `Intl.NumberFormat("vi-VN")` otherwise; `formatUpdatedAt`; and a `StatusBadge` mapping `idle/loading/success/error` to text plus DaisyUI neutral/info/success/error classes.

Desktop markup (`hidden md:block`) must use grouped headers:

```tsx
<thead>
  <tr>
    <th rowSpan={2}>Hub</th>
    <th colSpan={3}>Hàng xá lẻ</th>
    <th colSpan={4}>Hàng đã đóng bao</th>
    <th rowSpan={2}>Trạng thái</th>
    <th rowSpan={2}>Cập nhật</th>
    <th rowSpan={2}>Chi tiết</th>
  </tr>
  <tr>
    <th>Tổng</th><th>DG</th><th>GTC</th>
    <th>TO</th><th>Kiện</th><th>DG</th><th>GTC</th>
  </tr>
</thead>
```

Each row reads loose metrics only when `row.loose.data !== null`, packed metrics only when `row.packed.hasData`, and shows branch error messages under the Hub name. The detail button is enabled when `row.packed.hasData`, toggles selection, is at least 44 px high, and says `Đóng chi tiết` for the selected Hub. Add a footer row using `totals`, with `Hoàn tất {completedHubs}/{totalHubs} Hub`.

Mobile markup (`space-y-3 md:hidden`) renders one bordered card per Hub. Header contains Hub name, `StatusBadge`, updated time and errors. Two 3/4-cell grids show the loose and packed values. The detail button follows the same enable/toggle rule. Use `tabular-nums`, `break-safe`, semantic labels, and no fixed widths.

- [ ] **Step 2: Run component lint and type-check**

```powershell
npx eslint src/components/InternalHubOverviewTable.tsx
node node_modules/typescript/lib/tsc.js -b
```

Expected: both commands exit 0.

- [ ] **Step 3: Commit the presentation component**

```powershell
git add src/components/InternalHubOverviewTable.tsx
git commit -m "feat: render internal Hub overview table"
```

---

### Task 4: Overview page orchestration and detail

**Files:**
- Create: `src/pages/InternalHubOverviewPage.tsx`

**Interfaces:**
- Consumes: config getters, pure overview utilities, `fetchHubOverviewBranches`, `InternalHubOverviewTable`, `PageHeader`, `SectionHeading`, `TOTable`, and `showToast`.
- Produces: manual whole-network refresh, progressive Hub updates, cooldown countdown, headline totals and selected-Hub TO detail.

- [ ] **Step 1: Initialize configuration, rows and cooldown**

Create the page with module constants `COOLDOWN_TICK_MS = 1_000` and `DETAIL_STORAGE_KEY = "tuy-chon-overview-noi-tinh"`. On the initial state initializer, read:

```ts
const hubs = getHubs().map((name) => ({ name, id: getStationId(name) }));
```

Store `soc`, `hubs`, `rows`, `selectedHubName`, `running`, and `cooldownRemaining`. A one-second effect recalculates `getOverviewCooldownRemaining(localStorage, Date.now())` while remaining is positive and clears its interval on unmount.

Derive `totals = useMemo(() => summarizeOverview(rows), [rows])` and `selectedRow` by name. When the Hub configuration changes on a later mount, build fresh idle rows; results do not need to persist beyond the mounted session.

- [ ] **Step 2: Implement validation, cooldown and three-worker refresh**

Implement `handleRefresh` in this exact order:

1. Return when `running` or current cooldown is positive.
2. Re-read `soc`, `socId`, `cookies`, names and IDs from config.
3. Call `validateOverviewConfig`; show an error toast and return without cooldown on failure.
4. Call `startOverviewCooldown(localStorage, Date.now())`, set remaining to `OVERVIEW_COOLDOWN_MS`, and set `running=true`. Do not mark every row loading at once.
5. Create one task per Hub. At task start, update only that Hub with its fresh name/ID and `beginHubRefresh`; this ensures at most 3 rows display active loading. Await `fetchHubOverviewBranches(soc, socId, hub, Math.floor(Date.now()/1000))`. Merge loose and packed results, finish with `Date.now()`, update only that named row through functional `setRows`, and return `{ hubName, branches }` from the task.
6. Await `const runResults = await runWithConcurrency(tasks, OVERVIEW_HUB_CONCURRENCY)` in `try/finally`; always set `running=false`.
7. Count `runResults` whose loose or packed branch has `ok: false`. Show a success toast when the count is zero, otherwise a warning toast stating the exact number of Hubs containing an error. Do not read `rows` immediately after `setRows`, because React state has not committed synchronously.

Use a mounted ref or generation ref so a completed request does not set state after unmount and a stale run cannot overwrite a later run.

- [ ] **Step 3: Render headline metrics and overview table**

Use `PageHeader` with `LayoutDashboard`, title `Overview nội tỉnh`, a description referencing the SOC, and one primary action button. Button text rules:

```ts
running
  ? "Đang kiểm tra toàn bộ Hub"
  : cooldownRemaining > 0
    ? `Làm mới sau ${formatCountdown(cooldownRemaining)}`
    : totals.latestUpdatedAt
      ? "Làm mới"
      : "Kiểm tra toàn bộ";
```

Disable it while running or cooldown is positive. Render six summary cards: Hub hoàn tất, xá lẻ, TO, kiện, bao DG and bao GTC. DG/GTC cards may show packed totals only, with explicit labels `Bao DG` and `Bao GTC`. Display last-updated time beneath the cards.

Under a `SectionHeading` titled `Tổng quan theo Hub`, render `InternalHubOverviewTable`. When there are no Hubs, render a settings-oriented empty state and do not render an empty table.

- [ ] **Step 4: Render selected-Hub TO detail without new requests**

When `selectedRow?.packed.hasData` is true, render a section below the Overview:

```tsx
<SectionHeading
  icon={PackageCheck}
  id="overview-hub-detail"
  title={`Chi tiết TO — ${selectedRow.name}`}
  description={`${selectedRow.packed.orders.length} Transfer Order trong kết quả gần nhất`}
  tone="success"
/>
{selectedRow.packed.stale && selectedRow.packed.error && (
  <div role="alert" className="alert alert-warning">Đang hiển thị kết quả cũ: {selectedRow.packed.error}</div>
)}
<TOTable
  orders={selectedRow.packed.orders}
  storageKey={DETAIL_STORAGE_KEY}
  emptyTitle={`Không có TO sót tới ${selectedRow.name}`}
  emptyDescription="Hub này không có Transfer Order trong kết quả kiểm tra gần nhất."
/>
```

The table callback toggles `selectedHubName`; refreshing does not close it.

- [ ] **Step 5: Run lint, tests and build**

```powershell
npx eslint src/pages/InternalHubOverviewPage.tsx src/components/InternalHubOverviewTable.tsx src/utils/internalHubOverview.ts src/utils/internalHubOverviewApi.ts
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the page slice**

```powershell
git add src/pages/InternalHubOverviewPage.tsx
git commit -m "feat: add internal Hub overview page"
```

---

### Task 5: Route, navigation and final QA

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/layouts/MobileLayout.tsx`

**Interfaces:**
- Consumes: `InternalHubOverviewPage` from Task 4.
- Produces: discoverable route `/check-sot/noi-tinh/overview` and drawer link `Overview nội tỉnh`.

- [ ] **Step 1: Register the route**

Import `InternalHubOverviewPage` and add immediately before the current internal-check route:

```tsx
<Route
  path="/check-sot/noi-tinh/overview"
  element={<InternalHubOverviewPage />}
/>
```

- [ ] **Step 2: Add the navigation item**

Import `LayoutDashboard` from Lucide and add immediately before `Check sót nội tỉnh`:

```ts
{
  path: "/check-sot/noi-tinh/overview",
  label: "Overview nội tỉnh",
  icon: LayoutDashboard,
},
```

Keep exact-path active matching so Overview and the single-Hub page do not both appear active.

- [ ] **Step 3: Run the complete automated verification**

```powershell
npm test
npm run lint
npm run build
git diff --check HEAD~5..HEAD
git status --short
```

Expected: all tests pass, lint/build exit 0, no whitespace errors, and `.superpowers/` plus `scanner-dist/scanner-dist.zip` remain untracked and unstaged.

- [ ] **Step 4: Perform responsive browser QA**

Run the app locally and verify at approximately 390 px and 1024 px:

- drawer opens the new `Overview nội tỉnh` route;
- no-Hub and missing-ID validation sends no network requests and creates no cooldown;
- a valid run disables the button immediately and displays a 02:00 countdown;
- reload during cooldown keeps the button disabled;
- no more than 3 Hubs show active loading work at once;
- completed Hub metrics appear progressively while other Hubs load;
- one branch failure preserves the sibling data and shows a readable error;
- mobile cards have no horizontal page overflow;
- desktop grouped table contains all specified columns and total row;
- opening Hub detail reuses its already-loaded orders and sends no new request;
- refreshing keeps the detail section open and replaces it only on packed success;
- after 120 seconds the button becomes enabled without auto-running.

Use mocked/dev responses if live credentials are unavailable; verify the request count and concurrency through the browser network/log instrumentation, not by repeatedly hitting production APIs.

- [ ] **Step 5: Commit route and navigation**

```powershell
git add src/App.tsx src/layouts/MobileLayout.tsx
git commit -m "feat: link internal Hub overview"
```

- [ ] **Step 6: Review the final scoped diff**

```powershell
git diff HEAD~5..HEAD -- package.json src/App.tsx src/layouts/MobileLayout.tsx src/pages/InternalHubOverviewPage.tsx src/components/InternalHubOverviewTable.tsx src/utils/internalHubOverview.ts src/utils/internalHubOverviewApi.ts tests/internalHubOverview.test.ts
```

Confirm the diff contains only the Overview model, API orchestration, UI, route, navigation and tests; confirm the existing `CheckSotNoiTinhPage`, scanner, QR, TO request contracts and settings data model are unchanged.
