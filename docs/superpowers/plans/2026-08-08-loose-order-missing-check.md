# Loose-Order Missing Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent loose-order summary to both missing-check pages while preserving the existing packed Transfer Order results.

**Architecture:** Keep response normalization as a pure tested utility, isolate the Shopee POST call in a small API module, and encapsulate loose-order async state in a shared React hook. Render one shared summary panel on both pages and run loose and packed checks concurrently with independent failure handling.

**Tech Stack:** React 19, TypeScript 6, Axios, Tailwind CSS 4, DaisyUI 5, Lucide React, Node 24 built-in test runner, Vite 8.

## Global Constraints

- Apply the feature to `CheckSotNoiTinhPage` and `CheckSotNgoaiTinhPage`.
- Preserve the existing packed-TO request, filtering, table, QR actions, and user settings.
- POST to `/api/fleet_order/order/tracking_list/search` with `count: 1000`, `current_station_ids: "1030"`, `next_station_ids: "1069"`, `order_status: "8"`, and `page_no: 1`.
- Display `data.total`, count numeric `dg_type !== 0`, and count numeric `high_value !== 0` independently.
- Identify the temporary fixed route as `Pleiku SOC → 44-GLI An Khe Hub`.
- Do not add station-ID settings, dynamic station mapping, loose-order pagination, or a loose-order detail list.
- A failure in either request must not prevent the other request's successful result from rendering.

---

## File Structure

- Create `src/utils/looseOrders.ts`: fixed request contract, response types, validation, and pure summary calculation.
- Create `src/utils/looseOrdersApi.ts`: the Axios call through the existing `apiClient`.
- Create `src/hooks/useLooseOrderCheck.ts`: reusable idle/loading/success/error state and request action.
- Create `src/components/LooseOrderSummary.tsx`: responsive loose-order status and metrics panel.
- Create `tests/looseOrders.test.ts`: Node built-in tests for response parsing and counting.
- Modify `package.json`: add the deterministic `test` script without a new dependency.
- Modify `src/pages/CheckSotNoiTinhPage.tsx`: start both checks concurrently and label packed results.
- Modify `src/pages/CheckSotNgoaiTinhPage.tsx`: start both checks concurrently and label packed results.

### Task 1: Pure loose-order response contract

**Files:**
- Create: `src/utils/looseOrders.ts`
- Create: `tests/looseOrders.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `LOOSE_ORDER_SEARCH_PATH`, `DEFAULT_LOOSE_ORDER_PAYLOAD`, `LooseOrderSummary`, and `summarizeLooseOrderResponse(payload: unknown): LooseOrderSummary`.
- Consumes: only standard JavaScript/TypeScript primitives so the module remains testable without React or browser globals.

- [ ] **Step 1: Add a failing Node test suite**

Create `tests/looseOrders.test.ts` with exact assertions for the fixed payload, API total, overlapping DG/GTC flags, zero/missing flags, missing lists, total fallback, and API errors:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LOOSE_ORDER_PAYLOAD,
  LOOSE_ORDER_SEARCH_PATH,
  summarizeLooseOrderResponse,
} from "../src/utils/looseOrders.ts";

test("exposes the fixed loose-order request contract", () => {
  assert.equal(LOOSE_ORDER_SEARCH_PATH, "/api/fleet_order/order/tracking_list/search");
  assert.deepEqual(DEFAULT_LOOSE_ORDER_PAYLOAD, {
    count: 1000,
    current_station_ids: "1030",
    next_station_ids: "1069",
    order_status: "8",
    page_no: 1,
  });
});

test("uses API total and counts DG and high-value flags independently", () => {
  assert.deepEqual(
    summarizeLooseOrderResponse({
      retcode: 0,
      data: {
        total: 8,
        list: [
          { dg_type: 1, high_value: 0 },
          { dg_type: 0, high_value: 2 },
          { dg_type: 3, high_value: 4 },
          { dg_type: 0, high_value: 0 },
          {},
        ],
      },
    }),
    { total: 8, dgCount: 2, highValueCount: 2 },
  );
});

test("normalizes a missing list and falls back to list length for invalid total", () => {
  assert.deepEqual(
    summarizeLooseOrderResponse({ retcode: 0, data: { total: 3 } }),
    { total: 3, dgCount: 0, highValueCount: 0 },
  );
  assert.deepEqual(
    summarizeLooseOrderResponse({ retcode: 0, data: { total: "2", list: [{ dg_type: 2 }] } }),
    { total: 1, dgCount: 1, highValueCount: 0 },
  );
});

test("rejects non-success and malformed API responses", () => {
  assert.throws(
    () => summarizeLooseOrderResponse({ retcode: 1001, message: "Không có quyền" }),
    /Không có quyền/,
  );
  assert.throws(() => summarizeLooseOrderResponse(null), /không hợp lệ/i);
});
```

Add this package script:

```json
"test": "node --experimental-strip-types --test tests/looseOrders.test.ts"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because `src/utils/looseOrders.ts` does not exist.

- [ ] **Step 3: Implement strict response normalization**

Create `src/utils/looseOrders.ts` with these exported contracts and behavior:

```ts
export const LOOSE_ORDER_SEARCH_PATH =
  "/api/fleet_order/order/tracking_list/search";

export const DEFAULT_LOOSE_ORDER_PAYLOAD = {
  count: 1000,
  current_station_ids: "1030",
  next_station_ids: "1069",
  order_status: "8",
  page_no: 1,
} as const;

export interface LooseOrderSummary {
  total: number;
  dgCount: number;
  highValueCount: number;
}

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null ? (value as JsonObject) : null;

const isNonZeroNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value !== 0;

export const summarizeLooseOrderResponse = (
  payload: unknown,
): LooseOrderSummary => {
  const root = asObject(payload);
  if (!root) throw new Error("Phản hồi hàng xá lẻ không hợp lệ.");

  if (root.retcode !== 0) {
    const message =
      typeof root.message === "string" && root.message.trim()
        ? root.message
        : "Không thể tải dữ liệu hàng xá lẻ.";
    throw new Error(message);
  }

  const data = asObject(root.data);
  if (!data) throw new Error("Phản hồi hàng xá lẻ không hợp lệ.");

  const list = Array.isArray(data.list) ? data.list : [];
  let dgCount = 0;
  let highValueCount = 0;

  for (const value of list) {
    const item = asObject(value);
    if (!item) continue;
    if (isNonZeroNumber(item.dg_type)) dgCount += 1;
    if (isNonZeroNumber(item.high_value)) highValueCount += 1;
  }

  return {
    total:
      typeof data.total === "number" && Number.isFinite(data.total)
        ? data.total
        : list.length,
    dgCount,
    highValueCount,
  };
};
```

- [ ] **Step 4: Run the focused test and validation**

Run: `npm test`

Expected: four passing tests.

Run: `npm run lint -- --quiet`

Expected: no new lint error from the utility or test.

- [ ] **Step 5: Commit the pure contract**

```bash
git add package.json src/utils/looseOrders.ts tests/looseOrders.test.ts
git commit -m "feat: add loose-order summary contract"
```

### Task 2: Shared request state and summary panel

**Files:**
- Create: `src/utils/looseOrdersApi.ts`
- Create: `src/hooks/useLooseOrderCheck.ts`
- Create: `src/components/LooseOrderSummary.tsx`

**Interfaces:**
- Consumes: `LOOSE_ORDER_SEARCH_PATH`, `DEFAULT_LOOSE_ORDER_PAYLOAD`, `summarizeLooseOrderResponse`, and existing `apiClient`.
- Produces: `fetchLooseOrderSummary(): Promise<LooseOrderSummary>`, `useLooseOrderCheck(): { state: LooseOrderCheckState; run: () => Promise<void> }`, and `LooseOrderSummary({ state })`.

- [ ] **Step 1: Add the API function**

Create `src/utils/looseOrdersApi.ts`:

```ts
import apiClient from "./apiClient";
import {
  DEFAULT_LOOSE_ORDER_PAYLOAD,
  LOOSE_ORDER_SEARCH_PATH,
  summarizeLooseOrderResponse,
  type LooseOrderSummary,
} from "./looseOrders";

export const fetchLooseOrderSummary = async (): Promise<LooseOrderSummary> => {
  const response = await apiClient.post(
    LOOSE_ORDER_SEARCH_PATH,
    DEFAULT_LOOSE_ORDER_PAYLOAD,
  );
  return summarizeLooseOrderResponse(response.data);
};
```

- [ ] **Step 2: Add reusable async state**

Create `src/hooks/useLooseOrderCheck.ts` with a discriminated union so success always carries counters and other states do not expose stale data:

```ts
import { useCallback, useState } from "react";
import type { LooseOrderSummary } from "../utils/looseOrders";
import { fetchLooseOrderSummary } from "../utils/looseOrdersApi";

export type LooseOrderCheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; summary: LooseOrderSummary }
  | { status: "error"; message: string };

const FALLBACK_ERROR =
  "Không tải được hàng xá lẻ. Vui lòng kiểm tra kết nối và thử lại.";

export const useLooseOrderCheck = () => {
  const [state, setState] = useState<LooseOrderCheckState>({ status: "idle" });

  const run = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const summary = await fetchLooseOrderSummary();
      setState({ status: "success", summary });
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
      setState({ status: "error", message });
    }
  }, []);

  return { state, run };
};
```

- [ ] **Step 3: Build the responsive summary panel**

Create `src/components/LooseOrderSummary.tsx`. It must:

- Render the heading `Hàng xá lẻ` and fixed-route context `Pleiku SOC → 44-GLI An Khe Hub`.
- Use `aria-live="polite"` for changing state.
- Render an idle instruction before searching, a loading skeleton, an inline error alert, or three compact metrics.
- Label the metrics `Tổng`, `Hàng DG`, and `Hàng GTC` and use `summary.total`, `summary.dgCount`, and `summary.highValueCount` respectively.
- Use existing DaisyUI/Tailwind tokens and responsive bounds; do not add global CSS.

Core success markup:

```tsx
<div className="grid grid-cols-3 gap-2 sm:gap-3">
  <Metric label="Tổng" value={state.summary.total} tone="primary" />
  <Metric label="Hàng DG" value={state.summary.dgCount} tone="warning" />
  <Metric label="Hàng GTC" value={state.summary.highValueCount} tone="error" />
</div>
```

Keep the `Metric` component outside the main component to avoid recreating component types during render.

- [ ] **Step 4: Verify type and lint integrity**

Run: `npm run build`

Expected: TypeScript and Vite build succeed.

Run: `npm run lint -- --quiet`

Expected: no new lint errors.

- [ ] **Step 5: Commit shared loose-order UI and state**

```bash
git add src/utils/looseOrdersApi.ts src/hooks/useLooseOrderCheck.ts src/components/LooseOrderSummary.tsx
git commit -m "feat: add loose-order summary panel"
```

### Task 3: Integrate both missing-check pages

**Files:**
- Modify: `src/pages/CheckSotNoiTinhPage.tsx`
- Modify: `src/pages/CheckSotNgoaiTinhPage.tsx`

**Interfaces:**
- Consumes: `useLooseOrderCheck` and `LooseOrderSummary` from Task 2.
- Produces: one search action per page that runs packed and loose checks concurrently and displays both result sections.

- [ ] **Step 1: Integrate the internal missing-check page**

In `CheckSotNoiTinhPage.tsx`:

1. Import `LooseOrderSummary` and `useLooseOrderCheck`.
2. Instantiate `const looseOrders = useLooseOrderCheck();`.
3. Move the existing packed request body into a local `checkPackedOrders` async function after validation data is available.
4. Start both requests together and wait independently:

```ts
const results = await Promise.allSettled([
  checkPackedOrders(),
  looseOrders.run(),
]);

for (const result of results) {
  if (result.status === "rejected") console.error(result.reason);
}
```

5. Keep one outer `finally` that resets the search button's `loading` state only after both checks settle.
6. Render `<LooseOrderSummary state={looseOrders.state} />` before packed results.
7. Wrap the existing `TOTable` in a section headed `Hàng đã đóng bao`.

- [ ] **Step 2: Integrate the external missing-check page**

Apply the identical concurrency and presentation pattern to `CheckSotNgoaiTinhPage.tsx`. Keep its grouped receiver requests and TO deduplication unchanged inside `checkPackedOrders`.

- [ ] **Step 3: Run all automated checks**

Run: `npm test`

Expected: all loose-order unit tests pass.

Run: `npm run lint`

Expected: no lint errors.

Run: `npm run build`

Expected: TypeScript, Vite, and PWA post-build steps succeed.

- [ ] **Step 4: Manually verify both routes**

Run: `npm run dev -- --host 127.0.0.1`.

Verify on both missing-check pages:

- Before search, the loose-order panel shows an instruction rather than zeroes.
- Search sends the exact POST endpoint and fixed payload alongside the existing request.
- Successful responses show API total, independent DG count, and independent GTC count.
- Packed TO results retain current filtering, deduplication, table/card rendering, and toasts.
- A rejected loose request shows an inline error while packed results remain visible.
- A rejected packed request does not remove a successful loose summary.
- Layout remains readable at 320px, 390px, and desktop widths.

- [ ] **Step 5: Commit page integration**

```bash
git add src/pages/CheckSotNoiTinhPage.tsx src/pages/CheckSotNgoaiTinhPage.tsx
git commit -m "feat: check loose orders with missing TOs"
```

## Self-Review Checklist

- Every approved spec requirement maps to Tasks 1-3.
- The fixed payload uses strings for both station IDs and order status exactly as approved.
- The API total is not replaced by list length when it is a finite number.
- Specialized counters are derived from returned list items and count overlap independently.
- Shared request state catches its own error, while `Promise.allSettled` protects packed results from packed-request rejection.
- No station mapping, pagination, or detail-table scope has been added.
- No new test dependency is required because the workspace runs Node 24.
