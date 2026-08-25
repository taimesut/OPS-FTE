# Internal Missing Check COT Cutoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted optional COT cutoff to internal missing checks so loose orders use a one-calendar-month received-time window and packed TOs are retained only when their latest recursive status-`882` event is at or before COT.

**Architecture:** Pure utilities own local-time/storage rules and TO response parsing/concurrency. Thin API utilities perform the two per-TO GET requests, while `CheckSotNoiTinhPage` snapshots the chosen criteria, runs loose and packed branches independently, and publishes packed results only after the complete five-worker cutoff pass succeeds.

**Tech Stack:** React 19, TypeScript 6, Axios, Tailwind CSS 4, DaisyUI 5, Node test runner, Vite 8.

## Global Constraints

- Apply the feature only to `Check sót nội tỉnh`.
- Preserve current requests and results exactly when COT is disabled.
- Persist both COT enabled state and selected local date/time in `localStorage`.
- Interpret `datetime-local` in the device's local timezone and compare inclusive Unix seconds.
- Subtract one calendar month with end-of-month clamping; do not substitute a fixed 30-day duration.
- Run no more than five TO pipelines concurrently and preserve outbound-list order.
- Treat the first detail-list order and at least one recursive status `882` as guaranteed API contracts, but report malformed responses rather than silently excluding a TO.
- Do not modify the Google Apps Script proxy contract, external missing page, Overview pages, or TO lookup page.
- Keep the unrelated user edits in `src/layouts/MobileLayout.tsx` and `src/pages/HomePage.tsx` unstaged and unchanged.
- Do not synchronize the production build into `gas/index.html` unless separately requested.

---

## File Structure

- Create `src/utils/cotCutoff.ts`: local date/time parsing, calendar-month calculation, received-time window, and versioned preference persistence.
- Create `src/utils/transferOrderCot.ts`: URL builders, defensive response parsing, recursive status extraction, and the bounded worker pool.
- Create `src/utils/transferOrderCotApi.ts`: Axios calls for TO detail and representative shipment tracking.
- Create `src/components/CotCutoffControl.tsx`: responsive switch, date/time input, active-cutoff summary, and progress.
- Modify `src/utils/looseOrders.ts`, `src/utils/looseOrdersApi.ts`, and `src/hooks/useLooseOrderCheck.ts`: thread an optional received-time range into the existing request.
- Modify `src/pages/CheckSotNoiTinhPage.tsx`: persist UI state, validate a search snapshot, orchestrate both branches, and preserve the previous TO list on failure.
- Create `tests/cotCutoff.test.ts`, `tests/transferOrderCot.test.ts`, and `tests/internalCotUi.test.ts`: pure behavior and source-level UI contracts.
- Modify `tests/looseOrders.test.ts` and `package.json`: payload regressions and test registration.

---

### Task 1: Local COT Time and Preference Domain

**Files:**
- Create: `src/utils/cotCutoff.ts`
- Create: `tests/cotCutoff.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: a browser `datetime-local` string, `Date`, and raw localStorage text.
- Produces: `CotCutoffPreferences`, `CotWindow`, `formatLocalDateTimeInput(date?)`, `parseCotLocalDateTime(value)`, `isValidCotLocalDateTime(value)`, `createCotWindow(value)`, `parseCotCutoffPreferences(raw)`, and `serializeCotCutoffPreferences(value)`.
- Used by: the COT control and internal-check page in Task 4.

- [ ] **Step 1: Write failing local-time, calendar clamp, and storage tests**

Create `tests/cotCutoff.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createCotWindow,
  formatLocalDateTimeInput,
  isValidCotLocalDateTime,
  parseCotCutoffPreferences,
  parseCotLocalDateTime,
  serializeCotCutoffPreferences,
} from "../src/utils/cotCutoff.ts";

test("formats a local Date for datetime-local at minute precision", () => {
  assert.equal(
    formatLocalDateTimeInput(new Date(2026, 7, 25, 9, 7, 41)),
    "2026-08-25T09:07",
  );
});

test("parses only real local datetime-local values", () => {
  const parsed = parseCotLocalDateTime("2026-08-25T14:30");
  assert.deepEqual(
    [
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      parsed.getHours(),
      parsed.getMinutes(),
    ],
    [2026, 7, 25, 14, 30],
  );
  assert.equal(isValidCotLocalDateTime("2026-02-29T10:00"), false);
  assert.equal(isValidCotLocalDateTime(""), false);
  assert.throws(() => parseCotLocalDateTime("not-a-date"), /COT không hợp lệ/i);
});

test("creates an inclusive Unix range one clamped calendar month back", () => {
  const window = createCotWindow("2026-03-31T10:15");
  const expectedFrom = Math.floor(new Date(2026, 1, 28, 10, 15).getTime() / 1000);
  const expectedCot = Math.floor(new Date(2026, 2, 31, 10, 15).getTime() / 1000);
  assert.deepEqual(window, {
    cotTimestamp: expectedCot,
    currentStationReceivedTime: `${expectedFrom},${expectedCot}`,
  });
});

test("round-trips versioned COT preferences", () => {
  const preferences = { enabled: true, localDateTime: "2026-08-25T09:30" };
  assert.deepEqual(
    parseCotCutoffPreferences(serializeCotCutoffPreferences(preferences)),
    preferences,
  );
});

test("falls back safely for missing, malformed, or future preferences", () => {
  const fallback = { enabled: false, localDateTime: "" };
  assert.deepEqual(parseCotCutoffPreferences(null), fallback);
  assert.deepEqual(parseCotCutoffPreferences("not-json"), fallback);
  assert.deepEqual(
    parseCotCutoffPreferences(JSON.stringify({ version: 99, enabled: true })),
    fallback,
  );
  assert.deepEqual(
    parseCotCutoffPreferences(
      JSON.stringify({ version: 1, enabled: true, localDateTime: "invalid" }),
    ),
    fallback,
  );
});
```

- [ ] **Step 2: Register the test and prove it fails**

Append `tests/cotCutoff.test.ts` to the explicit `test` script in `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/cotCutoff.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/cotCutoff.ts`.

- [ ] **Step 3: Implement exact local-time and storage behavior**

Create `src/utils/cotCutoff.ts`:

```ts
export interface CotCutoffPreferences {
  enabled: boolean;
  localDateTime: string;
}

export interface CotWindow {
  cotTimestamp: number;
  currentStationReceivedTime: string;
}

const STORAGE_VERSION = 1;
const DEFAULT_PREFERENCES: CotCutoffPreferences = {
  enabled: false,
  localDateTime: "",
};
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, "0");

export const formatLocalDateTimeInput = (date = new Date()): string => {
  if (Number.isNaN(date.getTime())) throw new Error("Thời gian COT không hợp lệ.");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const parseCotLocalDateTime = (value: string): Date => {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) throw new Error("Thời gian COT không hợp lệ.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error("Thời gian COT không hợp lệ.");
  }
  return date;
};

export const isValidCotLocalDateTime = (value: string): boolean => {
  try {
    parseCotLocalDateTime(value);
    return true;
  } catch {
    return false;
  }
};

const subtractOneCalendarMonth = (date: Date): Date => {
  const result = new Date(date.getTime());
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - 1);
  const lastTargetDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, lastTargetDay));
  return result;
};

export const createCotWindow = (localDateTime: string): CotWindow => {
  const cot = parseCotLocalDateTime(localDateTime);
  const from = subtractOneCalendarMonth(cot);
  const cotTimestamp = Math.floor(cot.getTime() / 1000);
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  return {
    cotTimestamp,
    currentStationReceivedTime: `${fromTimestamp},${cotTimestamp}`,
  };
};

export const parseCotCutoffPreferences = (
  raw: string | null,
): CotCutoffPreferences => {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      value.version !== STORAGE_VERSION ||
      typeof value.enabled !== "boolean" ||
      typeof value.localDateTime !== "string"
    ) {
      return { ...DEFAULT_PREFERENCES };
    }
    if (value.localDateTime && !isValidCotLocalDateTime(value.localDateTime)) {
      return { ...DEFAULT_PREFERENCES };
    }
    if (value.enabled && !value.localDateTime) {
      return { ...DEFAULT_PREFERENCES };
    }
    return { enabled: value.enabled, localDateTime: value.localDateTime };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const serializeCotCutoffPreferences = (
  preferences: CotCutoffPreferences,
): string => JSON.stringify({ version: STORAGE_VERSION, ...preferences });
```

- [ ] **Step 4: Run the focused test and TypeScript check**

```powershell
node --experimental-strip-types --test tests/cotCutoff.test.ts
node node_modules/typescript/lib/tsc.js -b
```

Expected: five COT utility tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit the time/storage domain**

```powershell
git add -- src/utils/cotCutoff.ts tests/cotCutoff.test.ts package.json
git commit -m "feat: define COT cutoff preferences"
```

---

### Task 2: Optional Loose-Order Received-Time Range

**Files:**
- Modify: `src/utils/looseOrders.ts:4-19`
- Modify: `src/utils/looseOrdersApi.ts:9-19`
- Modify: `src/hooks/useLooseOrderCheck.ts:14-30`
- Modify: `tests/looseOrders.test.ts`

**Interfaces:**
- Consumes: optional `currentStationReceivedTime?: string` formatted as two ordered Unix-second integers separated by a comma.
- Produces: `createLooseOrderPayload(currentStationId, nextStationIds, currentStationReceivedTime?)`, `fetchLooseOrderSummary(currentStationId, nextStationIds, currentStationReceivedTime?)`, and `run(currentStationId, nextStationIds, currentStationReceivedTime?)`.
- Used by: the page orchestration in Task 4.

- [ ] **Step 1: Add failing payload compatibility and validation tests**

Append to `tests/looseOrders.test.ts`:

```ts
test("adds the selected station-received range only when supplied", () => {
  assert.deepEqual(
    createLooseOrderPayload("5001", ["6001"], "1785000000,1787677199"),
    {
      count: 1000,
      current_station_ids: "5001",
      next_station_ids: "6001",
      order_status: "8",
      page_no: 1,
      current_station_received_time: "1785000000,1787677199",
    },
  );
  assert.equal(
    "current_station_received_time" in createLooseOrderPayload("5001", ["6001"]),
    false,
  );
});

test("rejects malformed or reversed station-received ranges", () => {
  assert.throws(
    () => createLooseOrderPayload("5001", ["6001"], "bad-range"),
    /thời gian nhận/i,
  );
  assert.throws(
    () => createLooseOrderPayload("5001", ["6001"], "200,100"),
    /thời gian nhận/i,
  );
});
```

- [ ] **Step 2: Run the payload test and confirm failure**

```powershell
node --experimental-strip-types --test tests/looseOrders.test.ts
```

Expected: FAIL because `createLooseOrderPayload` accepts only two arguments and does not emit the received-time property.

- [ ] **Step 3: Extend the payload without changing the disabled contract**

Add this normalizer above `createLooseOrderPayload` in `src/utils/looseOrders.ts`:

```ts
const normalizeReceivedTimeRange = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  const match = /^(\d+),(\d+)$/.exec(value.trim());
  if (!match) throw new Error("Khoảng thời gian nhận hàng không hợp lệ.");
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) {
    throw new Error("Khoảng thời gian nhận hàng không hợp lệ.");
  }
  return `${from},${to}`;
};
```

Change the signature and return construction:

```ts
export const createLooseOrderPayload = (
  currentStationId: string,
  nextStationIds: string[],
  currentStationReceivedTime?: string,
) => {
  const currentId = currentStationId.trim();
  const destinationIds = [...new Set(nextStationIds.map((id) => id.trim()).filter(Boolean))];
  if (!currentId) throw new Error("SOC nguồn chưa có ID.");
  if (destinationIds.length === 0) throw new Error("Tuyến đích chưa có ID.");
  const receivedTime = normalizeReceivedTimeRange(currentStationReceivedTime);
  return {
    count: 1000,
    current_station_ids: currentId,
    next_station_ids: destinationIds.join(","),
    order_status: "8",
    page_no: 1,
    ...(receivedTime
      ? { current_station_received_time: receivedTime }
      : {}),
  } as const;
};
```

- [ ] **Step 4: Thread the optional value through API and hook signatures**

Change `fetchLooseOrderSummary` in `src/utils/looseOrdersApi.ts`:

```ts
export const fetchLooseOrderSummary = async (
  currentStationId: string,
  nextStationIds: string[],
  currentStationReceivedTime?: string,
): Promise<LooseOrderSummary> => {
  const response = await apiClient.post(
    LOOSE_ORDER_SEARCH_PATH,
    createLooseOrderPayload(
      currentStationId,
      nextStationIds,
      currentStationReceivedTime,
    ),
    { suppressErrorToast: true },
  );
  return summarizeLooseOrderResponse(response.data);
};
```

Change `run` in `src/hooks/useLooseOrderCheck.ts` while preserving its existing loading/success/error state transitions:

```ts
const run = useCallback(
  async (
    currentStationId: string,
    nextStationIds: string[],
    currentStationReceivedTime?: string,
  ) => {
    setState({ status: "loading" });
    try {
      const summary = await fetchLooseOrderSummary(
        currentStationId,
        nextStationIds,
        currentStationReceivedTime,
      );
      setState({ status: "success", summary });
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
      setState({ status: "error", message });
    }
  },
  [],
);
```

- [ ] **Step 5: Run loose-order regression tests and TypeScript**

```powershell
node --experimental-strip-types --test tests/looseOrders.test.ts
node node_modules/typescript/lib/tsc.js -b
```

Expected: all loose-order tests PASS; the original two-argument payload remains byte-for-byte equivalent as an object, and TypeScript exits `0`.

- [ ] **Step 6: Commit the optional loose-order window**

```powershell
git add -- src/utils/looseOrders.ts src/utils/looseOrdersApi.ts src/hooks/useLooseOrderCheck.ts tests/looseOrders.test.ts
git commit -m "feat: filter loose orders by COT window"
```

---

### Task 3: Transfer-Order COT Pipeline and Five-Worker Pool

**Files:**
- Create: `src/utils/transferOrderCot.ts`
- Create: `src/utils/transferOrderCotApi.ts`
- Create: `tests/transferOrderCot.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: raw detail/tracking responses, TO-shaped values `{ to_number: string }`, a COT Unix timestamp, and a loader `(toNumber) => Promise<number>`.
- Produces: `buildTransferOrderDetailPath(toNumber)`, `buildShipmentTrackingPath(shipmentId)`, `parseFirstFleetOrderId(payload)`, `parseLatestStatus882Timestamp(payload)`, `filterTransferOrdersByCot(orders, cotTimestamp, loadLatest882, onProgress?, concurrency?)`, and `fetchLatestTransferOrderCotTimestamp(toNumber)`.
- Used by: the page packed branch in Task 4.

- [ ] **Step 1: Write failing URL, parser, traversal, cutoff, concurrency, and failure tests**

Create `tests/transferOrderCot.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShipmentTrackingPath,
  buildTransferOrderDetailPath,
  filterTransferOrdersByCot,
  parseFirstFleetOrderId,
  parseLatestStatus882Timestamp,
} from "../src/utils/transferOrderCot.ts";

test("builds encoded SPX detail and tracking paths", () => {
  assert.equal(
    buildTransferOrderDetailPath("TO 01/A"),
    "/api/in-station/general_to/detail/search?to_number=TO%2001%2FA&pageno=1&count=10",
  );
  assert.equal(
    buildShipmentTrackingPath("SPXVN 01"),
    "/api/fleet_order/order/detail/tracking_info?shipment_id=SPXVN%2001",
  );
});

test("reads the first representative shipment from a successful detail response", () => {
  assert.equal(
    parseFirstFleetOrderId({
      retcode: 0,
      data: { list: [{ fleet_order_id: " SPXVN001 " }, { fleet_order_id: "SPXVN002" }] },
    }),
    "SPXVN001",
  );
  assert.throws(
    () => parseFirstFleetOrderId({ retcode: 0, data: { list: [] } }),
    /đơn đại diện/i,
  );
});

test("selects the latest 882 timestamp across roots, children, and event children", () => {
  assert.equal(
    parseLatestStatus882Timestamp({
      retcode: 0,
      data: {
        tracking_list: [
          { status: 882, timestamp: 100, children: [] },
          {
            status: 8,
            timestamp: 200,
            children: [{ status: 882, timestamp: 300 }],
            event_children: [{ status: 882, timestamp: 250 }],
          },
        ],
      },
    }),
    300,
  );
  assert.throws(
    () => parseLatestStatus882Timestamp({ retcode: 0, data: { tracking_list: [] } }),
    /882/i,
  );
});

test("retains only timestamps at or before COT in original order", async () => {
  const orders = [{ to_number: "A" }, { to_number: "B" }, { to_number: "C" }];
  const timestamps: Record<string, number> = { A: 101, B: 100, C: 99 };
  const progress: string[] = [];
  const result = await filterTransferOrdersByCot(
    orders,
    100,
    async (toNumber) => timestamps[toNumber],
    (processed, total) => progress.push(`${processed}/${total}`),
  );
  assert.deepEqual(result, [orders[1], orders[2]]);
  assert.equal(progress.at(-1), "3/3");
});

test("never exceeds five concurrent pipelines and preserves input order", async () => {
  const orders = Array.from({ length: 12 }, (_, index) => ({ to_number: `TO-${index}` }));
  let active = 0;
  let maximumActive = 0;
  const result = await filterTransferOrdersByCot(
    orders,
    100,
    async (toNumber) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const index = Number(toNumber.split("-")[1]);
      await new Promise((resolve) => setTimeout(resolve, (12 - index) % 4));
      active -= 1;
      return index % 2 === 0 ? 100 : 101;
    },
  );
  assert.ok(maximumActive <= 5);
  assert.deepEqual(result.map(({ to_number }) => to_number), [
    "TO-0", "TO-2", "TO-4", "TO-6", "TO-8", "TO-10",
  ]);
});

test("fails the whole cutoff pass with TO context", async () => {
  await assert.rejects(
    filterTransferOrdersByCot(
      [{ to_number: "TO-OK" }, { to_number: "TO-FAIL" }],
      100,
      async (toNumber) => {
        if (toNumber === "TO-FAIL") throw new Error("Mất kết nối");
        return 90;
      },
    ),
    /TO-FAIL.*Mất kết nối/i,
  );
});
```

- [ ] **Step 2: Register and run the new test to confirm failure**

Append `tests/transferOrderCot.test.ts` to the explicit test script in `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/transferOrderCot.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/transferOrderCot.ts`.

- [ ] **Step 3: Implement defensive response parsing and URL builders**

Create the path builders and public parsers in `src/utils/transferOrderCot.ts`:

```ts
type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;

const successfulData = (payload: unknown, fallback: string): UnknownRecord => {
  const root = asRecord(payload);
  if (!root) throw new Error(fallback);
  if (root.retcode !== 0) {
    const message =
      typeof root.message === "string" && root.message.trim()
        ? root.message.trim()
        : fallback;
    throw new Error(message);
  }
  const data = asRecord(root.data);
  if (!data) throw new Error(fallback);
  return data;
};

export const buildTransferOrderDetailPath = (toNumber: string): string =>
  `/api/in-station/general_to/detail/search?to_number=${encodeURIComponent(toNumber.trim())}&pageno=1&count=10`;

export const buildShipmentTrackingPath = (shipmentId: string): string =>
  `/api/fleet_order/order/detail/tracking_info?shipment_id=${encodeURIComponent(shipmentId.trim())}`;

export const parseFirstFleetOrderId = (payload: unknown): string => {
  const data = successfulData(payload, "Phản hồi chi tiết TO không hợp lệ.");
  const first = Array.isArray(data.list) ? asRecord(data.list[0]) : null;
  const shipmentId = String(first?.fleet_order_id ?? "").trim();
  if (!shipmentId) throw new Error("TO không có đơn đại diện.");
  return shipmentId;
};

const visitTrackingNode = (
  value: unknown,
  latest: { timestamp: number },
): void => {
  const node = asRecord(value);
  if (!node) return;
  if (
    node.status === 882 &&
    typeof node.timestamp === "number" &&
    Number.isSafeInteger(node.timestamp)
  ) {
    latest.timestamp = Math.max(latest.timestamp, node.timestamp);
  }
  for (const key of ["children", "event_children"] as const) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) visitTrackingNode(child, latest);
    }
  }
};

export const parseLatestStatus882Timestamp = (payload: unknown): number => {
  const data = successfulData(payload, "Phản hồi hành trình đơn không hợp lệ.");
  const latest = { timestamp: -1 };
  if (Array.isArray(data.tracking_list)) {
    for (const item of data.tracking_list) visitTrackingNode(item, latest);
  }
  if (latest.timestamp < 0) throw new Error("Không tìm thấy trạng thái 882.");
  return latest.timestamp;
};
```

- [ ] **Step 4: Implement the bounded all-or-nothing worker pool**

Append to `src/utils/transferOrderCot.ts`:

```ts
export interface CotTransferOrder {
  to_number: string;
}

export type CotProgressHandler = (processed: number, total: number) => void;

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "Lỗi không xác định";

export const filterTransferOrdersByCot = async <T extends CotTransferOrder>(
  orders: readonly T[],
  cotTimestamp: number,
  loadLatest882: (toNumber: string) => Promise<number>,
  onProgress?: CotProgressHandler,
  concurrency = 5,
): Promise<T[]> => {
  if (!Number.isSafeInteger(cotTimestamp)) throw new Error("Thời gian COT không hợp lệ.");
  const workerCount = Math.min(
    orders.length,
    Math.max(1, Math.min(5, Math.floor(concurrency) || 1)),
  );
  const retained = new Array<boolean>(orders.length).fill(false);
  const failures: Error[] = [];
  let cursor = 0;
  let processed = 0;

  const worker = async () => {
    while (failures.length === 0) {
      const index = cursor;
      cursor += 1;
      if (index >= orders.length) return;
      const order = orders[index];
      try {
        const latest882 = await loadLatest882(order.to_number);
        retained[index] = latest882 <= cotTimestamp;
      } catch (error) {
        failures.push(
          new Error(
            `Không thể kiểm tra COT cho ${order.to_number}: ${errorMessage(error)}`,
          ),
        );
      } finally {
        processed += 1;
        onProgress?.(processed, orders.length);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failures[0]) throw failures[0];
  return orders.filter((_, index) => retained[index]);
};
```

For an empty list, `workerCount` is zero, `Promise.all([])` resolves, and the function returns an empty list without issuing requests.

- [ ] **Step 5: Implement the thin Axios pipeline**

Create `src/utils/transferOrderCotApi.ts`:

```ts
import apiClient from "./apiClient";
import {
  buildShipmentTrackingPath,
  buildTransferOrderDetailPath,
  parseFirstFleetOrderId,
  parseLatestStatus882Timestamp,
} from "./transferOrderCot";

export const fetchLatestTransferOrderCotTimestamp = async (
  toNumber: string,
): Promise<number> => {
  const detailResponse = await apiClient.get(
    buildTransferOrderDetailPath(toNumber),
    { suppressErrorToast: true },
  );
  const shipmentId = parseFirstFleetOrderId(detailResponse.data);
  const trackingResponse = await apiClient.get(
    buildShipmentTrackingPath(shipmentId),
    { suppressErrorToast: true },
  );
  return parseLatestStatus882Timestamp(trackingResponse.data);
};
```

- [ ] **Step 6: Run focused tests, lint, and TypeScript**

```powershell
node --experimental-strip-types --test tests/transferOrderCot.test.ts
npm run lint
node node_modules/typescript/lib/tsc.js -b
```

Expected: six transfer-order COT tests PASS, lint exits `0`, and TypeScript exits `0`.

- [ ] **Step 7: Commit the transfer-order pipeline**

```powershell
git add -- src/utils/transferOrderCot.ts src/utils/transferOrderCotApi.ts tests/transferOrderCot.test.ts package.json
git commit -m "feat: filter transfer orders by COT"
```

---

### Task 4: Responsive COT Control and Internal-Check Orchestration

**Files:**
- Create: `src/components/CotCutoffControl.tsx`
- Modify: `src/pages/CheckSotNoiTinhPage.tsx:1-166`
- Create: `tests/internalCotUi.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CotCutoffPreferences`, `CotWindow`, `filterTransferOrdersByCot`, `fetchLatestTransferOrderCotTimestamp`, and the extended loose-order hook signature.
- Produces: persisted COT controls, locked criteria during searches, progress text, inclusive packed filtering, and all-or-nothing packed result publication.
- Preserves: the existing Hub/SOC/cookie guards, seven-day outbound search, `TOTable`, `LooseOrderSummary`, and independent branch orchestration.

- [ ] **Step 1: Write failing source-level UI and orchestration contracts**

Create `tests/internalCotUi.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("COT control exposes a switch, local date-time input, and progress", async () => {
  const source = await readSource("../src/components/CotCutoffControl.tsx");
  assert.match(source, /Cắt COT/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /Đang kiểm tra toàn bộ dữ liệu/);
  assert.match(source, /Đang kiểm tra COT/);
});

test("internal missing page persists COT and applies it to both branches", async () => {
  const source = await readSource("../src/pages/CheckSotNoiTinhPage.tsx");
  assert.match(source, /check-sot-noi-tinh-cot/);
  assert.match(source, /serializeCotCutoffPreferences/);
  assert.match(source, /currentStationReceivedTime/);
  assert.match(source, /filterTransferOrdersByCot/);
  assert.match(source, /fetchLatestTransferOrderCotTimestamp/);
  assert.match(source, /disabled=\{loading\}/);
  assert.match(source, /Giữ lại.*TO trước COT/);
});
```

- [ ] **Step 2: Register and run the UI test to confirm failure**

Append `tests/internalCotUi.test.ts` to `package.json`, then run:

```powershell
node --experimental-strip-types --test tests/internalCotUi.test.ts
```

Expected: FAIL because `CotCutoffControl.tsx` does not exist and the page has no COT orchestration.

- [ ] **Step 3: Build the responsive control component**

Create `src/components/CotCutoffControl.tsx` with this public contract and structure:

```tsx
import { Clock3 } from "lucide-react";
import { parseCotLocalDateTime } from "../utils/cotCutoff";

export interface CotProgress {
  processed: number;
  total: number;
}

interface CotCutoffControlProps {
  enabled: boolean;
  localDateTime: string;
  disabled: boolean;
  progress: CotProgress | null;
  onEnabledChange: (enabled: boolean) => void;
  onDateTimeChange: (value: string) => void;
}

const formatActiveCot = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(parseCotLocalDateTime(value));
  } catch {
    return "Thời gian COT chưa hợp lệ";
  }
};

export const CotCutoffControl = ({
  enabled,
  localDateTime,
  disabled,
  progress,
  onEnabledChange,
  onDateTimeChange,
}: CotCutoffControlProps) => (
  <section className="app-surface p-4 sm:p-5" aria-labelledby="cot-cutoff-heading">
    <div className="grid gap-4 sm:grid-cols-[auto_minmax(14rem,20rem)_minmax(0,1fr)] sm:items-center">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span id="cot-cutoff-heading" className="font-black">Cắt COT</span>
      </label>

      {enabled ? (
        <label className="form-control w-full">
          <span className="label-text mb-1.5 text-sm font-bold">Ngày giờ COT</span>
          <input
            type="datetime-local"
            value={localDateTime}
            disabled={disabled}
            onChange={(event) => onDateTimeChange(event.target.value)}
            className="input input-bordered min-h-11 w-full rounded-xl focus:input-primary"
          />
        </label>
      ) : null}

      <div className="flex min-w-0 items-start gap-2 text-sm text-base-content/65">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="break-safe">
          {progress
            ? `Đang kiểm tra COT: ${progress.processed}/${progress.total} TO`
            : enabled
              ? `Đang áp dụng COT ${formatActiveCot(localDateTime)}`
              : "Đang kiểm tra toàn bộ dữ liệu"}
        </p>
      </div>
    </div>
  </section>
);
```

- [ ] **Step 4: Add persisted preference state and safe toggle initialization**

In `src/pages/CheckSotNoiTinhPage.tsx`, add these imports:

```ts
import {
  CotCutoffControl,
  type CotProgress,
} from "../components/CotCutoffControl";
import {
  createCotWindow,
  formatLocalDateTimeInput,
  isValidCotLocalDateTime,
  parseCotCutoffPreferences,
  serializeCotCutoffPreferences,
  type CotCutoffPreferences,
  type CotWindow,
} from "../utils/cotCutoff";
import { filterTransferOrdersByCot } from "../utils/transferOrderCot";
import { fetchLatestTransferOrderCotTimestamp } from "../utils/transferOrderCotApi";
```

Then add the storage key above the component and the state/effects inside it:

```ts
const COT_STORAGE_KEY = "check-sot-noi-tinh-cot";

const [cotPreferences, setCotPreferences] = useState<CotCutoffPreferences>(() => {
  try {
    return parseCotCutoffPreferences(localStorage.getItem(COT_STORAGE_KEY));
  } catch {
    return { enabled: false, localDateTime: "" };
  }
});
const [cotProgress, setCotProgress] = useState<CotProgress | null>(null);

useEffect(() => {
  try {
    localStorage.setItem(
      COT_STORAGE_KEY,
      serializeCotCutoffPreferences(cotPreferences),
    );
  } catch {
    // The search remains usable when optional browser storage is unavailable.
  }
}, [cotPreferences]);

const handleCotEnabledChange = (enabled: boolean) => {
  setCotPreferences((current) => ({
    enabled,
    localDateTime:
      enabled && !isValidCotLocalDateTime(current.localDateTime)
        ? formatLocalDateTimeInput()
        : current.localDateTime,
  }));
};
```

The type-only imports satisfy `verbatimModuleSyntax`.

- [ ] **Step 5: Snapshot and validate COT before starting either branch**

Inside `checkSotNoiTinh`, after the existing route/cookie guards and before `setLoading(true)`, add:

```ts
let cotWindow: CotWindow | undefined;
if (cotPreferences.enabled) {
  try {
    cotWindow = createCotWindow(cotPreferences.localDateTime);
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : "Thời gian COT không hợp lệ.",
      "warning",
    );
    return;
  }
}

const activeCot = cotWindow;
```

`activeCot` is the immutable search snapshot. Later user state changes cannot alter this run.

- [ ] **Step 6: Apply the five-worker packed cutoff before publishing results**

Replace the section after station filtering in `checkPackedOrders` with:

```ts
const stationOrders = (response.data?.data?.list || []).filter(
  (item: { current_station_name: string }) =>
    item.current_station_name === currentSoc,
) as TransferOrder[];

let resultOrders = stationOrders;
if (activeCot) {
  setCotProgress({ processed: 0, total: stationOrders.length });
  try {
    resultOrders = await filterTransferOrdersByCot(
      stationOrders,
      activeCot.cotTimestamp,
      fetchLatestTransferOrderCotTimestamp,
      (processed, total) => setCotProgress({ processed, total }),
    );
  } finally {
    setCotProgress(null);
  }
}

setOrders(resultOrders);
if (activeCot) {
  showToast(
    `Giữ lại ${resultOrders.length}/${stationOrders.length} TO trước COT`,
    resultOrders.length > 0 ? "success" : "info",
  );
} else if (resultOrders.length === 0) {
  showToast(
    `Không có TO nào bị sót từ ${currentSoc} tới Hub ${hub}`,
    "info",
  );
} else {
  showToast(
    `Tìm thấy ${resultOrders.length} TO sót tới Hub ${hub}`,
    "success",
  );
}
```

Because `setOrders` occurs after `filterTransferOrdersByCot` resolves, any detail/tracking failure leaves the previous successful TO list visible.

- [ ] **Step 7: Apply the loose range and surface packed COT failures once**

Change the settled orchestration to:

```ts
const [packedResult] = await Promise.allSettled([
  checkPackedOrders(),
  looseOrders.run(
    currentSocId,
    [destinationId],
    activeCot?.currentStationReceivedTime,
  ),
]);

if (packedResult.status === "rejected") {
  console.error("[Check sót nội tỉnh]", packedResult.reason);
  const message =
    packedResult.reason instanceof Error ? packedResult.reason.message : "";
  if (message.includes("Không thể kiểm tra COT cho")) {
    showToast(message, "error");
  }
}
```

The per-TO Axios calls suppress their own generic toasts, so this emits one contextual TO error. Existing outbound-search errors continue through the current `apiClient` toast path.

- [ ] **Step 8: Render and lock the controls during a run**

Add below `PageHeader`:

```tsx
<CotCutoffControl
  enabled={cotPreferences.enabled}
  localDateTime={cotPreferences.localDateTime}
  disabled={loading}
  progress={cotProgress}
  onEnabledChange={handleCotEnabledChange}
  onDateTimeChange={(localDateTime) =>
    setCotPreferences((current) => ({ ...current, localDateTime }))
  }
/>
```

Add `disabled={loading}` to the existing `SearchableSelect`. Keep the existing search button's `disabled={loading}`. The control component disables its switch and input from the same flag.

- [ ] **Step 9: Run UI contracts, all focused domain tests, lint, and build**

```powershell
node --experimental-strip-types --test tests/internalCotUi.test.ts tests/cotCutoff.test.ts tests/transferOrderCot.test.ts tests/looseOrders.test.ts
npm run lint
npm run build
```

Expected: every listed test PASS, lint exits `0`, and the production build completes successfully.

- [ ] **Step 10: Commit the UI integration**

```powershell
git add -- src/components/CotCutoffControl.tsx src/pages/CheckSotNoiTinhPage.tsx tests/internalCotUi.test.ts package.json
git commit -m "feat: add COT controls to internal checks"
```

---

### Task 5: Final Regression and Responsive Verification

**Files:**
- Verify all Task 1–4 files.
- Modify only a Task 1–4 source or test file if verification reveals a regression directly caused by this feature.

**Interfaces:**
- Consumes: all implemented COT domain, API, hook, component, and page contracts.
- Produces: test/build evidence and desktop/mobile visual confirmation without staging unrelated user files.

- [ ] **Step 1: Run every feature-relevant test together**

```powershell
node --experimental-strip-types --test tests/cotCutoff.test.ts tests/transferOrderCot.test.ts tests/internalCotUi.test.ts tests/looseOrders.test.ts tests/transferOrderTable.test.ts tests/packedOrderMetrics.test.ts
```

Expected: all tests PASS. Existing TO display/classification behavior remains unchanged.

- [ ] **Step 2: Run the repository test script**

```powershell
npm test
```

Expected: all feature-related tests PASS. The only permitted failures are the two pre-existing `gasAccessControl.test.ts` assertions caused by the intentional `allowed: true` override in `gas/code.gs`; record exact totals.

- [ ] **Step 3: Run lint, TypeScript/production build, and diff checks**

```powershell
npm run lint
npm run build
git diff --check
git status --short
```

Expected: lint/build exit `0`, no whitespace errors, no generated `dist` files staged, and the user files `src/layouts/MobileLayout.tsx` plus `src/pages/HomePage.tsx` remain unstaged.

- [ ] **Step 4: Verify the responsive interaction in a browser**

Run the local Vite application and inspect `/check-sot/noi-tinh` at `375x812`, `812x375`, and `1440x900`, in both light and dark themes.

Verify all of these exact outcomes:

- COT-off text reads `Đang kiểm tra toàn bộ dữ liệu` and no date/time input occupies mobile space.
- Enabling COT fills the current local minute when no stored time exists.
- The date/time input is full-width on narrow screens and the control becomes a single aligned row on desktop where space permits.
- Reload restores enabled state and selected date/time.
- During a search, Hub, switch, date/time, and search button are disabled.
- Progress text fits without horizontal overflow.
- The existing loose summary and compact TO result list remain readable with no page-level horizontal scrolling.
- Interactive targets remain at least 44px high.

- [ ] **Step 5: Inspect the final history and commit a direct verification correction only if needed**

```powershell
git log --oneline -8
git status --short
```

If verification required a feature-scoped correction, stage only the exact affected Task 1–4 files and commit:

```powershell
git add -- src/utils/cotCutoff.ts src/utils/looseOrders.ts src/utils/looseOrdersApi.ts src/hooks/useLooseOrderCheck.ts src/utils/transferOrderCot.ts src/utils/transferOrderCotApi.ts src/components/CotCutoffControl.tsx src/pages/CheckSotNoiTinhPage.tsx tests/cotCutoff.test.ts tests/looseOrders.test.ts tests/transferOrderCot.test.ts tests/internalCotUi.test.ts package.json
git commit -m "fix: stabilize internal COT cutoff"
```

If verification needs no correction, do not create an empty commit.
