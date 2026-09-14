# Google Sheet Incident Log Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gửi đầy đủ dữ liệu biên bản từ userscript vào `LogSutVu` và tự điền mẫu `Biên bản sự vụ` khi người dùng nhập LH Trip tại ô `L3`.

**Architecture:** Frontend tạo payload schema 1 bằng hàm thuần đã kiểm thử nhưng vẫn giữ `lhTrip` và `incidentLogs` cho dữ liệu cũ. Google Apps Script giữ entry point `doPost` trong `gas/code.gs`, chuyển logic sang module `gas/incident-report.gs`, lưu log dạng cột + JSON, và dùng `onEdit` cùng document lock để lookup bản ghi mới nhất, quản lý dòng động và điền mẫu an toàn.

**Tech Stack:** React 19, TypeScript 6, Google Apps Script V8, Spreadsheet service, LockService, PropertiesService, Node built-in test runner, Node VM mocks, repository GAS bundler, Vite userscript build.

## Global Constraints

- Sheet nguồn có tên chính xác `LogSutVu`.
- Trigger chỉ phản ứng với edit một ô tại `Biên bản sự vụ!L3`.
- Không dùng `trip_station` và không gọi SPX API từ Apps Script.
- Payload schema hiện tại là số `1`; giữ hai field legacy `lhTrip` và `incidentLogs`.
- Hai cột A/B của `LogSutVu` giữ tên/vị trí `LH TRIP`, `Đơn sự vụ`; schema mới dùng A:P.
- `doPost` không được fallback sang active sheet.
- Lấy bản ghi khớp mới nhất bằng cách tìm từ hàng cuối lên hàng 2.
- Chỉ chấp nhận các lý do `Rách`, `Bung seal`, `Không TO`, `Thiếu`, `Bể vỡ`, `Dư`, `Khác`.
- Vùng bảng mặc định là A21:I50; khi quá 30 mã phải chèn đủ dòng trước hàng chữ ký cơ sở 51 và dọn đúng các dòng đã chèn ở lần load sau.
- Các ô người lập, chức vụ, nơi gửi và số kiện thực nhận không có nguồn tin cậy phải được giữ nguyên.
- Mọi thay đổi cấu trúc/ghi dữ liệu sheet chạy trong document lock.
- Không lưu Cookie SPX, token hoặc shared secret trong Google Sheet.
- Không chỉnh sửa file `Record biên bản.xlsx`.

---

## File Structure

- Modify `src/features/incident-report/incidentReport.ts`: giữ thêm `tripSource`, `costType`, định nghĩa payload schema 1 và builder thuần.
- Modify `tests/incidentReport.test.ts`: test parser field mới và payload frontend.
- Modify `src/pages/TaoBienBanSuVuPage.tsx`: dùng builder schema 1 trong handler gửi log.
- Modify `gas/code.gs`: thay implementation `doPost` cũ bằng entry point gọi module chuyên trách.
- Create `gas/incident-report.gs`: validation, append `LogSutVu`, parse legacy, lookup, mapping và quản lý dòng biên bản.
- Create `tests/incidentReportGas.test.ts`: Node VM harness cho SpreadsheetApp/LockService/PropertiesService/ContentService.
- Modify `package.json`: đăng ký test Apps Script mới.
- Regenerate `gas-dist/code.gs`: bundle deployable từ mọi file `.gs` trong `gas`.
- Modify `vite.userscript.config.ts`: nâng metadata từ `0.6.0` lên `0.7.0`.
- Regenerate `userscript-dist/ops-fte.user.js`: userscript gửi payload schema 1.

---

### Task 1: Structured frontend log payload

**Files:**
- Modify: `src/features/incident-report/incidentReport.ts`
- Modify: `tests/incidentReport.test.ts`

**Interfaces:**
- Consumes: `TripSummary`, optional `TripDetails`, `IncidentItem[]`, SOC name and a valid `Date`.
- Produces: extended `TripDetails.tripSource: number | null`, `TripDetails.costType: number | null`, `IncidentLogPayload`, and `createIncidentLogPayload(input: IncidentLogPayloadInput): IncidentLogPayload`.

- [ ] **Step 1: Write failing parser and payload tests**

Extend the import in `tests/incidentReport.test.ts` with `createIncidentLogPayload`, then append:

```ts
test("keeps trip source and cost type from detail_v2", () => {
  const details = parseTripDetailResponse({
    retcode: 0,
    data: {
      id: 296766439,
      trip_number: "LT0Q944WOQG72",
      trip_source: 0,
      cost_type: 1,
      seal_code_list: [],
    },
  });
  assert.equal(details.tripSource, 0);
  assert.equal(details.costType, 1);
});

test("builds a schema-1 incident payload and preserves the legacy log", () => {
  const tripSummary = parseTripSearchResponse({
    retcode: 0,
    data: { list: [trip] },
  })[0];
  const details = parseTripDetailResponse({
    retcode: 0,
    data: {
      ...trip,
      trip_type_name: "By Land",
      trip_source: 0,
      cost_type: 1,
      seal_code: "SEAL-1",
      seal_code_list: [],
      remark_loading_quantity: 68,
    },
  });
  const items = mergeIncidentCodes(
    mergeIncidentCodes([], ["SPXVN001"], "Rách", "manual"),
    ["SPXVN001"],
    "Thiếu",
    "auto",
  );

  assert.deepEqual(
    createIncidentLogPayload({
      soc: " Pleiku SOC ",
      createdAt: new Date("2026-09-05T11:00:00.000Z"),
      tripSummary,
      tripDetails: details,
      items,
    }),
    {
      schemaVersion: 1,
      lhTrip: "LT0Q944WOQG72",
      incidentLogs: "SPXVN001@Rách + Thiếu",
      soc: "Pleiku SOC",
      createdAt: "2026-09-05T11:00:00.000Z",
      trip: {
        id: 296766439,
        tripNumber: "LT0Q944WOQG72",
        tripName: trip.trip_name,
        tripDate: trip.trip_date,
        tripTypeName: "By Land",
        tripSource: 0,
        costType: 1,
        driverName: trip.driver_name,
        secondDriverName: "",
        vehicleNumber: trip.vehicle_number,
        vehicleTypeName: trip.vehicle_type_name,
        agencyName: trip.agency_name,
        sealCodes: ["SEAL-1"],
        remark: "",
        operator: "",
        expectedQuantity: 68,
      },
      incidents: [{ code: "SPXVN001", reasons: ["Rách", "Thiếu"] }],
    },
  );
});

test("payload builder rejects mismatched trips, empty items and invalid dates", () => {
  const summary = parseTripSearchResponse({
    retcode: 0,
    data: { list: [trip] },
  })[0];
  assert.throws(
    () =>
      createIncidentLogPayload({
        soc: "SOC",
        createdAt: new Date(),
        tripSummary: summary,
        tripDetails: { ...parseTripDetailResponse({ retcode: 0, data: { ...trip, seal_code_list: [] } }), tripNumber: "LT-OTHER" },
        items: mergeIncidentCodes([], ["SPX-1"], "Khác", "manual"),
      }),
    /không khớp/i,
  );
  assert.throws(
    () => createIncidentLogPayload({ soc: "SOC", createdAt: new Date(), tripSummary: summary, tripDetails: null, items: [] }),
    /sự vụ/i,
  );
  assert.throws(
    () => createIncidentLogPayload({ soc: "SOC", createdAt: new Date("invalid"), tripSummary: summary, tripDetails: null, items: mergeIncidentCodes([], ["SPX-1"], "Khác", "manual") }),
    /thời gian/i,
  );
});
```

- [ ] **Step 2: Run the focused test and verify the new export/fields fail**

Run:

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
```

Expected: FAIL because `createIncidentLogPayload` is not exported and detail results do not contain `tripSource`/`costType`.

- [ ] **Step 3: Extend the domain types and detail parser**

Add these fields to `TripDetails`:

```ts
tripSource: number | null;
costType: number | null;
```

Add them in `parseTripDetailResponse`:

```ts
tripSource: finiteNumber(data.trip_source),
costType: finiteNumber(data.cost_type),
```

Update the existing detail expected object in the earlier test to include:

```ts
tripSource: null,
costType: null,
```

- [ ] **Step 4: Implement the schema types and payload builder**

Append to `incidentReport.ts`:

```ts
export interface IncidentLogTrip {
  id: number;
  tripNumber: string;
  tripName: string;
  tripDate: number;
  tripTypeName: string;
  tripSource: number | null;
  costType: number | null;
  driverName: string;
  secondDriverName: string;
  vehicleNumber: string;
  vehicleTypeName: string;
  agencyName: string;
  sealCodes: string[];
  remark: string;
  operator: string;
  expectedQuantity: number | null;
}

export interface IncidentLogPayload {
  schemaVersion: 1;
  lhTrip: string;
  incidentLogs: string;
  soc: string;
  createdAt: string;
  trip: IncidentLogTrip;
  incidents: Array<{ code: string; reasons: IncidentReason[] }>;
}

export interface IncidentLogPayloadInput {
  soc: string;
  createdAt: Date;
  tripSummary: TripSummary;
  tripDetails: TripDetails | null;
  items: readonly IncidentItem[];
}

export const createIncidentLogPayload = ({
  soc,
  createdAt,
  tripSummary,
  tripDetails,
  items,
}: IncidentLogPayloadInput): IncidentLogPayload => {
  if (!Number.isFinite(createdAt.valueOf())) {
    throw new Error("Thời gian lập biên bản không hợp lệ.");
  }
  if (items.length === 0) {
    throw new Error("Biên bản chưa có mã sự vụ.");
  }
  const lhTrip = normalizeSearchTerm(
    tripDetails?.tripNumber || tripSummary.tripNumber,
  );
  const summaryTrip = normalizeSearchTerm(tripSummary.tripNumber);
  if (!lhTrip || !summaryTrip || lhTrip !== summaryTrip) {
    throw new Error("LH Trip chi tiết không khớp chuyến đã chọn.");
  }
  const trip: IncidentLogTrip = {
    id: tripSummary.id,
    tripNumber: lhTrip,
    tripName: tripDetails?.tripName || tripSummary.tripName,
    tripDate: tripDetails?.tripDate || tripSummary.tripDate,
    tripTypeName: tripDetails?.tripTypeName || "",
    tripSource: tripDetails?.tripSource ?? null,
    costType: tripDetails?.costType ?? null,
    driverName: tripDetails?.driverName || tripSummary.driverName,
    secondDriverName:
      tripDetails?.secondDriverName || tripSummary.secondDriverName,
    vehicleNumber: tripDetails?.vehicleNumber || tripSummary.vehicleNumber,
    vehicleTypeName:
      tripDetails?.vehicleTypeName || tripSummary.vehicleTypeName,
    agencyName: tripDetails?.agencyName || tripSummary.agencyName,
    sealCodes: [...(tripDetails?.sealCodes ?? [])],
    remark: tripDetails?.remark || "",
    operator: tripDetails?.operator || "",
    expectedQuantity: tripDetails?.expectedQuantity ?? null,
  };
  return {
    schemaVersion: 1,
    lhTrip,
    incidentLogs: formatIncidentLog(items),
    soc: soc.trim(),
    createdAt: createdAt.toISOString(),
    trip,
    incidents: items.map((item) => ({
      code: item.code,
      reasons: [...item.reasons],
    })),
  };
};
```

- [ ] **Step 5: Run focused tests, typecheck and commit**

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
node node_modules/typescript/lib/tsc.js -b --pretty false
git add src/features/incident-report/incidentReport.ts tests/incidentReport.test.ts
git commit -m "feat: create structured incident log payload"
```

Expected: incident tests PASS, TypeScript exits 0, and the commit contains only domain/test changes.

---

### Task 2: Send schema 1 from the incident report page

**Files:**
- Modify: `src/pages/TaoBienBanSuVuPage.tsx:454-493`

**Interfaces:**
- Consumes: `selectedTrip`, `detailBranch.data`, `socName`, `createdAt`, `items`, `createIncidentLogPayload`.
- Produces: the exact JSON body accepted by Apps Script while keeping the existing `text/plain` and `no-cors` transport.

- [ ] **Step 1: Import and derive the structured payload at send time**

Add `createIncidentLogPayload` to the existing domain import. Inside `handleSendLogToGgSheet`, after the `items.length` guard, add an explicit selected-trip guard:

```tsx
if (!selectedTrip) {
  showToast("Chưa chọn LH Trip để gửi log.", "warning");
  return;
}
```

Create the payload inside the `try` so builder errors reach the existing error branch:

```tsx
const payload = createIncidentLogPayload({
  soc: socName,
  createdAt,
  tripSummary: selectedTrip,
  tripDetails: detailBranch.data,
  items,
});
```

- [ ] **Step 2: Replace only the POST body**

Keep the endpoint, method, mode and content type unchanged. Replace the inline two-field object with:

```tsx
await fetch(logUrl, {
  method: "POST",
  mode: "no-cors",
  headers: { "Content-Type": "text/plain" },
  body: JSON.stringify(payload),
});
```

Do not send cookies, API response objects or `trip_station`.

- [ ] **Step 3: Verify frontend behavior and commit**

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
node node_modules/typescript/lib/tsc.js -b --pretty false
node node_modules/eslint/bin/eslint.js src/pages/TaoBienBanSuVuPage.tsx src/features/incident-report/incidentReport.ts tests/incidentReport.test.ts
git add src/pages/TaoBienBanSuVuPage.tsx
git commit -m "feat: send structured incident logs"
```

Expected: tests, TypeScript and lint exit 0; transport remains compatible with a deployed Apps Script Web App.

---

### Task 3: Validated `doPost` and `LogSutVu` schema

**Files:**
- Create: `gas/incident-report.gs`
- Modify: `gas/code.gs:506-538`
- Create: `tests/incidentReportGas.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Apps Script event `{ postData: { contents: string } }`, `SpreadsheetApp`, `LockService`, `ContentService`.
- Produces: `handleIncidentReportPost_(e)`, `parseIncidentRequest_(e)`, `parseLegacyIncidentLogs_(value)`, `ensureIncidentLogSheet_(spreadsheet)`, and public `doPost(e)` delegation.

- [ ] **Step 1: Register the GAS test and create a VM harness**

Add `tests/incidentReportGas.test.ts` to the end of the explicit `test` script in `package.json`.

Create the test file with a harness that evaluates both GAS sources:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const HEADERS = [
  "LH TRIP", "Đơn sự vụ", "Thời gian nhận", "SOC", "Trip ID",
  "Trip Name", "Trip Date", "Trip Type", "Vehicle Plate", "Vehicle Type",
  "Driver", "Helper", "Agency", "Seal", "Expected Quantity", "Payload JSON",
];

async function createPostHarness(existingRows: unknown[][] = []) {
  const [code, incident] = await Promise.all([
    readFile(new URL("../gas/code.gs", import.meta.url), "utf8"),
    readFile(new URL("../gas/incident-report.gs", import.meta.url), "utf8"),
  ]);
  const rows = existingRows.map((row) => [...row]);
  let createdSheet = false;
  let activeSheetRead = false;
  let lockDepth = 0;
  const range = (row: number, column: number, numRows = 1, numColumns = 1) => ({
    getValues: () => Array.from({ length: numRows }, (_, rowIndex) =>
      Array.from({ length: numColumns }, (_, columnIndex) =>
        rows[row - 1 + rowIndex]?.[column - 1 + columnIndex] ?? "")),
    setValues: (values: unknown[][]) => {
      values.forEach((valuesRow, rowIndex) => {
        rows[row - 1 + rowIndex] ??= [];
        valuesRow.forEach((value, columnIndex) => {
          rows[row - 1 + rowIndex][column - 1 + columnIndex] = value;
        });
      });
    },
  });
  const sheet = {
    getLastRow: () => rows.length,
    getRange: range,
    appendRow: (row: unknown[]) => rows.push([...row]),
  };
  const spreadsheet = {
    getSheetByName: (name: string) => name === "LogSutVu" && (createdSheet || rows.length > 0) ? sheet : null,
    insertSheet: (name: string) => { assert.equal(name, "LogSutVu"); createdSheet = true; return sheet; },
    getActiveSheet: () => { activeSheetRead = true; return sheet; },
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: { getDocumentLock: () => ({ waitLock: () => { lockDepth += 1; }, releaseLock: () => { lockDepth -= 1; } }) },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput: (content: string) => ({ content, setMimeType() { return this; } }),
    },
    JSON,
    Date,
    console: { error() {} },
  });
  vm.runInContext(`${code}\n${incident}`, context);
  return { context, rows, HEADERS, wasActiveSheetRead: () => activeSheetRead, lockDepth: () => lockDepth };
}
```

- [ ] **Step 2: Write failing `doPost` tests**

Append:

```ts
const payload = {
  schemaVersion: 1,
  lhTrip: "LT0Q944WOQG72",
  incidentLogs: "SPXVN001@Rách + Thiếu",
  soc: "Pleiku SOC",
  createdAt: "2026-09-05T11:00:00.000Z",
  trip: {
    id: 296766439, tripNumber: "LT0Q944WOQG72", tripName: "Trip name",
    tripDate: 1788454800, tripTypeName: "By Land", tripSource: 0, costType: 1,
    driverName: "Driver", secondDriverName: "", vehicleNumber: "29E-259.57",
    vehicleTypeName: "Truck_8T60m3", agencyName: "Agency", sealCodes: ["S1"],
    remark: "", operator: "operator", expectedQuantity: 68,
  },
  incidents: [{ code: "SPXVN001", reasons: ["Rách", "Thiếu"] }],
};

test("doPost creates LogSutVu, writes A:P and never reads the active sheet", async () => {
  const harness = await createPostHarness();
  const output = harness.context.doPost({ postData: { contents: JSON.stringify(payload) } });
  assert.equal(JSON.parse(output.content).status, "success");
  assert.deepEqual(harness.rows[0], HEADERS);
  assert.equal(harness.rows[1][0], payload.lhTrip);
  assert.equal(harness.rows[1][1], payload.incidentLogs);
  assert.equal(harness.rows[1][3], payload.soc);
  assert.equal(harness.rows[1][4], payload.trip.id);
  assert.deepEqual(JSON.parse(String(harness.rows[1][15])), payload);
  assert.equal(harness.wasActiveSheetRead(), false);
  assert.equal(harness.lockDepth(), 0);
});

test("doPost extends a legacy two-column header without changing legacy rows", async () => {
  const legacy = [["LH TRIP", "Đơn sự vụ"], ["LT-OLD", "SPX-OLD@Thiếu"]];
  const harness = await createPostHarness(legacy);
  harness.context.doPost({ postData: { contents: JSON.stringify(payload) } });
  assert.deepEqual(harness.rows[0], HEADERS);
  assert.deepEqual(harness.rows[1].slice(0, 2), legacy[1]);
  assert.equal(harness.rows[2][0], payload.lhTrip);
});

test("doPost still accepts the legacy two-field payload", async () => {
  const harness = await createPostHarness();
  const legacyPayload = { lhTrip: "LT-OLD", incidentLogs: "SPX-OLD@Thiếu" };
  const output = harness.context.doPost({ postData: { contents: JSON.stringify(legacyPayload) } });
  assert.equal(JSON.parse(output.content).status, "success");
  assert.deepEqual(harness.rows[1].slice(0, 2), [legacyPayload.lhTrip, legacyPayload.incidentLogs]);
  assert.equal(harness.rows[1][15], "");
});

test("doPost rejects malformed data without appending", async () => {
  for (const body of [
    "not-json",
    JSON.stringify({ ...payload, lhTrip: "" }),
    JSON.stringify({ ...payload, createdAt: "not-a-date" }),
    JSON.stringify({ ...payload, trip: { ...payload.trip, tripDate: "1788454800" } }),
    JSON.stringify({ ...payload, incidents: [{ code: "SPX", reasons: ["Sai"] }] }),
  ]) {
    const harness = await createPostHarness([["LH TRIP", "Đơn sự vụ"]]);
    const output = harness.context.doPost({ postData: { contents: body } });
    assert.equal(JSON.parse(output.content).status, "error");
    assert.equal(harness.rows.length, 1);
    assert.equal(harness.lockDepth(), 0);
  }
});
```

- [ ] **Step 3: Run the GAS test and verify the module is missing**

```powershell
node --experimental-strip-types --test tests/incidentReportGas.test.ts
```

Expected: FAIL with `ENOENT` for `gas/incident-report.gs`.

- [ ] **Step 4: Create GAS constants, validators and legacy parser**

Create `gas/incident-report.gs` with these exact constants and validation rules:

```js
var INCIDENT_LOG_SHEET_NAME_ = "LogSutVu";
var INCIDENT_REPORT_SHEET_NAME_ = "Biên bản sự vụ";
var INCIDENT_SCHEMA_VERSION_ = 1;
var INCIDENT_MAX_BODY_LENGTH_ = 500000;
var INCIDENT_MAX_ITEMS_ = 2000;
var INCIDENT_REASONS_ = ["Rách", "Bung seal", "Không TO", "Thiếu", "Bể vỡ", "Dư", "Khác"];
var INCIDENT_LOG_HEADERS_ = [
  "LH TRIP", "Đơn sự vụ", "Thời gian nhận", "SOC", "Trip ID",
  "Trip Name", "Trip Date", "Trip Type", "Vehicle Plate", "Vehicle Type",
  "Driver", "Helper", "Agency", "Seal", "Expected Quantity", "Payload JSON"
];

function incidentText_(value, maxLength) {
  var text = typeof value === "string" ? value.trim() : "";
  if (text.length > maxLength) throw new Error("Dữ liệu log vượt quá độ dài cho phép.");
  return text;
}

function normalizeIncidentReason_(value) {
  var reason = incidentText_(value, 40);
  return INCIDENT_REASONS_.indexOf(reason) >= 0 ? reason : "";
}

function parseLegacyIncidentLogs_(value) {
  var byCode = Object.create(null);
  var result = [];
  incidentText_(value, INCIDENT_MAX_BODY_LENGTH_).split("#").forEach(function (segment) {
    var separator = segment.indexOf("@");
    if (separator <= 0) return;
    var code = incidentText_(segment.slice(0, separator), 120).toUpperCase();
    var reasons = segment.slice(separator + 1).split(" + ").map(normalizeIncidentReason_).filter(Boolean);
    if (!code || !reasons.length) return;
    if (!byCode[code]) {
      byCode[code] = { code: code, reasons: [] };
      result.push(byCode[code]);
    }
    reasons.forEach(function (reason) {
      if (byCode[code].reasons.indexOf(reason) < 0) byCode[code].reasons.push(reason);
    });
  });
  if (result.length === 0 || result.length > INCIDENT_MAX_ITEMS_) {
    throw new Error("Danh sách sự vụ không hợp lệ.");
  }
  return result;
}

function normalizeStructuredIncidents_(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > INCIDENT_MAX_ITEMS_) {
    throw new Error("Danh sách sự vụ không hợp lệ.");
  }
  var byCode = Object.create(null);
  var result = [];
  items.forEach(function (item) {
    var code = incidentText_(item && item.code, 120).toUpperCase();
    var reasons = item && Array.isArray(item.reasons)
      ? item.reasons.map(normalizeIncidentReason_).filter(Boolean)
      : [];
    if (!code || reasons.length === 0 || reasons.length !== item.reasons.length) {
      throw new Error("Mã hoặc lý do sự vụ không hợp lệ.");
    }
    if (!byCode[code]) {
      byCode[code] = { code: code, reasons: [] };
      result.push(byCode[code]);
    }
    reasons.forEach(function (reason) {
      if (byCode[code].reasons.indexOf(reason) < 0) byCode[code].reasons.push(reason);
    });
  });
  return result;
}

function incidentOptionalNumber_(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !isFinite(value)) {
    throw new Error(label + " không hợp lệ.");
  }
  return value;
}

function normalizeIncidentTrip_(value, lhTrip) {
  if (!value || typeof value !== "object" || !Number.isInteger(value.id) || value.id <= 0) {
    throw new Error("Thông tin LH Trip không hợp lệ.");
  }
  var tripNumber = incidentText_(value.tripNumber, 80).toUpperCase();
  if (tripNumber !== lhTrip) throw new Error("Thông tin LH Trip không khớp.");
  if (!Array.isArray(value.sealCodes)) throw new Error("Danh sách seal không hợp lệ.");
  return {
    id: value.id,
    tripNumber: tripNumber,
    tripName: incidentText_(value.tripName, 240),
    tripDate: incidentOptionalNumber_(value.tripDate, "Ngày chuyến"),
    tripTypeName: incidentText_(value.tripTypeName, 80),
    tripSource: incidentOptionalNumber_(value.tripSource, "Nguồn chuyến"),
    costType: incidentOptionalNumber_(value.costType, "Loại chi phí"),
    driverName: incidentText_(value.driverName, 240),
    secondDriverName: incidentText_(value.secondDriverName, 240),
    vehicleNumber: incidentText_(value.vehicleNumber, 80),
    vehicleTypeName: incidentText_(value.vehicleTypeName, 120),
    agencyName: incidentText_(value.agencyName, 160),
    sealCodes: value.sealCodes.map(function (seal) { return incidentText_(seal, 80); }).filter(Boolean),
    remark: incidentText_(value.remark, 500),
    operator: incidentText_(value.operator, 240),
    expectedQuantity: incidentOptionalNumber_(value.expectedQuantity, "Số kiện dự kiến")
  };
}
```

Implement `parseIncidentRequest_(e)` to accept either schema 1 or legacy:

```js
function parseIncidentRequest_(e) {
  var body = e && e.postData ? String(e.postData.contents || "") : "";
  if (!body || body.length > INCIDENT_MAX_BODY_LENGTH_) throw new Error("Request log không hợp lệ.");
  var raw = JSON.parse(body);
  var lhTrip = incidentText_(raw.lhTrip, 80).toUpperCase();
  var incidentLogs = incidentText_(raw.incidentLogs, INCIDENT_MAX_BODY_LENGTH_);
  if (!lhTrip || !incidentLogs) throw new Error("Thiếu LH Trip hoặc danh sách sự vụ.");
  if (raw.schemaVersion === undefined) {
    return { schemaVersion: 0, lhTrip: lhTrip, incidentLogs: incidentLogs, incidents: parseLegacyIncidentLogs_(incidentLogs) };
  }
  if (raw.schemaVersion !== INCIDENT_SCHEMA_VERSION_) {
    throw new Error("Schema log không được hỗ trợ.");
  }
  var trip = normalizeIncidentTrip_(raw.trip, lhTrip);
  var createdAt = incidentText_(raw.createdAt, 40);
  if (!createdAt || isNaN(new Date(createdAt).getTime())) throw new Error("Thời gian tạo log không hợp lệ.");
  var incidents = normalizeStructuredIncidents_(raw.incidents);
  return {
    schemaVersion: 1,
    lhTrip: lhTrip,
    incidentLogs: incidentLogs,
    soc: incidentText_(raw.soc, 160),
    createdAt: createdAt,
    trip: trip,
    incidents: incidents,
    raw: raw
  };
}
```

- [ ] **Step 5: Implement header migration, append and public entry point**

Append:

```js
function ensureIncidentLogSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(INCIDENT_LOG_SHEET_NAME_);
  if (!sheet) sheet = spreadsheet.insertSheet(INCIDENT_LOG_SHEET_NAME_);
  sheet.getRange(1, 1, 1, INCIDENT_LOG_HEADERS_.length).setValues([INCIDENT_LOG_HEADERS_]);
  return sheet;
}

function incidentPostOutput_(status, message) {
  return ContentService.createTextOutput(JSON.stringify({ status: status, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function incidentLogRow_(payload, receivedAt) {
  if (payload.schemaVersion === 0) {
    return [payload.lhTrip, payload.incidentLogs, receivedAt, "", "", "", "", "", "", "", "", "", "", "", "", ""];
  }
  var trip = payload.trip;
  return [
    payload.lhTrip, payload.incidentLogs, receivedAt, payload.soc,
    trip.id, trip.tripName, trip.tripDate === null ? "" : trip.tripDate,
    trip.tripTypeName, trip.vehicleNumber, trip.vehicleTypeName, trip.driverName,
    trip.secondDriverName, trip.agencyName, trip.sealCodes.join(", "),
    trip.expectedQuantity === null ? "" : trip.expectedQuantity,
    JSON.stringify(payload.raw)
  ];
}

function handleIncidentReportPost_(e) {
  var lock = null;
  try {
    var payload = parseIncidentRequest_(e);
    lock = LockService.getDocumentLock();
    lock.waitLock(10000);
    var sheet = ensureIncidentLogSheet_(SpreadsheetApp.getActiveSpreadsheet());
    sheet.appendRow(incidentLogRow_(payload, new Date()));
    return incidentPostOutput_("success", "Đã lưu log thành công!");
  } catch (error) {
    console.error("Incident log write failed");
    return incidentPostOutput_("error", error && error.message ? String(error.message) : "Không thể lưu log.");
  } finally {
    if (lock) lock.releaseLock();
  }
}
```

Replace the old body of `doPost` in `gas/code.gs` with:

```js
function doPost(e) {
  return handleIncidentReportPost_(e);
}
```

- [ ] **Step 6: Run GAS tests and commit the write endpoint**

```powershell
node --experimental-strip-types --test tests/incidentReportGas.test.ts
node --experimental-strip-types --test tests/gasAccessControl.test.ts
git add package.json gas/code.gs gas/incident-report.gs tests/incidentReportGas.test.ts
git commit -m "feat: store structured incident logs in Sheets"
```

Expected: new GAS tests PASS; record the two known pre-existing access-control assertion failures separately if they remain unchanged.

---

### Task 4: `L3` lookup and dynamic report table

**Files:**
- Modify: `gas/incident-report.gs`
- Modify: `tests/incidentReportGas.test.ts`

**Interfaces:**
- Consumes: an Apps Script edit event, latest A:P log row, `PropertiesService.getDocumentProperties()`, and the sheet layout with base data rows 21–50/signature row 51.
- Produces: public `onEdit(e)`, `handleIncidentReportEdit_(e)`, `findLatestIncidentLog_(sheet, lhTrip)`, `resetIncidentReportRows_(sheet, properties)`, and `fillIncidentReport_(sheet, payload, properties)`.

- [ ] **Step 1: Extend the VM harness with report-sheet primitives**

Add a report harness that tracks cell values, inserted/deleted rows, formats, toasts and document properties. Its sheet mock must expose these exact methods used by production:

```ts
getName(): string;
getSheetId(): number;
getLastRow(): number;
getRange(row: number, column: number, numRows?: number, numColumns?: number): MockRange;
insertRowsBefore(beforePosition: number, howMany: number): void;
deleteRows(rowPosition: number, howMany: number): void;
```

`MockRange` must implement:

```ts
getA1Notation(): string;
getNumRows(): number;
getNumColumns(): number;
getDisplayValue(): string;
getDisplayValues(): string[][];
getValues(): unknown[][];
setValue(value: unknown): MockRange;
setValues(values: unknown[][]): MockRange;
clearContent(): MockRange;
copyTo(target: MockRange, type: string, transposed: boolean): void;
```

Expose `PropertiesService.getDocumentProperties()` backed by a `Map<string, string>`, `SpreadsheetApp.CopyPasteType.PASTE_FORMAT`, and `spreadsheet.toast(message)`.

- [ ] **Step 2: Write failing lookup/mapping tests**

Append tests that call `handleIncidentReportEdit_` directly:

```ts
test("L3 loads the newest matching structured log and maps trip fields", async () => {
  const harness = await createEditHarness([
    HEADERS,
    [payload.lhTrip, payload.incidentLogs, new Date(1), "Old SOC", "", "", "", "", "", "", "", "", "", "", "", JSON.stringify({ ...payload, soc: "Old SOC" })],
    [payload.lhTrip, payload.incidentLogs, new Date(2), payload.soc, "", "", "", "", "", "", "", "", "", "", "", JSON.stringify(payload)],
  ]);
  harness.setReportCell("L3", payload.lhTrip.toLowerCase());
  harness.context.handleIncidentReportEdit_(harness.editEvent("Biên bản sự vụ", "L3"));
  assert.equal(harness.getReportCell("A10"), "Tại : Pleiku SOC");
  assert.equal(harness.getReportCell("L5"), "Trip name");
  assert.equal(harness.getReportCell("L11"), "Schedule");
  assert.equal(harness.getReportCell("L13"), "By Land");
  assert.equal(harness.getReportCell("L15"), "By Trip");
  assert.equal(harness.getReportCell("L21"), "29E-259.57");
  assert.equal(harness.getReportCell("L23"), "Driver");
  assert.equal(harness.getReportCell("D14"), "Seal số: S1");
  assert.equal(harness.getReportCell("B21"), "SPXVN001");
  assert.equal(harness.getReportCell("C21"), "X");
  assert.equal(harness.getReportCell("F21"), "X");
  assert.match(harness.lastToast(), /Đã tải biên bản/);
});

test("onEdit ignores every location except a single Biên bản sự vụ L3 cell", async () => {
  const harness = await createEditHarness([HEADERS]);
  for (const event of [
    harness.editEvent("Other", "L3"),
    harness.editEvent("Biên bản sự vụ", "L4"),
    harness.editEvent("Biên bản sự vụ", "L3:M3"),
  ]) harness.context.onEdit(event);
  assert.equal(harness.writeCount(), 0);
});

test("legacy log fills incident rows and reports missing trip detail", async () => {
  const harness = await createEditHarness([
    ["LH TRIP", "Đơn sự vụ"],
    ["LT-OLD", "SPX-1@Thiếu + Dư#TO-2@Khác"],
  ]);
  harness.setReportCell("L3", "LT-OLD");
  harness.context.handleIncidentReportEdit_(harness.editEvent("Biên bản sự vụ", "L3"));
  assert.equal(harness.getReportCell("B21"), "SPX-1");
  assert.equal(harness.getReportCell("F21"), "X");
  assert.equal(harness.getReportCell("H21"), "X");
  assert.equal(harness.getReportCell("B22"), "TO-2");
  assert.match(harness.lastToast(), /log cũ/i);
});
```

- [ ] **Step 3: Write failing capacity/reset and not-found tests**

```ts
test("more than 30 incidents inserts rows then removes the previous overflow", async () => {
  const many = {
    ...payload,
    incidents: Array.from({ length: 35 }, (_, index) => ({ code: `SPX-${index + 1}`, reasons: ["Thiếu"] })),
  };
  const harness = await createEditHarness([HEADERS, [many.lhTrip, many.incidentLogs, new Date(), many.soc, "", "", "", "", "", "", "", "", "", "", "", JSON.stringify(many)]]);
  harness.setReportCell("L3", many.lhTrip);
  harness.context.handleIncidentReportEdit_(harness.editEvent("Biên bản sự vụ", "L3"));
  assert.deepEqual(harness.insertCalls(), [[51, 5]]);
  assert.equal(harness.getReportCell("B55"), "SPX-35");
  harness.context.handleIncidentReportEdit_(harness.editEvent("Biên bản sự vụ", "L3"));
  assert.deepEqual(harness.deleteCalls(), [[51, 5]]);
  assert.deepEqual(harness.insertCalls(), [[51, 5], [51, 5]]);
});

test("blank or unknown L3 clears managed output and never leaves stale incidents", async () => {
  const harness = await createEditHarness([HEADERS]);
  harness.setReportCell("B21", "STALE");
  harness.setReportCell("L5", "STALE TRIP");
  harness.setReportCell("L3", "LT-NOT-FOUND");
  harness.context.handleIncidentReportEdit_(harness.editEvent("Biên bản sự vụ", "L3"));
  assert.equal(harness.getReportCell("B21"), "");
  assert.equal(harness.getReportCell("L5"), "");
  assert.match(harness.lastToast(), /Không tìm thấy log/);
});
```

- [ ] **Step 4: Implement lookup and managed-field clearing**

Append to `gas/incident-report.gs`:

```js
var INCIDENT_BASE_FIRST_ROW_ = 21;
var INCIDENT_BASE_ROW_COUNT_ = 30;
var INCIDENT_SIGNATURE_BASE_ROW_ = 51;

function incidentExtraRowsKey_(sheet) {
  return "INCIDENT_EXTRA_ROWS_" + sheet.getSheetId();
}

function resetIncidentReportRows_(sheet, properties) {
  var key = incidentExtraRowsKey_(sheet);
  var previousExtra = Number(properties.getProperty(key) || 0);
  if (Number.isInteger(previousExtra) && previousExtra > 0) {
    sheet.deleteRows(INCIDENT_SIGNATURE_BASE_ROW_, previousExtra);
  }
  properties.deleteProperty(key);
  sheet.getRange(INCIDENT_BASE_FIRST_ROW_, 1, INCIDENT_BASE_ROW_COUNT_, 9).clearContent();
}

function clearIncidentReportFields_(sheet) {
  sheet.getRange("A10").setValue("Tại :");
  sheet.getRangeList(["L5", "L9", "L11", "L13", "L15", "L17", "L19", "L21", "L23", "L25"]).clearContent();
  sheet.getRange("D14").setValue("Seal số: ...............");
}

function findLatestIncidentLog_(sheet, lhTrip) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, INCIDENT_LOG_HEADERS_.length).getValues();
  for (var index = values.length - 1; index >= 0; index -= 1) {
    if (incidentText_(values[index][0], 80).toUpperCase() === lhTrip) {
      return values[index];
    }
  }
  return null;
}

function storedIncidentPayload_(row) {
  var payloadJson = incidentText_(row[15], INCIDENT_MAX_BODY_LENGTH_);
  if (!payloadJson) {
    return { schemaVersion: 0, lhTrip: incidentText_(row[0], 80).toUpperCase(), incidentLogs: incidentText_(row[1], INCIDENT_MAX_BODY_LENGTH_), incidents: parseLegacyIncidentLogs_(row[1]) };
  }
  return parseIncidentRequest_({ postData: { contents: payloadJson } });
}
```

The edit harness must also mock `getRange("A10")` and `getRangeList([...])` because Apps Script supports A1 overloads; production code uses these overloads exactly.

- [ ] **Step 5: Implement dynamic rows and exact reason-column mapping**

```js
function ensureIncidentReportCapacity_(sheet, itemCount, properties) {
  var extra = Math.max(0, itemCount - INCIDENT_BASE_ROW_COUNT_);
  if (extra > 0) {
    sheet.insertRowsBefore(INCIDENT_SIGNATURE_BASE_ROW_, extra);
    sheet.getRange(INCIDENT_BASE_FIRST_ROW_ + INCIDENT_BASE_ROW_COUNT_ - 1, 1, 1, 9)
      .copyTo(sheet.getRange(INCIDENT_SIGNATURE_BASE_ROW_, 1, extra, 9), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    properties.setProperty(incidentExtraRowsKey_(sheet), String(extra));
  }
}

function incidentTableValues_(incidents) {
  return incidents.map(function (item, index) {
    var flags = Object.create(null);
    item.reasons.forEach(function (reason) { flags[reason] = true; });
    return [
      index + 1,
      item.code,
      flags["Rách"] ? "X" : "",
      flags["Bung seal"] ? "X" : "",
      flags["Không TO"] ? "X" : "",
      flags["Thiếu"] ? "X" : "",
      flags["Bể vỡ"] ? "X" : "",
      flags["Dư"] ? "X" : "",
      flags["Khác"] ? "X" : ""
    ];
  });
}

function displayTripSource_(value) {
  return value === 0 ? "Schedule" : value === null || value === undefined || value === "" ? "" : String(value);
}

function displayCostType_(value) {
  return value === 1 ? "By Trip" : value === null || value === undefined || value === "" ? "" : String(value);
}

function fillIncidentReport_(sheet, payload, properties) {
  ensureIncidentReportCapacity_(sheet, payload.incidents.length, properties);
  if (payload.incidents.length > 0) {
    sheet.getRange(INCIDENT_BASE_FIRST_ROW_, 1, payload.incidents.length, 9)
      .setValues(incidentTableValues_(payload.incidents));
  }
  if (payload.schemaVersion === 0) return;
  var trip = payload.trip;
  sheet.getRange("A10").setValue("Tại :" + (payload.soc ? " " + payload.soc : ""));
  sheet.getRange("L5").setValue(incidentText_(trip.tripName, 240));
  sheet.getRange("L9").setValue(typeof trip.tripDate === "number" && isFinite(trip.tripDate) && trip.tripDate > 0 ? new Date(trip.tripDate * 1000) : "");
  sheet.getRange("L11").setValue(displayTripSource_(trip.tripSource));
  sheet.getRange("L13").setValue(incidentText_(trip.tripTypeName, 80));
  sheet.getRange("L15").setValue(displayCostType_(trip.costType));
  sheet.getRange("L17").setValue(incidentText_(trip.agencyName, 160));
  sheet.getRange("L19").setValue(incidentText_(trip.vehicleTypeName, 120));
  sheet.getRange("L21").setValue(incidentText_(trip.vehicleNumber, 80));
  sheet.getRange("L23").setValue(incidentText_(trip.driverName, 240));
  sheet.getRange("L25").setValue(incidentText_(trip.secondDriverName, 240) || "-");
  var seals = Array.isArray(trip.sealCodes) ? trip.sealCodes.map(function (value) { return incidentText_(value, 80); }).filter(Boolean) : [];
  sheet.getRange("D14").setValue(seals.length ? "Seal số: " + seals.join(", ") : "Seal số: ...............");
}
```

- [ ] **Step 6: Implement `onEdit` with lock, cleanup and toasts**

```js
function handleIncidentReportEdit_(e) {
  var range = e && e.range;
  if (!range || range.getNumRows() !== 1 || range.getNumColumns() !== 1 || range.getA1Notation() !== "L3") return;
  var reportSheet = range.getSheet();
  if (reportSheet.getName() !== INCIDENT_REPORT_SHEET_NAME_) return;
  var spreadsheet = reportSheet.getParent();
  var lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    var properties = PropertiesService.getDocumentProperties();
    resetIncidentReportRows_(reportSheet, properties);
    clearIncidentReportFields_(reportSheet);
    var lhTrip = incidentText_(range.getDisplayValue(), 80).toUpperCase();
    if (!lhTrip) return;
    var logSheet = spreadsheet.getSheetByName(INCIDENT_LOG_SHEET_NAME_);
    var row = logSheet ? findLatestIncidentLog_(logSheet, lhTrip) : null;
    if (!row) {
      spreadsheet.toast("Không tìm thấy log cho " + lhTrip, "Biên bản sự vụ", 5);
      return;
    }
    var payload = storedIncidentPayload_(row);
    fillIncidentReport_(reportSheet, payload, properties);
    spreadsheet.toast(
      payload.schemaVersion === 0
        ? "Đã tải danh sách sự vụ từ log cũ; log này không có chi tiết chuyến."
        : "Đã tải biên bản cho " + lhTrip,
      "Biên bản sự vụ",
      5
    );
  } catch (error) {
    spreadsheet.toast("Không thể tải biên bản: dữ liệu log không hợp lệ.", "Biên bản sự vụ", 5);
    console.error("Incident report lookup failed");
  } finally {
    lock.releaseLock();
  }
}

function onEdit(e) {
  handleIncidentReportEdit_(e);
}
```

- [ ] **Step 7: Run GAS tests and commit lookup/autofill**

```powershell
node --experimental-strip-types --test tests/incidentReportGas.test.ts
npm run bundle:gas
Select-String -LiteralPath gas-dist/code.gs -Pattern 'function onEdit\(e\)'
git add gas/incident-report.gs tests/incidentReportGas.test.ts gas-dist/code.gs
git commit -m "feat: autofill incident report from L3"
```

Expected: GAS tests PASS, bundle contains `onEdit`, and dynamic-row tests prove both insertion and cleanup.

---

### Task 5: Release verification and deployment handoff

**Files:**
- Modify: `vite.userscript.config.ts`
- Regenerate: `userscript-dist/ops-fte.user.js`
- Verify: `gas-dist/code.gs`

**Interfaces:**
- Consumes: schema-1 frontend payload and bundled Apps Script.
- Produces: userscript `0.7.0` plus deployable `gas-dist/code.gs`.

- [ ] **Step 1: Run focused frontend/GAS checks**

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts tests/incidentReportGas.test.ts
node node_modules/typescript/lib/tsc.js -b --pretty false
node node_modules/eslint/bin/eslint.js src/pages/TaoBienBanSuVuPage.tsx src/features/incident-report/incidentReport.ts tests/incidentReport.test.ts tests/incidentReportGas.test.ts
npm run bundle:gas
```

Expected: focused tests, TypeScript, lint and GAS bundle exit 0.

- [ ] **Step 2: Run the full repository suite and compare the baseline**

```powershell
npm test
```

Expected: all new incident-report tests pass. The only tolerated failures are the four already-established unrelated failures: two `gasAccessControl` assertions and two `stationCatalog/stations` module-resolution failures. Any additional failure must be fixed before release.

- [ ] **Step 3: Build the web application**

```powershell
npm run build
```

Expected: TypeScript and Vite production build complete successfully.

- [ ] **Step 4: Bump and build userscript 0.7.0**

Change:

```ts
// @version      0.6.0
```

to:

```ts
// @version      0.7.0
```

Then run:

```powershell
npm run build:userscript
Select-String -LiteralPath userscript-dist/ops-fte.user.js -Pattern '@version      0.7.0'
```

Expected: userscript build exits 0 and the generated header reports `0.7.0`.

- [ ] **Step 5: Perform the bound-spreadsheet smoke test**

After deploying `gas-dist/code.gs` as the bound spreadsheet script and updating the Web App deployment, verify:

1. Send a schema-1 report from userscript; `LogSutVu` gains exactly one A:P row.
2. Existing A/B legacy rows remain unchanged.
3. Enter the submitted LH Trip in `Biên bản sự vụ!L3`; the latest matching row fills trip fields and incident flags.
4. Submit the same LH Trip a second time with changed data; editing L3 loads the second row.
5. Load a legacy row; incidents appear and the legacy toast is shown.
6. Load 35 incidents; five rows appear before the signature and all 35 codes are visible.
7. Then load a report with fewer than 30 incidents; five old overflow rows are removed and no stale values remain.
8. Enter an unknown LH Trip; managed fields clear and the not-found toast appears.
9. Edit any cell other than L3; no automation runs.
10. Confirm `B14=L21`, the QR based on L3, person/position, sender and actual-received fields remain intact.

- [ ] **Step 6: Review and commit release artifacts**

```powershell
git status --short
git diff --check
git diff --stat
git add vite.userscript.config.ts userscript-dist/ops-fte.user.js gas-dist/code.gs
git add -u userscript-dist gas-dist
git commit -m "build: release Google Sheet incident autofill"
```

Expected: `Record biên bản.xlsx` remains untracked and unmodified. Do not run `clasp push`, create a Web App deployment or `git push` unless the user explicitly asks for that external action.

---

## Completion Checklist

- [ ] Frontend payload uses schema 1 and preserves legacy fields.
- [ ] `TripDetails` keeps `tripSource` and `costType` without `trip_station`.
- [ ] `doPost` validates before writing and only targets `LogSutVu`.
- [ ] Existing LogSutVu A/B data remains in place while header expands to A:P.
- [ ] Lookup uses the newest matching LH Trip.
- [ ] Only `Biên bản sự vụ!L3` triggers autofill.
- [ ] Structured and legacy incidents both map to A:I with all seven reason flags.
- [ ] More than 30 incidents insert enough rows before signature row 51.
- [ ] A later load removes prior overflow and all stale automation data.
- [ ] Person, role, sender and actual-received fields remain unchanged.
- [ ] Focused tests, TypeScript, lint, GAS bundle, web build and userscript build pass.
- [ ] Deployable GAS contains `doPost` and `onEdit`; userscript header reports `0.7.0`.
