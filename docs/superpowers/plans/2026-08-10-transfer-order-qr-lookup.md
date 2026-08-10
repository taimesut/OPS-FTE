# Transfer Order QR Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first `Lấy mã TO` page that looks up a shipment through the Fleet Order API and displays `current_to_number` in the existing full-screen QR modal.

**Architecture:** Keep the API contract in a pure tested utility, place network access in a thin `apiClient` wrapper, and keep page state in one focused React route. Integrate the route into the existing drawer without modifying the user's in-progress `HomePage.tsx` changes.

**Tech Stack:** React 19, TypeScript 6, React Router 7, Axios, Tailwind CSS/DaisyUI, Lucide React, react-qr-code, Node.js built-in test runner

## Global Constraints

- Route: `#/lay-ma-to`.
- Endpoint: `POST /api/fleet_order/order/tracking_list/search`.
- Payload keys and values: `count: 24`, `page_no: 1`, and trimmed `shipment_id`.
- QR value is exactly `current_to_number`; never encode the response object or shipment ID.
- Reuse `QRCodeModal`, `PageHeader`, `apiClient`, `showToast`, and current design-system classes.
- Keep the most recent successful result after modal close or a later failed lookup.
- Do not modify `src/pages/HomePage.tsx`.
- Preserve unrelated untracked skill, lock, and launcher archive files.

---

### Task 1: Transfer-order request and response contract

**Files:**
- Create: `tests/transferOrderLookup.test.ts`
- Create: `src/utils/transferOrderLookup.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `TRANSFER_ORDER_LOOKUP_PATH`, `TransferOrderLookupPayload`, `TransferOrderLookupResult`, `createTransferOrderLookupPayload(shipmentId)`, and `parseTransferOrderLookupResponse(response, requestedShipmentId)`.
- Consumes: Unknown API response values and a user-entered shipment ID.

- [ ] **Step 1: Write failing contract tests**

Create `tests/transferOrderLookup.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createTransferOrderLookupPayload,
  parseTransferOrderLookupResponse,
  TRANSFER_ORDER_LOOKUP_PATH,
} from "../src/utils/transferOrderLookup.ts";

test("builds the exact shipment lookup request", () => {
  assert.equal(
    TRANSFER_ORDER_LOOKUP_PATH,
    "/api/fleet_order/order/tracking_list/search",
  );
  assert.deepEqual(createTransferOrderLookupPayload(" SPXVN062072327098 "), {
    count: 24,
    page_no: 1,
    shipment_id: "SPXVN062072327098",
  });
  assert.throws(() => createTransferOrderLookupPayload("   "), /nhập mã đơn/i);
});

test("extracts current_to_number from the sample response", () => {
  assert.deepEqual(
    parseTransferOrderLookupResponse(
      {
        retcode: 0,
        data: {
          list: [
            {
              shipment_id: "SPXVN062072327098",
              current_to_number: "TO2026081015POF",
            },
          ],
        },
      },
      "SPXVN062072327098",
    ),
    {
      shipmentId: "SPXVN062072327098",
      currentToNumber: "TO2026081015POF",
    },
  );
});

test("selects the exact shipment from a multi-item response", () => {
  const result = parseTransferOrderLookupResponse(
    {
      retcode: 0,
      data: {
        list: [
          { shipment_id: "OTHER", current_to_number: "TO-OTHER" },
          { shipment_id: "TARGET", current_to_number: "TO-TARGET" },
        ],
      },
    },
    "TARGET",
  );
  assert.equal(result.currentToNumber, "TO-TARGET");
});

test("uses a sole response item when the API omits a matching shipment id", () => {
  const result = parseTransferOrderLookupResponse(
    {
      retcode: 0,
      data: { list: [{ current_to_number: "TO-SOLE" }] },
    },
    "REQUESTED",
  );
  assert.deepEqual(result, {
    shipmentId: "REQUESTED",
    currentToNumber: "TO-SOLE",
  });
});

test("rejects API errors, missing orders, mismatches, and missing TO numbers", () => {
  assert.throws(
    () => parseTransferOrderLookupResponse({ retcode: 1001, message: "Hết phiên" }, "A"),
    /Hết phiên/,
  );
  assert.throws(
    () => parseTransferOrderLookupResponse({ retcode: 0, data: { list: [] } }, "A"),
    /không tìm thấy đơn hàng/i,
  );
  assert.throws(
    () =>
      parseTransferOrderLookupResponse(
        {
          retcode: 0,
          data: {
            list: [
              { shipment_id: "B", current_to_number: "TO-B" },
              { shipment_id: "C", current_to_number: "TO-C" },
            ],
          },
        },
        "A",
      ),
    /không tìm thấy đơn hàng/i,
  );
  assert.throws(
    () =>
      parseTransferOrderLookupResponse(
        { retcode: 0, data: { list: [{ shipment_id: "A", current_to_number: "" }] } },
        "A",
      ),
    /chưa có mã TO/i,
  );
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --experimental-strip-types --test tests/transferOrderLookup.test.ts`

Expected: FAIL because `src/utils/transferOrderLookup.ts` does not exist.

- [ ] **Step 3: Implement the pure contract utility**

Create `src/utils/transferOrderLookup.ts`:

```ts
export const TRANSFER_ORDER_LOOKUP_PATH =
  "/api/fleet_order/order/tracking_list/search";

export interface TransferOrderLookupPayload {
  count: 24;
  page_no: 1;
  shipment_id: string;
}

export interface TransferOrderLookupResult {
  shipmentId: string;
  currentToNumber: string;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null ? (value as UnknownRecord) : null;

export const createTransferOrderLookupPayload = (
  shipmentId: string,
): TransferOrderLookupPayload => {
  const normalizedShipmentId = shipmentId.trim();
  if (!normalizedShipmentId) {
    throw new Error("Vui lòng nhập mã đơn hàng.");
  }

  return {
    count: 24,
    page_no: 1,
    shipment_id: normalizedShipmentId,
  };
};

export const parseTransferOrderLookupResponse = (
  response: unknown,
  requestedShipmentId: string,
): TransferOrderLookupResult => {
  const root = asRecord(response);
  if (!root) {
    throw new Error("Phản hồi tra cứu không hợp lệ.");
  }

  if (root.retcode !== 0) {
    const message =
      typeof root.message === "string" && root.message.trim()
        ? root.message.trim()
        : "Không thể tra cứu mã TO.";
    throw new Error(message);
  }

  const data = asRecord(root.data);
  const list = Array.isArray(data?.list)
    ? data.list.map(asRecord).filter((item): item is UnknownRecord => item !== null)
    : [];

  if (list.length === 0) {
    throw new Error("Không tìm thấy đơn hàng.");
  }

  const normalizedShipmentId = requestedShipmentId.trim();
  const exactItem = list.find(
    (item) => String(item.shipment_id ?? "").trim() === normalizedShipmentId,
  );
  const item = exactItem ?? (list.length === 1 ? list[0] : undefined);

  if (!item) {
    throw new Error("Không tìm thấy đơn hàng.");
  }

  const currentToNumber = String(item.current_to_number ?? "").trim();
  if (!currentToNumber) {
    throw new Error("Đơn hàng chưa có mã TO.");
  }

  return {
    shipmentId: normalizedShipmentId,
    currentToNumber,
  };
};
```

- [ ] **Step 4: Add the focused test to the default suite**

Set the `test` script in `package.json` to:

```json
"test": "node --experimental-strip-types --test tests/looseOrders.test.ts tests/stations.test.ts tests/launcher.test.ts tests/gasAccessControl.test.ts tests/transferOrderLookup.test.ts"
```

- [ ] **Step 5: Run focused and default tests**

Run: `node --experimental-strip-types --test tests/transferOrderLookup.test.ts`

Expected: 5 tests PASS.

Run: `npm test`

Expected: All existing and transfer-order tests PASS.

- [ ] **Step 6: Commit the API contract**

```bash
git add tests/transferOrderLookup.test.ts src/utils/transferOrderLookup.ts package.json
git commit -m "feat: add transfer order lookup contract"
```

### Task 2: Fleet Order API wrapper

**Files:**
- Create: `src/utils/transferOrderLookupApi.ts`

**Interfaces:**
- Consumes: `apiClient`, `TRANSFER_ORDER_LOOKUP_PATH`, `createTransferOrderLookupPayload`, and `parseTransferOrderLookupResponse`.
- Produces: `fetchTransferOrderNumber(shipmentId): Promise<TransferOrderLookupResult>`.

- [ ] **Step 1: Implement the thin API wrapper**

Create `src/utils/transferOrderLookupApi.ts`:

```ts
import apiClient from "./apiClient";
import {
  createTransferOrderLookupPayload,
  parseTransferOrderLookupResponse,
  TRANSFER_ORDER_LOOKUP_PATH,
  type TransferOrderLookupResult,
} from "./transferOrderLookup";

export const fetchTransferOrderNumber = async (
  shipmentId: string,
): Promise<TransferOrderLookupResult> => {
  const payload = createTransferOrderLookupPayload(shipmentId);
  const response = await apiClient.post(TRANSFER_ORDER_LOOKUP_PATH, payload, {
    suppressErrorToast: true,
  });

  return parseTransferOrderLookupResponse(response.data, payload.shipment_id);
};
```

- [ ] **Step 2: Type-check the wrapper through the production build**

Run: `npm run build`

Expected: PASS without TypeScript errors.

- [ ] **Step 3: Commit the API wrapper**

```bash
git add src/utils/transferOrderLookupApi.ts
git commit -m "feat: add transfer order lookup API"
```

### Task 3: Mobile lookup page and QR result

**Files:**
- Create: `src/pages/LayMaTOPage.tsx`

**Interfaces:**
- Consumes: `fetchTransferOrderNumber`, `getCookies`, `PageHeader`, `QRCodeModal`, and `showToast`.
- Produces: `LayMaTOPage`, with manual lookup, loading, latest-result state, automatic modal opening, and QR reopening.

- [ ] **Step 1: Implement the complete page**

Create `src/pages/LayMaTOPage.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import { PackageCheck, QrCode, Search } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import QRCodeModal from "../components/QRCodeModal";
import { showToast } from "../components/Toast";
import { getCookies } from "../utils/config";
import type { TransferOrderLookupResult } from "../utils/transferOrderLookup";
import { fetchTransferOrderNumber } from "../utils/transferOrderLookupApi";

const LOOKUP_ERROR_MESSAGE =
  "Không thể lấy mã TO. Vui lòng kiểm tra kết nối và thử lại.";

export const LayMaTOPage = () => {
  const [shipmentId, setShipmentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransferOrderLookupResult | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const handleLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedShipmentId = shipmentId.trim();

    if (!normalizedShipmentId) {
      showToast("Vui lòng nhập mã đơn hàng.", "warning");
      return;
    }

    if (!getCookies()) {
      showToast(
        "Chưa có Cookie SPX. Vui lòng cập nhật trong Cài đặt.",
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      const nextResult = await fetchTransferOrderNumber(normalizedShipmentId);
      setResult(nextResult);
      setQrOpen(true);
      showToast(`Đã lấy mã TO ${nextResult.currentToNumber}.`, "success");
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : LOOKUP_ERROR_MESSAGE;
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={QrCode}
        title="Lấy mã Transfer Order"
        description="Tra cứu mã TO từ mã đơn hàng và hiển thị QR để quét nhanh."
      />

      <section className="app-surface overflow-hidden" aria-labelledby="to-lookup-heading">
        <div className="border-b border-base-200 bg-base-200/40 px-4 py-3 sm:px-5">
          <h2 id="to-lookup-heading" className="font-extrabold">
            Nhập mã đơn hàng
          </h2>
          <p className="mt-1 text-xs text-base-content/60">
            Ví dụ: SPXVN062072327098
          </p>
        </div>

        <form onSubmit={handleLookup} className="grid gap-4 p-4 sm:p-5">
          <label className="form-control w-full">
            <span className="label-text mb-2 text-sm">Mã đơn hàng SPX</span>
            <input
              type="text"
              value={shipmentId}
              onChange={(event) => setShipmentId(event.target.value)}
              placeholder="Nhập mã đơn hàng"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
              className="input input-bordered min-h-12 w-full rounded-xl font-mono uppercase focus:input-primary"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary min-h-12 w-full gap-2 rounded-xl shadow-xs sm:w-fit sm:min-w-40"
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Đang lấy mã TO
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Lấy mã TO
              </>
            )}
          </button>
        </form>
      </section>

      <section aria-live="polite" aria-labelledby="latest-to-heading">
        {result ? (
          <div className="app-surface p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="app-icon-badge shrink-0 bg-success/10 text-success">
                <PackageCheck aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="latest-to-heading" className="app-section-title">
                  Kết quả gần nhất
                </h2>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-base-content/55">Mã đơn</dt>
                    <dd className="break-safe mt-1 font-mono font-semibold">
                      {result.shipmentId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-base-content/55">Mã TO</dt>
                    <dd className="break-safe mt-1 font-mono text-lg font-black text-primary">
                      {result.currentToNumber}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className="btn btn-outline btn-primary mt-5 min-h-11 w-full gap-2 rounded-xl sm:w-auto"
                >
                  <QrCode className="h-4 w-4" />
                  Hiện lại QR
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="app-surface p-5 text-center text-sm text-base-content/60">
            Kết quả TO gần nhất sẽ xuất hiện tại đây.
          </div>
        )}
      </section>

      <QRCodeModal
        open={qrOpen && result !== null}
        value={result?.currentToNumber ?? ""}
        title="Mã QR Transfer Order"
        description={result ? <>Mã đơn: {result.shipmentId}</> : undefined}
        onClose={() => setQrOpen(false)}
      />
    </div>
  );
};
```

- [ ] **Step 2: Run lint and build**

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS with no React or TypeScript errors.

- [ ] **Step 3: Commit the page**

```bash
git add src/pages/LayMaTOPage.tsx
git commit -m "feat: add transfer order QR page"
```

### Task 4: Route and drawer navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/layouts/MobileLayout.tsx`

**Interfaces:**
- Consumes: `LayMaTOPage` from Task 3 and Lucide's `QrCode` icon.
- Produces: Reachable route `/lay-ma-to` and active drawer item `Lấy mã TO`.

- [ ] **Step 1: Register the page route**

In `src/App.tsx`, import:

```tsx
import { LayMaTOPage } from "./pages/LayMaTOPage";
```

Add inside `<Routes>` before the wildcard route:

```tsx
<Route path="/lay-ma-to" element={<LayMaTOPage />} />
```

- [ ] **Step 2: Add the drawer item**

Add `QrCode` to the existing Lucide import in `src/layouts/MobileLayout.tsx`, then append this item to `navItems`:

```tsx
{
  path: "/lay-ma-to",
  label: "Lấy mã TO",
  icon: QrCode,
},
```

- [ ] **Step 3: Run all automated checks**

Run: `npm test`

Expected: All tests PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit route integration**

```bash
git add src/App.tsx src/layouts/MobileLayout.tsx
git commit -m "feat: link transfer order QR lookup"
```

### Task 5: Apps Script packaging and mobile QA

**Files:**
- Modify mechanically: `gas/index.html`
- Verify: `gas/code.gs`

**Interfaces:**
- Consumes: Production `dist/index.html` generated from all completed frontend tasks.
- Produces: Apps Script-ready `gas/index.html` containing the new page; verified mobile behavior without changing server authorization.

- [ ] **Step 1: Build and copy the single-file app**

Run:

```powershell
npm run build
Copy-Item -LiteralPath 'dist\index.html' -Destination 'gas\index.html' -Force
```

Expected: `gas/index.html` contains `/lay-ma-to`, `Lấy mã TO`, and the endpoint string.

- [ ] **Step 2: Verify the packaged feature and authorization source**

Run:

```powershell
rg -n "lay-ma-to|Lấy mã TO|tracking_list/search" gas/index.html
rg -n "getCurrentUserAccess_|createAccessDeniedOutput_|status: 403" gas/code.gs
```

Expected: Frontend feature markers appear in `gas/index.html`; email access protection remains in `gas/code.gs`.

- [ ] **Step 3: QA the route at a mobile viewport**

Run: `npm run dev -- --host 127.0.0.1`

Open: `http://127.0.0.1:5173/#/lay-ma-to` at 390 × 844.

Verify:

```text
- No horizontal scrolling.
- Input and primary button are at least 44px tall.
- Empty input remains on the page and shows a warning.
- Loading copy reads “Đang lấy mã TO”.
- A mocked or live successful response opens QRCodeModal with value current_to_number.
- Closing the modal preserves the latest result and “Hiện lại QR” reopens it.
- Drawer item closes the drawer and remains visibly active on /lay-ma-to.
```

- [ ] **Step 4: Run final checks and inspect the working tree**

Run: `npm test`

Expected: All tests PASS.

Run: `npm run lint`

Expected: PASS.

Run: `git diff --check`

Expected: No whitespace errors.

Run: `git status --short`

Expected: Only `gas/index.html` remains as an intended tracked change plus the user's pre-existing unrelated changes and untracked files.

- [ ] **Step 5: Commit the Apps Script bundle**

```bash
git add gas/index.html
git commit -m "build: package transfer order QR lookup"
```
