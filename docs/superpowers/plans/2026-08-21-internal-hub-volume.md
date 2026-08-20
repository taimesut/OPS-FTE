# Internal Hub Volume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent `Volume nội tỉnh` tab that refreshes every configured Hub in one action and displays only each response's `data.total`.

**Architecture:** Keep the existing internal-Hub overview unchanged. Put request-contract parsing, row aggregation, validation, and persistent cooldown logic in a pure utility; put HTTP access in a small API adapter; and let one page component coordinate `Promise.allSettled`-style independent Hub results for a focused responsive table.

**Tech Stack:** React 19, TypeScript 6, React Router 7, Axios API client, Tailwind CSS 4, DaisyUI 5, Lucide React, Node test runner.

## Global Constraints

- Use `POST /api/fleet_order/order/tracking_list/search` once per configured Hub.
- Send exactly `order_status: "8,33"`, `count: 24`, `page_no: 1`, configured SOC ID as `current_station_ids`, and that Hub's ID as `next_station_ids`.
- Parse and render only `data.total`; ignore `data.list`.
- A single refresh launches all Hub requests in parallel and preserves independent success/error results.
- Disable refresh while requests run and for 10 seconds from refresh start; persist the start timestamp in `localStorage`.
- Do not auto-refresh on page load and do not change the existing Overview nội tỉnh page.
- Reuse the existing configured Cookie, SOC, SOC ID, Hub list, Hub IDs, API client, toast, and application visual language.

---

## File Structure

- Create `src/utils/internalHubVolume.ts`: pure payload, response parser, config validation, row aggregation, and cooldown helpers.
- Create `src/utils/internalHubVolumeApi.ts`: HTTP adapter for one Hub volume request.
- Create `src/components/InternalHubVolumeTable.tsx`: responsive, presentational table for Hub rows.
- Create `src/pages/InternalHubVolumePage.tsx`: configuration loading, parallel refresh orchestration, cooldown timer, summary cards, and page states.
- Create `tests/internalHubVolume.test.ts`: unit and API-adapter contract coverage.
- Modify `src/App.tsx`: register the new route.
- Modify `src/layouts/MobileLayout.tsx`: add the new navigation item.
- Modify `package.json`: include the new test file in `npm test`.

### Task 1: Pure volume domain contract

**Files:**
- Create: `src/utils/internalHubVolume.ts`
- Create: `tests/internalHubVolume.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `HubVolumeDefinition`, `HubVolumeRow`, `HubVolumeSummary`, `INTERNAL_HUB_VOLUME_PATH`, `INTERNAL_HUB_VOLUME_COOLDOWN_MS`, `createInternalHubVolumePayload(currentStationId, nextStationId)`, `parseInternalHubVolumeResponse(payload)`, `createInternalHubVolumeRows(hubs)`, `validateInternalHubVolumeConfig(input)`, `summarizeInternalHubVolume(rows)`, `getInternalHubVolumeCooldownRemaining(storage, now)`, and `startInternalHubVolumeCooldown(storage, now)`.
- Consumes: no application runtime dependencies; define a local `StorageLike` interface with `getItem` and `setItem`.

- [ ] **Step 1: Add failing request-contract and parser tests**

Create `tests/internalHubVolume.test.ts` with these initial cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createInternalHubVolumePayload,
  INTERNAL_HUB_VOLUME_PATH,
  parseInternalHubVolumeResponse,
} from "../src/utils/internalHubVolume.ts";

test("builds the exact internal-Hub volume request", () => {
  assert.equal(INTERNAL_HUB_VOLUME_PATH, "/api/fleet_order/order/tracking_list/search");
  assert.deepEqual(createInternalHubVolumePayload(" 1030 ", " 1812 "), {
    order_status: "8,33",
    count: 24,
    next_station_ids: "1812",
    current_station_ids: "1030",
    page_no: 1,
  });
});

test("rejects missing station IDs", () => {
  assert.throws(() => createInternalHubVolumePayload("", "1812"), /SOC.*ID/i);
  assert.throws(() => createInternalHubVolumePayload("1030", ""), /Hub.*ID/i);
});

test("parses only a finite non-negative data.total", () => {
  assert.equal(parseInternalHubVolumeResponse({
    retcode: 0,
    data: { total: 191, list: [{ tracking_number: "ignored" }] },
  }), 191);
  for (const payload of [
    null,
    { retcode: 1, message: "Không có quyền" },
    { retcode: 0, data: {} },
    { retcode: 0, data: { total: "191" } },
    { retcode: 0, data: { total: -1 } },
    { retcode: 0, data: { total: Number.NaN } },
  ]) {
    assert.throws(() => parseInternalHubVolumeResponse(payload), /total|quyền|hợp lệ/i);
  }
});
```

- [ ] **Step 2: Register and run the focused test to verify failure**

Append `tests/internalHubVolume.test.ts` to the existing `test` command in `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/internalHubVolume.test.ts
```

Expected: FAIL because `src/utils/internalHubVolume.ts` does not exist.

- [ ] **Step 3: Implement the exact payload and strict total parser**

Create the utility with these contracts:

```ts
export const INTERNAL_HUB_VOLUME_PATH =
  "/api/fleet_order/order/tracking_list/search";
export const INTERNAL_HUB_VOLUME_COOLDOWN_MS = 10_000;
export const INTERNAL_HUB_VOLUME_COOLDOWN_KEY =
  "internal-hub-volume:last-start-v1";

export const createInternalHubVolumePayload = (
  currentStationId: string,
  nextStationId: string,
) => {
  const currentId = currentStationId.trim();
  const nextId = nextStationId.trim();
  if (!currentId) throw new Error("SOC nguồn chưa có ID.");
  if (!nextId) throw new Error("Hub nội tỉnh chưa có ID.");
  return {
    order_status: "8,33",
    count: 24,
    next_station_ids: nextId,
    current_station_ids: currentId,
    page_no: 1,
  } as const;
};

export const parseInternalHubVolumeResponse = (payload: unknown): number => {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Phản hồi volume không hợp lệ.");
  }
  const root = payload as { retcode?: unknown; message?: unknown; data?: unknown };
  if (root.retcode !== 0) {
    throw new Error(
      typeof root.message === "string" && root.message.trim()
        ? root.message
        : "Không thể tải volume nội tỉnh.",
    );
  }
  if (typeof root.data !== "object" || root.data === null) {
    throw new Error("Phản hồi volume thiếu data.total hợp lệ.");
  }
  const total = (root.data as { total?: unknown }).total;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
    throw new Error("Phản hồi volume có data.total không hợp lệ.");
  }
  return total;
};
```

- [ ] **Step 4: Add failing state, validation, summary, and cooldown tests**

Extend the same test file with explicit row and storage cases:

```ts
test("creates rows and summarizes only successful Hub totals", () => {
  const rows = createInternalHubVolumeRows([
    { name: "Hub A", id: "101" },
    { name: "Hub B", id: "102" },
  ]);
  rows[0] = { ...rows[0], status: "success", total: 12, updatedAt: 2_000 };
  rows[1] = { ...rows[1], status: "error", error: "Timeout" };
  assert.deepEqual(summarizeInternalHubVolume(rows), {
    successfulHubs: 1,
    totalHubs: 2,
    totalVolume: 12,
    latestUpdatedAt: 2_000,
  });
});

test("validates every required configuration value", () => {
  assert.match(validateInternalHubVolumeConfig({ soc: "", socId: "1", cookies: "x", hubs: [] }) ?? "", /SOC/i);
  assert.match(validateInternalHubVolumeConfig({ soc: "SOC", socId: "", cookies: "x", hubs: [] }) ?? "", /ID/i);
  assert.match(validateInternalHubVolumeConfig({ soc: "SOC", socId: "1", cookies: "", hubs: [] }) ?? "", /Cookie/i);
  assert.match(validateInternalHubVolumeConfig({ soc: "SOC", socId: "1", cookies: "x", hubs: [] }) ?? "", /Hub/i);
  assert.match(validateInternalHubVolumeConfig({ soc: "SOC", socId: "1", cookies: "x", hubs: [{ name: "Hub A", id: "" }] }) ?? "", /Hub A/);
});

test("persists and expires the ten-second cooldown safely", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  startInternalHubVolumeCooldown(storage, 5_000);
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 5_000), 10_000);
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 12_500), 2_500);
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 15_000), 0);
  values.set(INTERNAL_HUB_VOLUME_COOLDOWN_KEY, "bad");
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 20_000), 0);
  values.set(INTERNAL_HUB_VOLUME_COOLDOWN_KEY, "999999");
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 20_000), 0);
});
```

- [ ] **Step 5: Implement row types, validation, summary, and safe storage helpers**

Use these exact public shapes:

```ts
export interface HubVolumeDefinition { name: string; id: string }
export type HubVolumeStatus = "idle" | "loading" | "success" | "error";
export interface HubVolumeRow extends HubVolumeDefinition {
  status: HubVolumeStatus;
  total: number | null;
  error: string | null;
  updatedAt: number | null;
}
export interface HubVolumeSummary {
  successfulHubs: number;
  totalHubs: number;
  totalVolume: number;
  latestUpdatedAt: number | null;
}
```

Implement `createInternalHubVolumeRows` as an ordered map to idle rows, validate SOC name/ID, Cookie, non-empty Hub list, and every Hub ID, reduce only rows with `status === "success" && total !== null`, and mirror the existing Overview storage guards so blocked, malformed, negative, or future timestamps return zero.

- [ ] **Step 6: Run focused tests and commit the domain contract**

```powershell
node --experimental-strip-types --test tests/internalHubVolume.test.ts
git add package.json tests/internalHubVolume.test.ts src/utils/internalHubVolume.ts
git commit -m "feat: add internal hub volume domain contract"
```

Expected: all focused tests PASS.

### Task 2: One-Hub API adapter and independent parallel results

**Files:**
- Create: `src/utils/internalHubVolumeApi.ts`
- Modify: `tests/internalHubVolume.test.ts`

**Interfaces:**
- Consumes: `INTERNAL_HUB_VOLUME_PATH`, `createInternalHubVolumePayload`, and `parseInternalHubVolumeResponse` from Task 1.
- Produces: `fetchInternalHubVolume(currentStationId: string, nextStationId: string, dependency?: InternalHubVolumeApiDependency): Promise<number>` and `fetchAllInternalHubVolumes(currentStationId: string, hubs: readonly HubVolumeDefinition[], dependency?: InternalHubVolumeApiDependency): Promise<HubVolumeFetchResult[]>`.

- [ ] **Step 1: Write failing API-adapter tests**

Add tests that capture the URL, payload, and independent results:

```ts
test("posts the exact volume payload and returns data.total", async () => {
  const calls: unknown[][] = [];
  const total = await fetchInternalHubVolume("1030", "1812", {
    post: async (...args) => {
      calls.push(args);
      return { data: { retcode: 0, data: { total: 191, list: [] } } };
    },
  });
  assert.equal(total, 191);
  assert.deepEqual(calls, [[
    "/api/fleet_order/order/tracking_list/search",
    {
      order_status: "8,33",
      count: 24,
      next_station_ids: "1812",
      current_station_ids: "1030",
      page_no: 1,
    },
    { suppressErrorToast: true },
  ]]);
});

test("runs every Hub request concurrently and keeps failures independent", async () => {
  let active = 0;
  let maximum = 0;
  const result = await fetchAllInternalHubVolumes(
    "1030",
    [{ name: "Hub A", id: "101" }, { name: "Hub B", id: "102" }],
    {
      post: async (_path, payload) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        const id = (payload as { next_station_ids: string }).next_station_ids;
        if (id === "102") throw new Error("Timeout");
        return { data: { retcode: 0, data: { total: 7 } } };
      },
    },
  );
  assert.equal(maximum, 2);
  assert.deepEqual(result, [
    { hub: { name: "Hub A", id: "101" }, ok: true, total: 7 },
    { hub: { name: "Hub B", id: "102" }, ok: false, error: "Timeout" },
  ]);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

```powershell
node --experimental-strip-types --test tests/internalHubVolume.test.ts
```

Expected: FAIL because the API adapter exports do not exist.

- [ ] **Step 3: Implement the API adapter with injected dependencies**

Define the dependency and result union exactly:

```ts
export interface InternalHubVolumeApiDependency {
  post(
    path: string,
    payload: ReturnType<typeof createInternalHubVolumePayload>,
    options: { suppressErrorToast: true },
  ): Promise<{ data: unknown }>;
}

export type HubVolumeFetchResult =
  | { hub: HubVolumeDefinition; ok: true; total: number }
  | { hub: HubVolumeDefinition; ok: false; error: string };
```

`fetchInternalHubVolume` dynamically falls back to the existing `apiClient`, posts with `{ suppressErrorToast: true }`, and parses the response. `fetchAllInternalHubVolumes` calls `Promise.all` over every Hub, catches inside each mapped promise, and returns results in configured Hub order.

- [ ] **Step 4: Run focused tests and commit the API layer**

```powershell
node --experimental-strip-types --test tests/internalHubVolume.test.ts
git add tests/internalHubVolume.test.ts src/utils/internalHubVolumeApi.ts
git commit -m "feat: fetch all internal hub volumes"
```

Expected: all focused tests PASS.

### Task 3: Responsive volume page and table

**Files:**
- Create: `src/components/InternalHubVolumeTable.tsx`
- Create: `src/pages/InternalHubVolumePage.tsx`

**Interfaces:**
- Consumes: configuration getters from `src/utils/config.ts`, toast from `src/components/Toast.tsx`, UI primitives `PageHeader` and `SectionHeading`, Task 1 row/summary/cooldown helpers, and Task 2 `fetchAllInternalHubVolumes`.
- Produces: `InternalHubVolumeTable({ rows })` and `InternalHubVolumePage`.

- [ ] **Step 1: Build the presentational table with accessible states**

Implement `InternalHubVolumeTable` with a semantic table inside `overflow-x-auto`, `aria-label="Volume theo Hub nội tỉnh"`, and columns `Hub`, `Station ID`, `Tổng lượng hàng`, `Trạng thái`. Format totals with `Intl.NumberFormat("vi-VN")`. Render:

```tsx
const STATUS_LABELS = {
  idle: "Chưa kiểm tra",
  loading: "Đang kiểm tra",
  success: "Thành công",
  error: "Lỗi",
} as const;
```

Use the existing DaisyUI badge/loading patterns, show `—` when `total === null`, and show each row's error below its error badge without exposing raw response objects.

- [ ] **Step 2: Build page initialization and derived summary**

In `InternalHubVolumePage`, read configuration into:

```ts
const readHubs = (): HubVolumeDefinition[] =>
  getHubs().map((name) => ({ name, id: getStationId(name) }));
```

Initialize rows from configured Hubs, keep `running`, `cooldownRemaining`, and `lastCompletedAt` state, derive `summary` with `useMemo`, and refresh the cooldown once per second with an effect that cleans up its interval.

- [ ] **Step 3: Implement the single parallel refresh event**

The click handler must:

1. Return early if `running`, an active-request ref is set, or persisted cooldown remains.
2. Re-read SOC, SOC ID, Cookie, and Hubs so saved settings take effect without reloading.
3. Call `validateInternalHubVolumeConfig`; show one error toast and send no request when invalid.
4. Persist the cooldown start, set every current row to `loading`, and call `fetchAllInternalHubVolumes(socId, hubs)` once.
5. Map each result to a success row with `total` and `updatedAt`, or an error row with `total: null`, `error`, and `updatedAt: null`.
6. Set the common completion timestamp, show a success toast when all Hubs succeed or a warning toast with the error count, and clear the running guard in `finally`.

- [ ] **Step 4: Compose the page header, metrics, empty state, and table**

Use `PageHeader` with title `Volume nội tỉnh`, description ``Tổng lượng hàng từ ${soc || "SOC nguồn"} tới toàn bộ Hub nội tỉnh``, and one primary button. Label it `Đang kiểm tra toàn bộ Hub` while running, `Làm mới sau Ns` during cooldown, `Làm mới` after results, and `Kiểm tra toàn bộ` initially.

Render two compact summary cards using the same `app-surface` and typography classes as `SummaryCard` in `InternalHubOverviewPage.tsx`:

- `Tổng lượng hàng`: formatted `summary.totalVolume` after at least one success, otherwise `—`.
- `Hub thành công`: `${summary.successfulHubs}/${summary.totalHubs}`.

Render the completion timestamp in `Asia/Bangkok`. If no Hubs exist, show the same Cài đặt guidance pattern as the Overview page; otherwise render `InternalHubVolumeTable`.

- [ ] **Step 5: Run static quality checks for the new UI**

```powershell
npx eslint src/components/InternalHubVolumeTable.tsx src/pages/InternalHubVolumePage.tsx
npx tsc -b --pretty false
```

Expected: both commands exit successfully with no diagnostics.

- [ ] **Step 6: Commit the page and table**

```powershell
git add src/components/InternalHubVolumeTable.tsx src/pages/InternalHubVolumePage.tsx
git commit -m "feat: add internal hub volume page"
```

### Task 4: Route, navigation, and release verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/layouts/MobileLayout.tsx`
- Modify: `tests/internalHubVolume.test.ts`

**Interfaces:**
- Consumes: `InternalHubVolumePage` from Task 3.
- Produces: reachable `/check-sot/noi-tinh/volume` page and `Volume nội tỉnh` navigation item.

- [ ] **Step 1: Add a failing source-wiring regression test**

Use `node:fs` in `tests/internalHubVolume.test.ts` to verify stable integration strings:

```ts
import { readFileSync } from "node:fs";

test("wires the internal-Hub volume route and navigation item", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const layout = readFileSync(
    new URL("../src/layouts/MobileLayout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /path="\/check-sot\/noi-tinh\/volume"/);
  assert.match(layout, /path:\s*"\/check-sot\/noi-tinh\/volume"/);
  assert.match(layout, /label:\s*"Volume nội tỉnh"/);
});
```

- [ ] **Step 2: Run the integration test to verify failure**

```powershell
node --experimental-strip-types --test tests/internalHubVolume.test.ts
```

Expected: FAIL because the route and navigation item are absent.

- [ ] **Step 3: Register the route and navigation item**

In `src/App.tsx`, import `InternalHubVolumePage` and add this route without changing existing routes:

```tsx
<Route
  path="/check-sot/noi-tinh/volume"
  element={<InternalHubVolumePage />}
/>
```

In `src/layouts/MobileLayout.tsx`, import the Lucide outline icon `ChartNoAxesColumnIncreasing` and insert this item directly after `Overview nội tỉnh`:

```ts
{
  path: "/check-sot/noi-tinh/volume",
  label: "Volume nội tỉnh",
  icon: ChartNoAxesColumnIncreasing,
},
```

- [ ] **Step 4: Run focused and full verification**

```powershell
node --experimental-strip-types --test tests/internalHubVolume.test.ts
npm test
npm run lint
npm run build
```

Expected: focused tests, full tests, lint, TypeScript compilation, and Vite production build all pass.

- [ ] **Step 5: Perform responsive visual QA**

Run the dev server and inspect `/check-sot/noi-tinh/volume` at approximately 390px and 1280px widths. Verify the sidebar link is reachable, no horizontal page overflow occurs, the table remains readable, loading/error/success states are visually distinct without relying only on color, and the refresh button remains at least 44px high.

- [ ] **Step 6: Commit integration wiring**

```powershell
git add src/App.tsx src/layouts/MobileLayout.tsx tests/internalHubVolume.test.ts
git commit -m "feat: expose internal hub volume tab"
```

Expected: the working tree contains no uncommitted feature files.
