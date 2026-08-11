# TO Card Readability and Packed Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile TO cards easier to scan and add filtered DG-bag and GTC-bag counts to the packed-order metrics.

**Architecture:** Keep `TOTable` as the shared rendering component for internal and external checks. Extract the packed-order aggregation into a small pure utility so DG/GTC semantics can be tested without a browser, then consume the result in `TOTable` and reorganize only its mobile card markup; the desktop table contract remains unchanged.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, DaisyUI 5, Lucide React, Node built-in test runner, Vite 8.

## Global Constraints

- Each TO counts as exactly one bag.
- A DG bag has at least one `dg_type` value other than `1`; an empty array or `[1]` is NON DG.
- A GTC bag has `high_value === 1`.
- All four metrics reflect `filteredOrders`, not the current page.
- Preserve desktop table behavior, QR actions, pagination, search and saved column visibility.
- Do not add dependencies or change the API/data contract.
- Keep long values wrapping safely with no page-level horizontal scroll on mobile.

## File Map

- Create `src/utils/packedOrderMetrics.ts`: pure types and aggregation function for quantity, DG and GTC totals.
- Create `tests/packedOrderMetrics.test.ts`: unit coverage for counting rules and edge cases.
- Modify `package.json`: include the new test file in the existing explicit `test` command.
- Modify `src/components/TOTable.tsx`: consume metrics and improve only the mobile card/stat presentation.

---

### Task 1: Testable packed-order aggregation

**Files:**
- Create: `src/utils/packedOrderMetrics.ts`
- Create: `tests/packedOrderMetrics.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: readonly order objects with `quantity`, `dg_type` and `high_value`.
- Produces: `isDgType(dgTypes: readonly number[] | undefined): boolean` and `summarizePackedOrders(orders: readonly PackedOrderMetricInput[]): PackedOrderMetrics`.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/packedOrderMetrics.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  isDgType,
  summarizePackedOrders,
} from "../src/utils/packedOrderMetrics.ts";

test("recognizes DG when any type differs from NON DG", () => {
  assert.equal(isDgType(undefined), false);
  assert.equal(isDgType([]), false);
  assert.equal(isDgType([1]), false);
  assert.equal(isDgType([2]), true);
  assert.equal(isDgType([1, 3]), true);
});

test("counts quantity, DG bags and GTC bags independently", () => {
  assert.deepEqual(
    summarizePackedOrders([
      { quantity: 3, dg_type: [], high_value: 2 },
      { quantity: 4, dg_type: [1], high_value: 1 },
      { quantity: 5, dg_type: [2], high_value: 2 },
      { quantity: 6, dg_type: [1, 3], high_value: 1 },
    ]),
    { totalQuantity: 18, dgBagCount: 2, gtcBagCount: 2 },
  );
});

test("returns zero totals for an empty list", () => {
  assert.deepEqual(summarizePackedOrders([]), {
    totalQuantity: 0,
    dgBagCount: 0,
    gtcBagCount: 0,
  });
});

test("treats missing quantity and DG data as zero and NON DG", () => {
  assert.deepEqual(
    summarizePackedOrders([
      { quantity: undefined, dg_type: undefined, high_value: 1 },
      { quantity: 0, dg_type: [1], high_value: 0 },
    ]),
    { totalQuantity: 0, dgBagCount: 0, gtcBagCount: 1 },
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --experimental-strip-types --test tests/packedOrderMetrics.test.ts
```

Expected: FAIL because `src/utils/packedOrderMetrics.ts` does not exist.

- [ ] **Step 3: Implement the pure aggregation utility**

Create `src/utils/packedOrderMetrics.ts`:

```ts
export interface PackedOrderMetricInput {
  quantity?: number;
  dg_type?: readonly number[];
  high_value?: number;
}

export interface PackedOrderMetrics {
  totalQuantity: number;
  dgBagCount: number;
  gtcBagCount: number;
}

export const isDgType = (dgTypes: readonly number[] | undefined): boolean =>
  dgTypes?.some((type) => type !== 1) ?? false;

export const summarizePackedOrders = (
  orders: readonly PackedOrderMetricInput[],
): PackedOrderMetrics =>
  orders.reduce<PackedOrderMetrics>(
    (summary, order) => ({
      totalQuantity: summary.totalQuantity + (order.quantity || 0),
      dgBagCount:
        summary.dgBagCount +
        (isDgType(order.dg_type) ? 1 : 0),
      gtcBagCount: summary.gtcBagCount + (order.high_value === 1 ? 1 : 0),
    }),
    { totalQuantity: 0, dgBagCount: 0, gtcBagCount: 0 },
  );
```

- [ ] **Step 4: Add the test to the project test command**

Append `tests/packedOrderMetrics.test.ts` to the existing space-separated test file list in the `package.json` `test` script. Do not reorder or remove existing tests.

- [ ] **Step 5: Run focused and full tests**

Run:

```powershell
node --experimental-strip-types --test tests/packedOrderMetrics.test.ts
npm test
```

Expected: all new tests and all existing project tests PASS.

- [ ] **Step 6: Commit the aggregation slice**

```powershell
git add src/utils/packedOrderMetrics.ts tests/packedOrderMetrics.test.ts package.json
git commit -m "feat: calculate packed DG and GTC metrics"
```

---

### Task 2: Four packed-order metric cards

**Files:**
- Modify: `src/components/TOTable.tsx`

**Interfaces:**
- Consumes: `summarizePackedOrders(filteredOrders)` from Task 1.
- Produces: four responsive metric cards for total TO, total quantity, DG bags and GTC bags.

- [ ] **Step 1: Replace the inline quantity reduction with the shared summary**

Add the import:

```ts
import {
  isDgType,
  summarizePackedOrders,
} from "../utils/packedOrderMetrics";
```

Replace the `totalQuantity` memo with:

```ts
const packedMetrics = useMemo(
  () => summarizePackedOrders(filteredOrders),
  [filteredOrders],
);
```

- [ ] **Step 2: Render a responsive four-card metric grid**

Change the metric container to `grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4`. Keep the existing total-TO card, bind total quantity to `packedMetrics.totalQuantity`, then add:

```tsx
<div className="stat min-w-0 rounded-xl border border-warning/25 bg-warning/5 p-3 shadow-xs sm:rounded-2xl sm:p-4">
  <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
    Số bao DG
  </div>
  <div className="stat-value mt-1 text-2xl font-black text-warning md:text-3xl">
    {packedMetrics.dgBagCount}
  </div>
  <div className="break-safe text-xs leading-relaxed opacity-70">
    Bao có hàng nguy hiểm
  </div>
</div>

<div className="stat min-w-0 rounded-xl border border-error/25 bg-error/5 p-3 shadow-xs sm:rounded-2xl sm:p-4">
  <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
    Số bao GTC
  </div>
  <div className="stat-value mt-1 text-2xl font-black text-error md:text-3xl">
    {packedMetrics.gtcBagCount}
  </div>
  <div className="break-safe text-xs leading-relaxed opacity-70">
    Bao có hàng giá trị cao
  </div>
</div>
```

- [ ] **Step 3: Verify type-check, lint and tests**

Run:

```powershell
npx eslint src/components/TOTable.tsx src/utils/packedOrderMetrics.ts tests/packedOrderMetrics.test.ts
npm test
node node_modules/typescript/lib/tsc.js -b
```

Expected: all commands exit with code 0.

- [ ] **Step 4: Commit the metric UI**

```powershell
git add src/components/TOTable.tsx
git commit -m "feat: show packed DG and GTC bag counts"
```

---

### Task 3: Improve the mobile TO card hierarchy

**Files:**
- Modify: `src/components/TOTable.tsx`

**Interfaces:**
- Consumes: existing `TransferOrderCardProps`, `visibleColumns` and `onViewQR` contracts.
- Produces: the same card data/actions with clearer visual grouping below the `md` breakpoint.

- [ ] **Step 1: Add shared local visibility flags inside `TransferOrderCard`**

Convert the implicit JSX return to a block body and define:

```ts
const showPrimaryMetrics =
  visibleColumns.includes("quantity") || visibleColumns.includes("weight");
const showFlags =
  visibleColumns.includes("high_value") || visibleColumns.includes("dg_type");
const showDetails = ["operator", "pack_name", "status", "complete_time"].some(
  (column) => visibleColumns.includes(column),
);
```

Return the card markup after these flags. Do not change `TransferOrderCardProps`.

- [ ] **Step 2: Rebuild the card into five readable regions**

Use this structure while retaining the existing visibility checks and fallback text:

```tsx
<article className="overflow-hidden rounded-2xl border border-base-300/70 bg-base-100 shadow-sm">
  <header className="flex items-start justify-between gap-3 border-b border-base-200 bg-base-200/30 p-4">
    {/* Existing Mã TO label/value and QR button */}
  </header>

  <div className="space-y-3 p-4">
    {/* Route: full-width primary block with bg-primary/5 and border-primary/15 */}

    {showPrimaryMetrics && (
      <dl className="grid grid-cols-2 gap-2">
        {/* Quantity and weight as padded rounded metric cells */}
      </dl>
    )}

    {showFlags && (
      <dl className="grid grid-cols-2 gap-2">
        {/* GTC and DG badges; active flags use semantic colors */}
      </dl>
    )}

    {showDetails && (
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-base-200 pt-3 text-sm">
        {/* Operator, pack name, status and completion time */}
      </dl>
    )}
  </div>
</article>
```

Inside the metric cells, use `text-[11px] font-bold uppercase tracking-wide text-base-content/55` for labels, `font-black tabular-nums` for quantity, and `font-semibold tabular-nums` for weight. Preserve the current DG/GTC label text, status badge, time formatting and QR callback.

- [ ] **Step 3: Correct DG presentation to match the agreed counting rule**

Define inside the card using the helper imported in Task 2:

```ts
const isDg = isDgType(item.dg_type);
```

Use `isDg` for the mobile DG badge. In the desktop DG cell, replace both checks of `item.dg_type.length === 0 || item.dg_type[0] === 1` with `!isDgType(item.dg_type)` so an input such as `[1, 2]` is shown as DG consistently with the new metric. Keep empty arrays and `[1]` as NON DG.

- [ ] **Step 4: Verify static quality gates**

Run:

```powershell
npx eslint src/components/TOTable.tsx
npm test
npm run build
```

Expected: lint, tests, TypeScript compilation and Vite production build all PASS.

- [ ] **Step 5: Perform responsive visual QA**

Run `npm run dev -- --host 127.0.0.1`, open both the internal and external missing-order pages, and verify at approximately 360 px and 390 px widths:

- four metrics form a two-column grid without clipping;
- long TO, route, operator and bag names wrap within the card;
- TO/route/quantity/weight are visually discoverable before secondary details;
- DG/GTC active and inactive states are distinguishable by both text and color;
- hiding each saved column removes its card field without leaving an empty section;
- QR opens the existing modal and pagination/search still work.

At 768 px or wider, verify the existing desktop table remains visible and unchanged apart from the corrected DG predicate.

- [ ] **Step 6: Commit the mobile card improvement**

```powershell
git add src/components/TOTable.tsx
git commit -m "style: clarify mobile transfer order cards"
```

---

### Task 4: Final regression check

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: deliverables from Tasks 1–3.
- Produces: a verified build with no unrelated files staged.

- [ ] **Step 1: Run the complete verification suite**

```powershell
npm test
npm run lint
npm run build
git diff --check HEAD~3..HEAD
git status --short
```

Expected: tests, lint and build exit with code 0; no whitespace errors; only pre-existing unrelated workspace files may remain untracked.

- [ ] **Step 2: Review the final diff against the spec**

Run:

```powershell
git diff HEAD~3..HEAD -- src/components/TOTable.tsx src/utils/packedOrderMetrics.ts tests/packedOrderMetrics.test.ts package.json
```

Confirm the diff contains only the pure aggregation, four filtered metrics, DG predicate correction and mobile card markup; confirm no API, route, desktop-column, QR or pagination contract changed.
