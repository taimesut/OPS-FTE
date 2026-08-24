# Transfer Order Sender, Classification, and Compact Mobile List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the default-visible Sender field, classify every packed TO into one exclusive DG/GTC category, and replace oversized mobile cards with a compact list without changing API behavior.

**Architecture:** Keep API response types and request flows unchanged. Put exclusive packed-order classification in the existing domain utility, move table column schema/migration/search behavior into a new pure utility, then make `TOTable` and Internal Hub Overview consume those shared results so row badges and aggregate counts cannot diverge.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, DaisyUI 5, Node test runner with `--experimental-strip-types`.

## Global Constraints

- `sender` is labeled `Điểm gửi (Sender)`, is visible by default on desktop and mobile, and remains user-hideable.
- A packed TO belongs to exactly one of `NORMAL`, `DG`, `GTC`, or `DG & GTC`.
- `DG`, `GTC`, and `DG & GTC` aggregate counts are mutually exclusive.
- Apply the new classification only to packed TO data; do not alter loose-order aggregation.
- Replace mobile TO cards with a compact list; do not add an accordion or page-level horizontal scrolling.
- Preserve QR behavior, pagination, refresh/cooldown behavior, API payloads, and API parsers.
- Use a version 2 column-preference schema and migrate legacy arrays once; after migration, respect columns the user hides.
- Do not modify generated deployment artifacts such as `gas/index.html` or `scanner-dist/scanner.html` unless packaging is separately requested.
- Do not modify the unrelated `gas/code.gs` access override. The baseline full suite currently has two known access-control failures; this feature must add no new failures.
- Add no dependencies.

---

## File Structure

- Modify `src/utils/packedOrderMetrics.ts`: own packed-order classification and mutually exclusive aggregate metrics.
- Create `src/utils/transferOrderTable.ts`: own column definitions, versioned preference parsing/serialization, and transfer-order search matching.
- Modify `src/components/TOTable.tsx`: render Sender/classification on desktop, compact rows on mobile, and the new aggregate card.
- Modify `src/utils/internalHubOverview.ts`: carry the combined packed count into per-page totals.
- Modify `src/components/InternalHubOverviewTable.tsx`: render exclusive DG/GTC/combined counts for each Hub and footer.
- Modify `src/pages/InternalHubOverviewPage.tsx`: render the new combined summary card.
- Modify `tests/packedOrderMetrics.test.ts`: specify the four exclusive classifications and aggregate behavior.
- Create `tests/transferOrderTable.test.ts`: specify column migration, search matching, and static UI contracts.
- Modify `tests/internalHubOverview.test.ts`: specify combined metrics and totals in Overview state.
- Modify `package.json`: include the new test file in `npm test`.

---

### Task 1: Model Exclusive Packed-Order Classification

**Files:**
- Modify: `src/utils/packedOrderMetrics.ts`
- Modify: `src/utils/internalHubOverview.ts` (add the required zero value to the existing empty packed-metrics constant only)
- Test: `tests/packedOrderMetrics.test.ts`

**Interfaces:**
- Consumes: packed records with `quantity?: number`, `dg_type?: readonly number[]`, and `high_value?: number`.
- Produces: `PackedOrderClassification`, `classifyPackedOrder(order)`, and `PackedOrderMetrics.dgAndGtcBagCount`.
- Preserves: `isDgType(dgTypes)` and existing metric property names `dgBagCount` and `gtcBagCount`, but changes those two counts to exclusive meanings.

- [ ] **Step 1: Write failing classification tests**

Update the test imports and add the exact four category expectations:

```ts
import {
  classifyPackedOrder,
  isDgType,
  summarizePackedOrders,
} from "../src/utils/packedOrderMetrics.ts";

test("classifies every packed TO into one exclusive category", () => {
  assert.equal(classifyPackedOrder({ dg_type: [1], high_value: 2 }), "normal");
  assert.equal(classifyPackedOrder({ dg_type: [2], high_value: 2 }), "dg");
  assert.equal(classifyPackedOrder({ dg_type: [1], high_value: 1 }), "gtc");
  assert.equal(
    classifyPackedOrder({ dg_type: [1, 3], high_value: 1 }),
    "dg_and_gtc",
  );
});
```

Replace the independent-count assertion with mutually exclusive expected values:

```ts
test("counts packed categories without double counting", () => {
  assert.deepEqual(
    summarizePackedOrders([
      { quantity: 3, dg_type: [], high_value: 2 },
      { quantity: 4, dg_type: [1], high_value: 1 },
      { quantity: 5, dg_type: [2], high_value: 2 },
      { quantity: 6, dg_type: [1, 3], high_value: 1 },
    ]),
    {
      totalQuantity: 18,
      dgBagCount: 1,
      gtcBagCount: 1,
      dgAndGtcBagCount: 1,
    },
  );
});
```

Update empty and missing-data expectations to include `dgAndGtcBagCount: 0`.

- [ ] **Step 2: Run the targeted test and confirm failure**

Run:

```powershell
node --experimental-strip-types --test tests/packedOrderMetrics.test.ts
```

Expected: FAIL because `classifyPackedOrder` and `dgAndGtcBagCount` do not exist and the current reducer double-counts combined TOs.

- [ ] **Step 3: Implement the domain classification**

Add the following public type and function after `isDgType`:

```ts
export type PackedOrderClassification =
  | "normal"
  | "dg"
  | "gtc"
  | "dg_and_gtc";

export const classifyPackedOrder = (
  order: Pick<PackedOrderMetricInput, "dg_type" | "high_value">,
): PackedOrderClassification => {
  const hasDg = isDgType(order.dg_type);
  const hasGtc = order.high_value === 1;
  if (hasDg && hasGtc) return "dg_and_gtc";
  if (hasDg) return "dg";
  if (hasGtc) return "gtc";
  return "normal";
};
```

Extend the metrics interface:

```ts
export interface PackedOrderMetrics {
  totalQuantity: number;
  dgBagCount: number;
  gtcBagCount: number;
  dgAndGtcBagCount: number;
}
```

Change `summarizePackedOrders` to classify each item once and mutate one accumulator in a single pass:

```ts
export const summarizePackedOrders = (
  orders: readonly PackedOrderMetricInput[],
): PackedOrderMetrics => {
  const summary: PackedOrderMetrics = {
    totalQuantity: 0,
    dgBagCount: 0,
    gtcBagCount: 0,
    dgAndGtcBagCount: 0,
  };

  for (const order of orders) {
    summary.totalQuantity += order.quantity || 0;
    const classification = classifyPackedOrder(order);
    if (classification === "dg") summary.dgBagCount += 1;
    if (classification === "gtc") summary.gtcBagCount += 1;
    if (classification === "dg_and_gtc") summary.dgAndGtcBagCount += 1;
  }

  return summary;
};
```

Add `dgAndGtcBagCount: 0` to `EMPTY_PACKED_METRICS` in `src/utils/internalHubOverview.ts` so all existing consumers satisfy the extended interface. Do not change `OverviewTotals` in this task.

- [ ] **Step 4: Run the targeted test and TypeScript check**

Run:

```powershell
node --experimental-strip-types --test tests/packedOrderMetrics.test.ts
node node_modules/typescript/lib/tsc.js -b
```

Expected: packed metrics test PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit the domain change**

```powershell
git add -- src/utils/packedOrderMetrics.ts src/utils/internalHubOverview.ts tests/packedOrderMetrics.test.ts
git commit -m "feat: classify packed order risk flags"
```

---

### Task 2: Add Versioned Transfer-Order Table Preferences and Sender Search

**Files:**
- Create: `src/utils/transferOrderTable.ts`
- Create: `tests/transferOrderTable.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: raw localStorage text and a searchable TO-shaped object.
- Produces: `TRANSFER_ORDER_COLUMNS`, `TransferOrderColumnKey`, `DEFAULT_TRANSFER_ORDER_COLUMNS`, `parseTransferOrderColumns(raw)`, `serializeTransferOrderColumns(columns)`, and `matchesTransferOrderSearch(order, query)`.
- Used by: `TOTable` in Task 3.

- [ ] **Step 1: Write failing column and search tests**

Create `tests/transferOrderTable.test.ts` with these imports and fixtures:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TRANSFER_ORDER_COLUMNS,
  matchesTransferOrderSearch,
  parseTransferOrderColumns,
  serializeTransferOrderColumns,
  TRANSFER_ORDER_COLUMNS,
} from "../src/utils/transferOrderTable.ts";

const order = {
  to_number: "TO-001",
  operator: "Nguyen Van A",
  sender: "Pleiku SOC",
  receiver: "44-GLI Chu Se Hub",
  pack_name: "BAG-001",
};
```

Add exact behavior tests:

```ts
test("defines Sender and one classification column in default order", () => {
  const keys = TRANSFER_ORDER_COLUMNS.map(({ key }) => key);
  assert.deepEqual(keys.slice(0, 6), [
    "to_number",
    "operator",
    "classification",
    "sender",
    "route",
    "pack_name",
  ]);
  assert.ok(DEFAULT_TRANSFER_ORDER_COLUMNS.includes("sender"));
  assert.ok(DEFAULT_TRANSFER_ORDER_COLUMNS.includes("classification"));
  assert.ok(!keys.includes("high_value"));
  assert.ok(!keys.includes("dg_type"));
});

test("migrates legacy column arrays once", () => {
  assert.deepEqual(
    parseTransferOrderColumns(
      JSON.stringify(["to_number", "high_value", "dg_type", "route", "action"]),
    ),
    ["to_number", "classification", "sender", "route", "action"],
  );
});

test("respects hidden Sender in version 2 preferences", () => {
  assert.deepEqual(
    parseTransferOrderColumns(
      JSON.stringify({ version: 2, columns: ["to_number", "route", "action"] }),
    ),
    ["to_number", "route", "action"],
  );
});

test("falls back safely for malformed preferences", () => {
  assert.deepEqual(parseTransferOrderColumns("not-json"), DEFAULT_TRANSFER_ORDER_COLUMNS);
  assert.deepEqual(
    parseTransferOrderColumns(JSON.stringify({ version: 99, columns: [] })),
    DEFAULT_TRANSFER_ORDER_COLUMNS,
  );
});

test("serializes version 2 preferences", () => {
  assert.equal(
    serializeTransferOrderColumns(["to_number", "sender"]),
    JSON.stringify({ version: 2, columns: ["to_number", "sender"] }),
  );
});

test("matches quick search by Sender", () => {
  assert.equal(matchesTransferOrderSearch(order, "pleiku"), true);
  assert.equal(matchesTransferOrderSearch(order, "chu se"), true);
  assert.equal(matchesTransferOrderSearch(order, "missing"), false);
});
```

- [ ] **Step 2: Register and run the new test to confirm failure**

Append `tests/transferOrderTable.test.ts` to the explicit `test` script in `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/transferOrderTable.test.ts
```

Expected: FAIL because `src/utils/transferOrderTable.ts` does not exist.

- [ ] **Step 3: Implement the pure table utility**

Create `src/utils/transferOrderTable.ts` with the canonical columns:

```ts
export const TRANSFER_ORDER_COLUMNS = [
  { key: "to_number", label: "Mã TO" },
  { key: "operator", label: "Người đóng" },
  { key: "classification", label: "Phân loại" },
  { key: "sender", label: "Điểm gửi (Sender)" },
  { key: "route", label: "Điểm đến (Des)" },
  { key: "pack_name", label: "Tên bao" },
  { key: "quantity", label: "Số kiện" },
  { key: "weight", label: "Khối lượng" },
  { key: "status", label: "Trạng thái" },
  { key: "complete_time", label: "Thời gian HT" },
  { key: "action", label: "Thao tác" },
] as const;

export type TransferOrderColumnKey =
  (typeof TRANSFER_ORDER_COLUMNS)[number]["key"];

export const DEFAULT_TRANSFER_ORDER_COLUMNS: TransferOrderColumnKey[] =
  TRANSFER_ORDER_COLUMNS.map(({ key }) => key);
```

Implement preference parsing with a valid-key Set, legacy migration, canonical ordering, defensive JSON parsing, and version 2 serialization. Legacy arrays always add `sender`; they add `classification` when either legacy flag column was present. Version 2 objects only retain valid keys explicitly listed by the user.

Add the structural search interface and matcher:

```ts
export interface SearchableTransferOrder {
  to_number: string;
  operator?: string;
  sender?: string;
  receiver?: string;
  pack_name?: string;
}

export const matchesTransferOrderSearch = (
  order: SearchableTransferOrder,
  query: string,
): boolean => {
  const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
  if (!normalizedQuery) return true;
  return [
    order.to_number,
    order.operator,
    order.sender,
    order.receiver,
    order.pack_name,
  ].some((value) =>
    value?.toLocaleLowerCase("vi-VN").includes(normalizedQuery),
  );
};
```

- [ ] **Step 4: Run the utility tests**

```powershell
node --experimental-strip-types --test tests/transferOrderTable.test.ts
```

Expected: all transfer-order table utility tests PASS.

- [ ] **Step 5: Commit the utility and test registration**

```powershell
git add -- src/utils/transferOrderTable.ts tests/transferOrderTable.test.ts package.json
git commit -m "feat: version transfer order table preferences"
```

---

### Task 3: Render Sender, Exclusive Classification, and Compact Mobile Rows

**Files:**
- Modify: `src/components/TOTable.tsx`
- Test: `tests/transferOrderTable.test.ts`

**Interfaces:**
- Consumes: `classifyPackedOrder`, `PackedOrderClassification`, `summarizePackedOrders`, and every export created in `src/utils/transferOrderTable.ts`.
- Produces: default-visible Sender/classification columns, one classification badge per TO, compact mobile rows, and a `DG & GTC` stats card.
- Preserves: exported `TransferOrder` and `TABLE_COLUMNS` compatibility for current imports/tests.

- [ ] **Step 1: Add failing static UI contract tests**

Extend `tests/transferOrderTable.test.ts`:

```ts
import { readFile } from "node:fs/promises";

test("TOTable renders compact mobile rows with Sender and classification", async () => {
  const source = await readFile(
    new URL("../src/components/TOTable.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /TransferOrderCompactRow/);
  assert.match(source, /item\.sender/);
  assert.match(source, /DG & GTC/);
  assert.match(source, /matchesTransferOrderSearch/);
  assert.doesNotMatch(source, /const TransferOrderCard/);
});
```

Run:

```powershell
node --experimental-strip-types --test tests/transferOrderTable.test.ts
```

Expected: FAIL because the component still uses `TransferOrderCard` and separate DG/GTC columns.

- [ ] **Step 2: Wire canonical columns and versioned persistence**

In `TOTable.tsx`:

- import `classifyPackedOrder` and `PackedOrderClassification`;
- import table utility exports;
- replace the local `TABLE_COLUMNS` literal with:

```ts
export const TABLE_COLUMNS = TRANSFER_ORDER_COLUMNS;
```

- type `visibleColumns` as `TransferOrderColumnKey[]`;
- initialize it with `parseTransferOrderColumns(localStorage.getItem(storageKey))` inside the existing lazy initializer;
- persist with `serializeTransferOrderColumns(visibleColumns)` inside a guarded `try/catch`;
- type `toggleColumn(colKey: TransferOrderColumnKey)`;
- replace the inline filter predicate with `matchesTransferOrderSearch(item, searchQuery)`.

- [ ] **Step 3: Add a shared classification badge presentation**

Define module-level presentation data so desktop and mobile use identical labels:

```ts
const CLASSIFICATION_META: Record<
  PackedOrderClassification,
  { label: string; className: string }
> = {
  normal: { label: "NORMAL", className: "badge-ghost" },
  dg: { label: "DG", className: "badge-warning" },
  gtc: { label: "GTC", className: "badge-error text-error-content" },
  dg_and_gtc: {
    label: "DG & GTC",
    className: "border-secondary bg-secondary/15 text-secondary",
  },
};
```

Create a small `ClassificationBadge` component that calls no hooks and receives a classification value. Use `classifyPackedOrder(item)` exactly once per rendered row and pass the result to the badge.

- [ ] **Step 4: Replace the mobile card with a compact row**

Rename `TransferOrderCard` to `TransferOrderCompactRow` and replace the nested card/metric surfaces with a bordered list row. The semantic skeleton is:

```tsx
<article className="border-b border-base-200 px-3 py-3 last:border-b-0">
  <div className="flex min-w-0 items-center gap-2">
    {/* TO number */}
    {/* one ClassificationBadge when classification is visible */}
    {/* 44px QR action when action is visible */}
  </div>
  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
    {/* sender → receiver according to sender/route visibility */}
    {/* quantity, weight, completion time */}
    {/* optional operator, pack name, status as short metadata */}
  </div>
</article>
```

Use these fallbacks:

- Sender: `item.sender || "Chưa rõ điểm gửi"`.
- Receiver: `item.receiver || "Chưa rõ điểm đến"`.
- If only sender is visible, show sender without an arrow.
- If only route is visible, show receiver without an arrow.
- If both are visible, render `sender → receiver`.
- If neither header nor metadata nor action is visible, return `null`.

Wrap mobile rows in one shared `app-surface overflow-hidden md:hidden` container instead of applying a surface to every item.

- [ ] **Step 5: Update desktop cells and stats**

In the desktop row:

- remove the separate `high_value` and `dg_type` cells;
- render one `classification` cell with `ClassificationBadge`;
- render `sender` before `route`, falling back to `---`;
- leave receiver, pack, quantity, weight, status, time, and QR behavior unchanged.

Change the stats grid to accommodate five cards and add:

```tsx
<div className="stat min-w-0 rounded-xl border border-secondary/25 bg-secondary/5 p-3 shadow-xs sm:rounded-2xl sm:p-4">
  <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
    Số bao DG & GTC
  </div>
  <div className="stat-value mt-1 text-2xl font-black text-secondary md:text-3xl">
    {packedMetrics.dgAndGtcBagCount}
  </div>
  <div className="break-safe text-xs leading-relaxed opacity-70">
    Bao đồng thời DG và giá trị cao
  </div>
</div>
```

Keep `dgBagCount` labeled as DG-only and `gtcBagCount` labeled as GTC-only in the supporting copy.

- [ ] **Step 6: Run table tests, lint, and build**

```powershell
node --experimental-strip-types --test tests/transferOrderTable.test.ts tests/packedOrderMetrics.test.ts
npm run lint
npm run build
```

Expected: targeted tests PASS, lint PASS, and production build PASS.

- [ ] **Step 7: Commit the TO table UI**

```powershell
git add -- src/components/TOTable.tsx tests/transferOrderTable.test.ts
git commit -m "feat: compact transfer order results"
```

---

### Task 4: Propagate Combined Classification Through Internal Hub Overview

**Files:**
- Modify: `src/utils/internalHubOverview.ts`
- Modify: `src/components/InternalHubOverviewTable.tsx`
- Modify: `src/pages/InternalHubOverviewPage.tsx`
- Test: `tests/internalHubOverview.test.ts`

**Interfaces:**
- Consumes: `PackedOrderMetrics.dgAndGtcBagCount` from Task 1.
- Produces: `OverviewTotals.packedDgAndGtc` and matching Hub/page displays.
- Preserves: branch merge, stale data, refresh generations, concurrency, and cooldown behavior.

- [ ] **Step 1: Write failing Overview aggregate tests**

Extend the existing `packedOrders` fixture with one combined TO:

```ts
const packedOrders = [
  { to_number: "TO-A", quantity: 5, dg_type: [1], high_value: 1 },
  { to_number: "TO-B", quantity: 3, dg_type: [2], high_value: 2 },
  { to_number: "TO-C", quantity: 4, dg_type: [3], high_value: 1 },
] as never[];
```

In the merge/totals test, assert:

```ts
assert.deepEqual(row.packed.metrics, {
  totalQuantity: 12,
  dgBagCount: 1,
  gtcBagCount: 1,
  dgAndGtcBagCount: 1,
});

assert.deepEqual(summarizeOverview([row]), {
  completedHubs: 1,
  totalHubs: 1,
  looseTotal: 7,
  looseDg: 2,
  looseGtc: 1,
  packedTo: 3,
  packedQuantity: 12,
  packedDg: 1,
  packedGtc: 1,
  packedDgAndGtc: 1,
  latestUpdatedAt: 1_000,
});
```

Update every manually constructed `PackedOrderMetrics` expectation or fixture to include `dgAndGtcBagCount`. Assertions that reuse `packedOrders` must expect three retained orders instead of two.

- [ ] **Step 2: Run the Overview test and confirm failure**

```powershell
node --experimental-strip-types --test tests/internalHubOverview.test.ts
```

Expected: FAIL because `packedDgAndGtc` is not part of `OverviewTotals` and the combined count is not accumulated.

- [ ] **Step 3: Extend Overview state and totals**

In `src/utils/internalHubOverview.ts`:

- add `packedDgAndGtc: number` to `OverviewTotals`;
- accumulate `row.packed.metrics.dgAndGtcBagCount` into the new total;
- initialize the new total to `0`.

Do not alter loose totals or branch freshness semantics.

- [ ] **Step 4: Update the Overview page summary**

In `InternalHubOverviewPage.tsx`, add a seventh summary card:

```tsx
<SummaryCard
  icon={ShieldCheck}
  label="Bao DG & GTC"
  value={
    hasPackedData
      ? numberFormatter.format(totals.packedDgAndGtc)
      : "—"
  }
  description="Bao đồng thời DG và giá trị cao"
  tone="bg-secondary/10 text-secondary"
/>
```

Import a suitable existing Lucide icon such as `ShieldCheck`. Adjust the responsive summary grid to remain two columns on mobile and support seven cards without fixed six-column assumptions at large widths.

- [ ] **Step 5: Update desktop and mobile Overview tables**

In `InternalHubOverviewTable.tsx`:

- mobile per-Hub and footer text becomes `DG x · GTC y · Cả hai z`;
- desktop packed header `colSpan` changes from `4` to `5`;
- add a `DG & GTC` packed subcolumn after GTC;
- add each row's `dgAndGtcBagCount` cell;
- add the footer's `packedDgAndGtc` cell;
- ensure message/footer `colSpan` values still match their respective table structures.

Keep TO and quantity totals unchanged.

- [ ] **Step 6: Run Overview and packed metric tests**

```powershell
node --experimental-strip-types --test tests/packedOrderMetrics.test.ts tests/internalHubOverview.test.ts
```

Expected: both test files PASS.

- [ ] **Step 7: Commit the Overview propagation**

```powershell
git add -- src/utils/internalHubOverview.ts src/components/InternalHubOverviewTable.tsx src/pages/InternalHubOverviewPage.tsx tests/internalHubOverview.test.ts
git commit -m "feat: show combined DG and GTC overview"
```

---

### Task 5: Final Regression Verification

**Files:**
- Verify only; modify a source/test file only when a new failure is directly caused by Tasks 1–4.

**Interfaces:**
- Consumes: all preceding task outputs.
- Produces: evidence that the feature adds no TypeScript, lint, build, or test regressions.

- [ ] **Step 1: Run all feature-relevant tests together**

```powershell
node --experimental-strip-types --test tests/packedOrderMetrics.test.ts tests/transferOrderTable.test.ts tests/internalHubOverview.test.ts tests/looseOrders.test.ts tests/transferOrderLookup.test.ts
```

Expected: all listed tests PASS. Loose-order tests prove that loose DG/GTC behavior was not changed.

- [ ] **Step 2: Run the repository test script**

```powershell
npm test
```

Expected: every feature-related test PASS. The only permitted failures are the two pre-existing `gasAccessControl.test.ts` failures caused by the intentional `allowed: true` override in `gas/code.gs`. Record exact pass/fail totals.

- [ ] **Step 3: Run lint and production build**

```powershell
npm run lint
npm run build
```

Expected: both commands exit `0`. Record final `dist/index.html` size; do not copy it into `gas/index.html`.

- [ ] **Step 4: Inspect the final diff and repository state**

```powershell
git diff --check
git status --short
git log --oneline -6
```

Expected: no whitespace errors, no generated `dist` files staged, and only intentional source/test/plan changes remain.

- [ ] **Step 5: Commit any direct regression correction, otherwise leave no extra commit**

If verification required a feature-scoped correction, commit only those exact files:

```powershell
git add -- src/utils/packedOrderMetrics.ts src/utils/transferOrderTable.ts src/components/TOTable.tsx src/utils/internalHubOverview.ts src/components/InternalHubOverviewTable.tsx src/pages/InternalHubOverviewPage.tsx tests/packedOrderMetrics.test.ts tests/transferOrderTable.test.ts tests/internalHubOverview.test.ts package.json
git commit -m "fix: stabilize transfer order result display"
```

If no correction was required, do not create an empty commit.
