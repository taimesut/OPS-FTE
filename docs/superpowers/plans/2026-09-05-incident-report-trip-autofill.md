# LH Trip Incident Report Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng nhập hoặc quét LH Trip/biển số, chọn chuyến, tự tải chi tiết cùng toàn bộ kiện Thiếu/Dư, hợp nhất với sự vụ quét thủ công và tạo bản xem trước theo sheet `Biên bản sự vụ`.

**Architecture:** Tách logic nghiệp vụ thuần (xây URL, parse response, chuẩn hóa và hợp nhất sự vụ) khỏi lớp gọi API có dependency injection để kiểm thử bằng Node không cần DOM. Trang React giữ vai trò điều phối ba nhánh tải độc lập bằng generation token, còn các component con phụ trách tìm/chọn chuyến, chỉnh danh sách sự vụ và xem trước biên bản.

**Tech Stack:** React 19, TypeScript 6, Axios client hiện có, Tailwind CSS/DaisyUI, Lucide React, Node built-in test runner, Vite userscript build.

## Global Constraints

- Không dùng `trip_station`.
- Dùng `id` của kết quả `list_v2` làm `trip_id`.
- Dùng `display_station_sequence` của kết quả `list_v2` cho cả hai API loading; không thay bằng `current_sequence_number` và không hardcode sequence.
- Tìm kiếm bắt đầu bằng `LT` dùng `trip_number`; mọi giá trị còn lại dùng `plate_number`.
- Khi có nhiều kết quả phải để người dùng chọn, không tự động chọn chuyến mới nhất.
- Tải toàn bộ các trang loading với `count=24` và có chốt dừng chống vòng lặp khi metadata không nhất quán.
- Mã kiện ưu tiên `scan_number`, fallback `to_number`, bỏ item khi cả hai field đều trống.
- Các loại sự vụ chính xác là `Rách`, `Bung seal`, `Không TO`, `Thiếu`, `Bể vỡ`, `Dư`, `Khác`.
- Một mã chỉ có một dòng nhưng có thể mang nhiều loại sự vụ; log nối loại bằng ` + ` và nối dòng bằng `#`.
- Ba nhánh `detail`, `pending`, `inbound` tải độc lập; lỗi một nhánh không xóa dữ liệu thành công của nhánh khác và từng nhánh có nút thử lại.
- Mọi request dùng URL tương đối và phiên đăng nhập SPX hiện tại; không đọc, lưu hoặc chuyển tiếp Cookie thủ công.
- Không chỉnh sửa file `Record biên bản.xlsx` và không sao chép dữ liệu mẫu cá nhân, địa chỉ hoặc biển số từ workbook.

---

## File Structure

- Create `src/features/incident-report/incidentReport.ts`: kiểu dữ liệu, hằng số, URL builders, response parsers, chuẩn hóa mã, hợp nhất sự vụ và formatter log thuần.
- Create `src/features/incident-report/incidentReportApi.ts`: adapter GET có dependency injection, tìm chuyến, tải chi tiết và phân trang loading.
- Create `src/features/incident-report/TripSearchPanel.tsx`: ô nhập/quét, trạng thái tìm kiếm và danh sách chọn khi có nhiều chuyến.
- Create `src/features/incident-report/IncidentItemsEditor.tsx`: nhập/quét mã bổ sung, bật/tắt nhiều cờ sự vụ, bảng desktop và card mobile.
- Create `src/features/incident-report/IncidentReportPreview.tsx`: bản xem trước/in theo các cột của sheet `Biên bản sự vụ`.
- Modify `src/pages/TaoBienBanSuVuPage.tsx`: điều phối step, generation token, ba branch state, retry, log, copy, print và reset.
- Modify `src/components/EmbeddedQRScanner.tsx`: đổi nhãn mode `lhtrip` để nói rõ hỗ trợ LH Trip hoặc biển số.
- Create `tests/incidentReport.test.ts`: kiểm thử URL, parser, pagination, fallback code, merge nhiều lý do, log và lỗi độc lập.
- Modify `package.json`: thêm test mới vào script `test`.
- Modify `vite.userscript.config.ts`: nâng metadata từ `0.5.0` lên `0.6.0`.
- Regenerate `userscript-dist/ops-fte.user.js`: bundle userscript đã cập nhật.

---

### Task 1: Domain types, search/detail URLs and parsers

**Files:**
- Create: `src/features/incident-report/incidentReport.ts`
- Create: `tests/incidentReport.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: SPX JSON responses as `unknown` and a raw search string.
- Produces: `INCIDENT_REASONS`, `TripSummary`, `TripDetails`, `IncidentItem`, `normalizeSearchTerm(raw: string): string`, `createTripSearchPath(raw: string): string`, `parseTripSearchResponse(payload: unknown): TripSummary[]`, `createTripDetailPath(tripId: number): string`, and `parseTripDetailResponse(payload: unknown): TripDetails`.

- [ ] **Step 1: Register the focused test file and write failing search/detail tests**

Add `tests/incidentReport.test.ts` to the explicit `test` script in `package.json` by changing its tail from:

```json
"tests/apiErrorLoggingGas.test.ts tests/gasBundler.test.ts"
```

to:

```json
"tests/apiErrorLoggingGas.test.ts tests/gasBundler.test.ts tests/incidentReport.test.ts"
```

Then create the file with these first tests:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createTripDetailPath,
  createTripSearchPath,
  parseTripDetailResponse,
  parseTripSearchResponse,
} from "../src/features/incident-report/incidentReport.ts";

test("builds list_v2 search URLs for LH Trip and plate number", () => {
  assert.equal(
    createTripSearchPath(" lt0q944woqg72 "),
    "/api/admin/transportation/trip/list_v2?station_type=2&trip_number=LT0Q944WOQG72&pageno=1&count=24&query_type=1&tab_type=1",
  );
  assert.equal(
    createTripSearchPath(" 29e-259.57 "),
    "/api/admin/transportation/trip/list_v2?station_type=2&plate_number=29E-259.57&pageno=1&count=24&query_type=1&tab_type=1",
  );
  assert.throws(() => createTripSearchPath("   "), /LH Trip|biển số/i);
});

const trip = {
  id: 296766439,
  trip_number: "LT0Q944WOQG72",
  trip_name: "20260904TC17:30_QL14_._HYenSOC02",
  trip_date: 1788454800,
  trip_status: 40,
  driver_name: "Quốc Tuấn - Phan Thanh Tùng",
  second_driver_name: "",
  vehicle_number: "29E-259.57",
  vehicle_type_name: "Truck_8T60m3",
  agency_name: "Quốc Tuấn",
  display_station_sequence: 3,
};

test("parses zero, one and multiple trip results", () => {
  assert.deepEqual(parseTripSearchResponse({ retcode: 0, data: { list: [] } }), []);
  assert.equal(
    parseTripSearchResponse({ retcode: 0, data: { list: [trip] } })[0]?.displayStationSequence,
    3,
  );
  assert.equal(
    parseTripSearchResponse({ retcode: 0, data: { list: [trip, { ...trip, id: 2 }] } }).length,
    2,
  );
});

test("rejects malformed selected-trip identifiers and application errors", () => {
  assert.throws(
    () => parseTripSearchResponse({ retcode: 0, data: { list: [{ ...trip, id: 0 }] } }),
    /id/i,
  );
  assert.throws(
    () => parseTripSearchResponse({ retcode: 0, data: { list: [{ ...trip, display_station_sequence: "3" }] } }),
    /sequence/i,
  );
  assert.throws(
    () => parseTripSearchResponse({ retcode: 401, message: "Không có quyền" }),
    /Không có quyền/i,
  );
});

test("builds and parses detail_v2 without trip_station", () => {
  assert.equal(
    createTripDetailPath(296220351),
    "/api/admin/transportation/trip/detail_v2?trip_id=296220351&new_process_switch=false",
  );
  assert.deepEqual(
    parseTripDetailResponse({
      retcode: 0,
      data: {
        ...trip,
        id: 296220351,
        trip_type_name: "By Land",
        seal_code: "SEAL-1",
        seal_code_list: ["SEAL-2"],
        remark: "",
        operator: "operator@spxexpress.com",
        remark_loading_quantity: 68,
        trip_station: [{ ignored: true }],
      },
    }),
    {
      id: 296220351,
      tripNumber: trip.trip_number,
      tripName: trip.trip_name,
      tripDate: trip.trip_date,
      tripTypeName: "By Land",
      driverName: trip.driver_name,
      secondDriverName: "",
      vehicleNumber: trip.vehicle_number,
      vehicleTypeName: trip.vehicle_type_name,
      agencyName: trip.agency_name,
      sealCodes: ["SEAL-1", "SEAL-2"],
      remark: "",
      operator: "operator@spxexpress.com",
      expectedQuantity: 68,
    },
  );
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `incidentReport.ts`.

- [ ] **Step 3: Implement strict domain types and parsers**

Create `src/features/incident-report/incidentReport.ts` with this public surface and validation helpers:

```ts
export const INCIDENT_REASONS = [
  "Rách",
  "Bung seal",
  "Không TO",
  "Thiếu",
  "Bể vỡ",
  "Dư",
  "Khác",
] as const;

export type IncidentReason = (typeof INCIDENT_REASONS)[number];
export type IncidentSource = "auto" | "manual";

export interface TripSummary {
  id: number;
  tripNumber: string;
  tripName: string;
  tripDate: number;
  tripStatus: number;
  driverName: string;
  secondDriverName: string;
  vehicleNumber: string;
  vehicleTypeName: string;
  agencyName: string;
  displayStationSequence: number;
}

export interface TripDetails {
  id: number;
  tripNumber: string;
  tripName: string;
  tripDate: number;
  tripTypeName: string;
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

export interface IncidentItem {
  id: string;
  code: string;
  reasons: IncidentReason[];
  sources: IncidentSource[];
}

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const responseData = (payload: unknown, label: string): JsonRecord => {
  if (!isRecord(payload) || payload.retcode !== 0) {
    throw new Error(text(isRecord(payload) ? payload.message : "") || `${label}: response không hợp lệ.`);
  }
  if (!isRecord(payload.data)) throw new Error(`${label}: thiếu data.`);
  return payload.data;
};

export const normalizeSearchTerm = (raw: string): string => raw.trim().toUpperCase();

export const createTripSearchPath = (raw: string): string => {
  const value = normalizeSearchTerm(raw);
  if (!value) throw new Error("Vui lòng nhập LH Trip hoặc biển số xe.");
  const query = new URLSearchParams({ station_type: "2" });
  query.set(value.startsWith("LT") ? "trip_number" : "plate_number", value);
  query.set("pageno", "1");
  query.set("count", "24");
  query.set("query_type", "1");
  query.set("tab_type", "1");
  return `/api/admin/transportation/trip/list_v2?${query.toString()}`;
};

const parseTripSummary = (value: unknown): TripSummary => {
  if (!isRecord(value)) throw new Error("Trip item không hợp lệ.");
  const id = finiteNumber(value.id);
  const sequence = finiteNumber(value.display_station_sequence);
  if (id === null || id <= 0) throw new Error("Trip id không hợp lệ.");
  if (sequence === null || sequence < 0) throw new Error("Trip display sequence không hợp lệ.");
  return {
    id,
    tripNumber: text(value.trip_number),
    tripName: text(value.trip_name),
    tripDate: finiteNumber(value.trip_date) ?? 0,
    tripStatus: finiteNumber(value.trip_status) ?? 0,
    driverName: text(value.driver_name),
    secondDriverName: text(value.second_driver_name),
    vehicleNumber: text(value.vehicle_number),
    vehicleTypeName: text(value.vehicle_type_name),
    agencyName: text(value.agency_name),
    displayStationSequence: sequence,
  };
};

export const parseTripSearchResponse = (payload: unknown): TripSummary[] => {
  const data = responseData(payload, "Tìm chuyến");
  if (!Array.isArray(data.list)) throw new Error("Tìm chuyến: list không hợp lệ.");
  return data.list.map(parseTripSummary);
};

export const createTripDetailPath = (tripId: number): string => {
  if (!Number.isFinite(tripId) || tripId <= 0) throw new Error("Trip id không hợp lệ.");
  const query = new URLSearchParams({ trip_id: String(tripId), new_process_switch: "false" });
  return `/api/admin/transportation/trip/detail_v2?${query.toString()}`;
};

export const parseTripDetailResponse = (payload: unknown): TripDetails => {
  const data = responseData(payload, "Chi tiết chuyến");
  const id = finiteNumber(data.id);
  if (id === null || id <= 0) throw new Error("Chi tiết chuyến: id không hợp lệ.");
  const sealCodes = [text(data.seal_code), ...(Array.isArray(data.seal_code_list) ? data.seal_code_list.map(text) : [])]
    .filter((value, index, values) => value && values.indexOf(value) === index);
  const expected = finiteNumber(data.remark_loading_quantity);
  return {
    id,
    tripNumber: text(data.trip_number),
    tripName: text(data.trip_name),
    tripDate: finiteNumber(data.trip_date) ?? 0,
    tripTypeName: text(data.trip_type_name),
    driverName: text(data.driver_name),
    secondDriverName: text(data.second_driver_name),
    vehicleNumber: text(data.vehicle_number),
    vehicleTypeName: text(data.vehicle_type_name),
    agencyName: text(data.agency_name),
    sealCodes,
    remark: text(data.remark),
    operator: text(data.operator),
    expectedQuantity: expected !== null && expected >= 0 ? expected : null,
  };
};
```

- [ ] **Step 4: Run focused tests and TypeScript checking**

Run:

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
node node_modules/typescript/lib/tsc.js -b --pretty false
```

Expected: all incident-report tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the domain contract**

```powershell
git add package.json tests/incidentReport.test.ts src/features/incident-report/incidentReport.ts
git commit -m "feat: add incident report trip domain"
```

---

### Task 2: Loading URL parsing, pagination and API adapter

**Files:**
- Modify: `src/features/incident-report/incidentReport.ts`
- Create: `src/features/incident-report/incidentReportApi.ts`
- Modify: `tests/incidentReport.test.ts`

**Interfaces:**
- Consumes: `TripSummary.id`, `TripSummary.displayStationSequence`, an optional `IncidentReportApiDependency`, and loading responses with `data.pageno`, `data.count`, `data.total`, `data.list`.
- Produces: `LoadingKind`, `LoadingItem`, `LoadingPage`, `createLoadingPath(kind: LoadingKind, tripId: number, sequence: number, pageNo: number): string`, `parseLoadingPage(payload: unknown): LoadingPage`, `searchTrips(raw: string, dependency?: IncidentReportApiDependency): Promise<TripSummary[]>`, `fetchTripDetails(tripId: number, dependency?: IncidentReportApiDependency): Promise<TripDetails>`, and `fetchAllLoadingItems(kind: LoadingKind, tripId: number, sequence: number, dependency?: IncidentReportApiDependency): Promise<LoadingFetchResult>`.

- [ ] **Step 1: Add failing loading and pagination tests**

Append these tests and imports to `tests/incidentReport.test.ts`:

```ts
import {
  createLoadingPath,
  extractLoadingCode,
  parseLoadingPage,
} from "../src/features/incident-report/incidentReport.ts";
import {
  fetchAllLoadingItems,
  fetchTripDetails,
  searchTrips,
} from "../src/features/incident-report/incidentReportApi.ts";

test("builds exact pending and inbound loading paths from display sequence", () => {
  assert.equal(
    createLoadingPath("pending", 296220351, 3, 1),
    "/api/admin/transportation/trip/loading/list?trip_id=296220351&pageno=1&count=24&unloaded_sequence_number=3&actual_unloaded_sequence_number=0&type=pending",
  );
  assert.equal(
    createLoadingPath("inbound", 296220351, 3, 2),
    "/api/admin/transportation/trip/loading/list?trip_id=296220351&pageno=2&count=24&actual_unloaded_sequence_number=3&type=inbound&unload_list_type=2",
  );
});

test("prefers scan_number, falls back to to_number and drops blank codes", () => {
  assert.equal(extractLoadingCode({ scan_number: " spxvn01 ", to_number: "TO-1" }), "SPXVN01");
  assert.equal(extractLoadingCode({ scan_number: "", to_number: " to2026 " }), "TO2026");
  assert.equal(extractLoadingCode({ scan_number: " ", to_number: " " }), null);
});

test("parses loading totals and counts invalid rows", () => {
  assert.deepEqual(
    parseLoadingPage({
      retcode: 0,
      data: {
        pageno: 1,
        count: 24,
        total: 3,
        list: [
          { scan_number: "SPX-1", to_number: "TO-1" },
          { scan_number: "", to_number: "TO-2" },
          { scan_number: "", to_number: "" },
        ],
      },
    }),
    { pageNo: 1, count: 24, total: 3, codes: ["SPX-1", "TO-2"], invalidCount: 1, rawItemCount: 3 },
  );
});

test("loads every page and stops after total is reached", async () => {
  const paths: string[] = [];
  const dependency = {
    get: async (path: string) => {
      paths.push(path);
      const pageNo = Number(new URL(`https://local${path}`).searchParams.get("pageno"));
      return {
        data: {
          retcode: 0,
          data: {
            pageno: pageNo,
            count: 24,
            total: 25,
            list: pageNo === 1
              ? Array.from({ length: 24 }, (_, index) => ({ scan_number: `SPX-${index + 1}` }))
              : [{ scan_number: "SPX-25" }],
          },
        },
      };
    },
  };
  const result = await fetchAllLoadingItems("pending", 296220351, 3, dependency);
  assert.equal(paths.length, 2);
  assert.equal(result.codes.length, 25);
  assert.equal(result.invalidCount, 0);
});

test("stops safely on an empty page even when total metadata is inconsistent", async () => {
  let calls = 0;
  const result = await fetchAllLoadingItems("inbound", 1, 3, {
    get: async () => ({
      data: {
        retcode: 0,
        data: { pageno: ++calls, count: 24, total: 1000, list: [] },
      },
    }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { codes: [], invalidCount: 0, reportedTotal: 1000 });
});

test("API adapter delegates search and detail through the injected GET client", async () => {
  const paths: string[] = [];
  const dependency = {
    get: async (path: string) => {
      paths.push(path);
      return path.includes("list_v2")
        ? { data: { retcode: 0, data: { list: [trip] } } }
        : { data: { retcode: 0, data: { ...trip, id: 296766439, seal_code_list: [] } } };
    },
  };
  assert.equal((await searchTrips("LT0Q944WOQG72", dependency)).length, 1);
  assert.equal((await fetchTripDetails(296766439, dependency)).id, 296766439);
  assert.equal(paths.length, 2);
});
```

- [ ] **Step 2: Run the focused test and verify exported functions are missing**

Run:

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
```

Expected: FAIL because loading functions/API module are not exported yet.

- [ ] **Step 3: Implement loading primitives in the domain module**

Append the following public types and functions to `incidentReport.ts`, reusing the private `isRecord`, `text`, `finiteNumber`, and `responseData` helpers from Task 1:

```ts
export type LoadingKind = "pending" | "inbound";

export interface LoadingPage {
  pageNo: number;
  count: number;
  total: number;
  codes: string[];
  invalidCount: number;
  rawItemCount: number;
}

export const extractLoadingCode = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  const code = text(value.scan_number) || text(value.to_number);
  return code ? code.toUpperCase() : null;
};

export const createLoadingPath = (
  kind: LoadingKind,
  tripId: number,
  sequence: number,
  pageNo: number,
): string => {
  if (!Number.isFinite(tripId) || tripId <= 0) throw new Error("Trip id không hợp lệ.");
  if (!Number.isFinite(sequence) || sequence < 0) throw new Error("Display sequence không hợp lệ.");
  if (!Number.isInteger(pageNo) || pageNo < 1) throw new Error("Số trang không hợp lệ.");
  const query = new URLSearchParams({
    trip_id: String(tripId),
    pageno: String(pageNo),
    count: "24",
  });
  if (kind === "pending") {
    query.set("unloaded_sequence_number", String(sequence));
    query.set("actual_unloaded_sequence_number", "0");
    query.set("type", "pending");
  } else {
    query.set("actual_unloaded_sequence_number", String(sequence));
    query.set("type", "inbound");
    query.set("unload_list_type", "2");
  }
  return `/api/admin/transportation/trip/loading/list?${query.toString()}`;
};

export const parseLoadingPage = (payload: unknown): LoadingPage => {
  const data = responseData(payload, "Danh sách kiện");
  const pageNo = finiteNumber(data.pageno);
  const count = finiteNumber(data.count);
  const total = finiteNumber(data.total);
  if (!Number.isInteger(pageNo) || (pageNo ?? 0) < 1) throw new Error("Danh sách kiện: pageno không hợp lệ.");
  if (!Number.isInteger(count) || (count ?? 0) < 1) throw new Error("Danh sách kiện: count không hợp lệ.");
  if (!Number.isInteger(total) || (total ?? -1) < 0) throw new Error("Danh sách kiện: total không hợp lệ.");
  if (!Array.isArray(data.list)) throw new Error("Danh sách kiện: list không hợp lệ.");
  const normalized = data.list.map(extractLoadingCode);
  return {
    pageNo: pageNo as number,
    count: count as number,
    total: total as number,
    codes: normalized.filter((code): code is string => code !== null),
    invalidCount: normalized.filter((code) => code === null).length,
    rawItemCount: data.list.length,
  };
};
```

- [ ] **Step 4: Implement the injectable API adapter and bounded pagination**

Create `src/features/incident-report/incidentReportApi.ts`:

```ts
import {
  createLoadingPath,
  createTripDetailPath,
  createTripSearchPath,
  parseLoadingPage,
  parseTripDetailResponse,
  parseTripSearchResponse,
  type LoadingKind,
  type TripDetails,
  type TripSummary,
} from "./incidentReport.ts";

export interface IncidentReportApiDependency {
  get(path: string, options: { suppressErrorToast: true }): Promise<{ data: unknown }>;
}

export interface LoadingFetchResult {
  codes: string[];
  invalidCount: number;
  reportedTotal: number;
}

const loadApiDependency = async (): Promise<IncidentReportApiDependency> => {
  const { default: apiClient } = await import("../../utils/apiClient.ts");
  return { get: (path, options) => apiClient.get(path, options) };
};

const clientFor = async (dependency?: IncidentReportApiDependency) =>
  dependency ?? (await loadApiDependency());

export const searchTrips = async (
  raw: string,
  dependency?: IncidentReportApiDependency,
): Promise<TripSummary[]> => {
  const client = await clientFor(dependency);
  const response = await client.get(createTripSearchPath(raw), { suppressErrorToast: true });
  return parseTripSearchResponse(response.data);
};

export const fetchTripDetails = async (
  tripId: number,
  dependency?: IncidentReportApiDependency,
): Promise<TripDetails> => {
  const client = await clientFor(dependency);
  const response = await client.get(createTripDetailPath(tripId), { suppressErrorToast: true });
  return parseTripDetailResponse(response.data);
};

export const fetchAllLoadingItems = async (
  kind: LoadingKind,
  tripId: number,
  sequence: number,
  dependency?: IncidentReportApiDependency,
): Promise<LoadingFetchResult> => {
  const client = await clientFor(dependency);
  const codes: string[] = [];
  let invalidCount = 0;
  let reportedTotal = 0;
  const visitedPages = new Set<number>();
  for (let pageNo = 1; pageNo <= 10_000; pageNo += 1) {
    if (visitedPages.has(pageNo)) break;
    visitedPages.add(pageNo);
    const response = await client.get(createLoadingPath(kind, tripId, sequence, pageNo), {
      suppressErrorToast: true,
    });
    const page = parseLoadingPage(response.data);
    reportedTotal = page.total;
    codes.push(...page.codes);
    invalidCount += page.invalidCount;
    if (page.rawItemCount === 0 || codes.length + invalidCount >= page.total) break;
    const lastPage = Math.max(1, Math.ceil(page.total / page.count));
    if (pageNo >= lastPage) break;
  }
  return { codes, invalidCount, reportedTotal };
};
```

Because test doubles omit Axios options, TypeScript accepts extra call arguments; keep the production interface strict and do not make cookie headers part of it.

- [ ] **Step 5: Run focused tests and commit the API slice**

Run:

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
node node_modules/typescript/lib/tsc.js -b --pretty false
```

Expected: PASS and TypeScript exits 0.

```powershell
git add src/features/incident-report/incidentReport.ts src/features/incident-report/incidentReportApi.ts tests/incidentReport.test.ts
git commit -m "feat: load incident trip data"
```

---

### Task 3: Incident merge model and compatible log output

**Files:**
- Modify: `src/features/incident-report/incidentReport.ts`
- Modify: `tests/incidentReport.test.ts`

**Interfaces:**
- Consumes: normalized codes, `IncidentReason`, `IncidentSource`, and existing `IncidentItem[]`.
- Produces: `mergeIncidentCodes(items: readonly IncidentItem[], codes: readonly string[], reason: IncidentReason, source: IncidentSource): IncidentItem[]`, `toggleIncidentReason(items: readonly IncidentItem[], id: string, reason: IncidentReason): IncidentItem[]`, `removeIncidentItem(items: readonly IncidentItem[], id: string): IncidentItem[]`, and `formatIncidentLog(items: readonly IncidentItem[]): string`.

- [ ] **Step 1: Write failing merge/log tests**

Append to `tests/incidentReport.test.ts`:

```ts
import {
  formatIncidentLog,
  mergeIncidentCodes,
  removeIncidentItem,
  toggleIncidentReason,
  type IncidentItem,
} from "../src/features/incident-report/incidentReport.ts";

test("merges pending, inbound and manual reasons into one row per code", () => {
  let items: IncidentItem[] = [];
  items = mergeIncidentCodes(items, [" spx-1 ", "TO-2", "SPX-1"], "Thiếu", "auto");
  items = mergeIncidentCodes(items, ["SPX-1"], "Dư", "auto");
  items = mergeIncidentCodes(items, ["spx-1"], "Rách", "manual");
  assert.deepEqual(items, [
    { id: "SPX-1", code: "SPX-1", reasons: ["Rách", "Thiếu", "Dư"], sources: ["auto", "manual"] },
    { id: "TO-2", code: "TO-2", reasons: ["Thiếu"], sources: ["auto"] },
  ]);
});

test("toggles flags without allowing an empty incident row", () => {
  const original = mergeIncidentCodes([], ["SPX-1"], "Thiếu", "auto");
  assert.deepEqual(toggleIncidentReason(original, "SPX-1", "Dư")[0]?.reasons, ["Thiếu", "Dư"]);
  assert.deepEqual(toggleIncidentReason(original, "SPX-1", "Thiếu")[0]?.reasons, ["Thiếu"]);
  assert.deepEqual(removeIncidentItem(original, "SPX-1"), []);
});

test("formats multi-reason rows for the existing Google Sheet webhook", () => {
  const items = mergeIncidentCodes(
    mergeIncidentCodes([], ["SPX-1"], "Thiếu", "auto"),
    ["SPX-1"],
    "Dư",
    "auto",
  );
  assert.equal(formatIncidentLog(items), "SPX-1@Thiếu + Dư");
});
```

- [ ] **Step 2: Run the test and verify merge exports are missing**

Run:

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
```

Expected: FAIL because merge/log functions do not exist.

- [ ] **Step 3: Implement deterministic reason/source ordering and immutable updates**

Append to `incidentReport.ts`:

```ts
const orderReasons = (reasons: Iterable<IncidentReason>): IncidentReason[] => {
  const selected = new Set(reasons);
  return INCIDENT_REASONS.filter((reason) => selected.has(reason));
};

const orderSources = (sources: Iterable<IncidentSource>): IncidentSource[] => {
  const selected = new Set(sources);
  return (["auto", "manual"] as const).filter((source) => selected.has(source));
};

export const mergeIncidentCodes = (
  items: readonly IncidentItem[],
  codes: readonly string[],
  reason: IncidentReason,
  source: IncidentSource,
): IncidentItem[] => {
  const result = items.map((item) => ({ ...item, reasons: [...item.reasons], sources: [...item.sources] }));
  const byCode = new Map(result.map((item) => [item.code, item]));
  for (const rawCode of codes) {
    const code = rawCode.trim().toUpperCase();
    if (!code) continue;
    const current = byCode.get(code);
    if (current) {
      current.reasons = orderReasons([...current.reasons, reason]);
      current.sources = orderSources([...current.sources, source]);
    } else {
      const next = { id: code, code, reasons: [reason], sources: [source] } satisfies IncidentItem;
      result.push(next);
      byCode.set(code, next);
    }
  }
  return result;
};

export const toggleIncidentReason = (
  items: readonly IncidentItem[],
  id: string,
  reason: IncidentReason,
): IncidentItem[] =>
  items.map((item) => {
    if (item.id !== id) return item;
    const selected = new Set(item.reasons);
    if (selected.has(reason) && selected.size > 1) selected.delete(reason);
    else selected.add(reason);
    return { ...item, reasons: orderReasons(selected), sources: orderSources([...item.sources, "manual"]) };
  });

export const removeIncidentItem = (
  items: readonly IncidentItem[],
  id: string,
): IncidentItem[] => items.filter((item) => item.id !== id);

export const formatIncidentLog = (items: readonly IncidentItem[]): string =>
  items.map((item) => `${item.code}@${item.reasons.join(" + ")}`).join("#");
```

- [ ] **Step 4: Run tests, typecheck and commit the merge model**

Run:

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
node node_modules/typescript/lib/tsc.js -b --pretty false
```

Expected: PASS and TypeScript exits 0.

```powershell
git add src/features/incident-report/incidentReport.ts tests/incidentReport.test.ts
git commit -m "feat: merge incident report items"
```

---

### Task 4: Trip search UI and independent branch orchestration

**Files:**
- Create: `src/features/incident-report/TripSearchPanel.tsx`
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`
- Modify: `src/components/EmbeddedQRScanner.tsx`

**Interfaces:**
- Consumes: `TripSummary`, `searchTrips`, `fetchTripDetails`, `fetchAllLoadingItems`, `mergeIncidentCodes`, `getConfigs()`, and the existing scanner callback.
- Produces: `TripSearchPanel` props `{ query, onQueryChange, loading, error, results, onSearch, onSelect, onOpenScanner }`; page branch states for `detail`, `pending`, and `inbound`; selected trip summary; SOC name from existing app config.

- [ ] **Step 1: Create a focused presentational trip search panel**

Create `TripSearchPanel.tsx` with the exact props below. Use a `<form>` for keyboard submit and render the result chooser only when `results.length > 1`:

```tsx
import { CalendarDays, QrCode, Search, Truck } from "lucide-react";
import type { TripSummary } from "./incidentReport";

interface TripSearchPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  error: string;
  results: readonly TripSummary[];
  onSearch: () => void;
  onSelect: (trip: TripSummary) => void;
  onOpenScanner: () => void;
}

const formatTripDate = (seconds: number) =>
  seconds > 0 ? new Date(seconds * 1000).toLocaleString("vi-VN") : "Chưa có ngày chạy";

export function TripSearchPanel(props: TripSearchPanelProps) {
  return (
    <section className="app-surface space-y-4 p-4 sm:p-5">
      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(event) => { event.preventDefault(); props.onSearch(); }}
      >
        <label className="grid gap-1.5 text-sm font-bold">
          LH Trip hoặc biển số xe
          <input
            className="input input-bordered min-h-11 w-full font-mono uppercase"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Ví dụ: LT0Q... hoặc 29E-259.57"
          />
        </label>
        <button type="button" className="btn min-h-11 gap-2" onClick={props.onOpenScanner}>
          <QrCode className="h-4 w-4" /> Quét
        </button>
        <button type="submit" className="btn btn-primary min-h-11 gap-2" disabled={props.loading}>
          {props.loading ? <span className="loading loading-spinner loading-sm" /> : <Search className="h-4 w-4" />}
          Tìm chuyến
        </button>
      </form>
      {props.error && <div className="alert alert-error text-sm">{props.error}</div>}
      {props.results.length > 1 && (
        <div className="grid gap-3" aria-label="Chọn LH Trip">
          {props.results.map((trip) => (
            <button
              key={trip.id}
              type="button"
              onClick={() => props.onSelect(trip)}
              className="rounded-2xl border border-base-300 p-4 text-left hover:border-primary hover:bg-primary/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="font-mono text-primary">{trip.tripNumber || `Trip #${trip.id}`}</strong>
                <span className="badge badge-outline">Trạng thái {trip.tripStatus}</span>
              </div>
              <p className="mt-2 text-sm font-semibold">{trip.tripName || "Chưa có tên chuyến"}</p>
              <div className="mt-2 grid gap-1 text-xs text-base-content/65 sm:grid-cols-2">
                <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatTripDate(trip.tripDate)}</span>
                <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />{trip.vehicleNumber || "Chưa có biển số"}</span>
                <span>{trip.driverName || "Chưa có tài xế"}</span>
                <span>{trip.agencyName || "Chưa có nhà xe"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Replace the old Step 1 state with search/select state**

In `TaoBienBanSuVuPage.tsx`, replace `lhTrip`-only startup with:

```tsx
type LoadStatus = "idle" | "loading" | "success" | "error";
interface BranchState<T> { status: LoadStatus; data: T | null; error: string; invalidCount: number; }
const emptyBranch = <T,>(): BranchState<T> => ({ status: "idle", data: null, error: "", invalidCount: 0 });
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const [query, setQuery] = useState("");
const [searching, setSearching] = useState(false);
const [searchError, setSearchError] = useState("");
const [searchResults, setSearchResults] = useState<TripSummary[]>([]);
const [selectedTrip, setSelectedTrip] = useState<TripSummary | null>(null);
const [detailBranch, setDetailBranch] = useState<BranchState<TripDetails>>(() => emptyBranch());
const [pendingBranch, setPendingBranch] = useState<BranchState<string[]>>(() => emptyBranch());
const [inboundBranch, setInboundBranch] = useState<BranchState<string[]>>(() => emptyBranch());
const [createdAt, setCreatedAt] = useState(() => new Date());
const generationRef = useRef(0);
const [socName] = useState(() => getConfigs().soc);
```

The shared search runner must auto-select only a single result:

```tsx
const runSearch = async (rawQuery: string) => {
  const normalized = normalizeSearchTerm(rawQuery);
  setQuery(normalized);
  setSearching(true);
  setSearchError("");
  setSearchResults([]);
  try {
    const trips = await searchTrips(normalized);
    if (trips.length === 0) {
      setSearchError("Không tìm thấy chuyến phù hợp.");
    } else if (trips.length === 1) {
      void selectTrip(trips[0]);
    } else {
      setSearchResults(trips);
    }
  } catch (error) {
    setSearchError(errorText(error, "Không thể tìm chuyến."));
  } finally {
    setSearching(false);
  }
};

const handleSearch = () => { void runSearch(query); };
```

- [ ] **Step 3: Add generation-safe independent loaders and per-branch retry**

Implement these three loaders in the page; each checks the selected generation before writing state:

```tsx
const loadDetail = async (trip: TripSummary, generation: number) => {
  setDetailBranch({ ...emptyBranch<TripDetails>(), status: "loading" });
  try {
    const data = await fetchTripDetails(trip.id);
    if (generationRef.current === generation) setDetailBranch({ status: "success", data, error: "", invalidCount: 0 });
  } catch (error) {
    if (generationRef.current === generation) setDetailBranch({ status: "error", data: null, error: errorText(error, "Không thể tải chi tiết chuyến."), invalidCount: 0 });
  }
};

const loadLoadingBranch = async (
  kind: LoadingKind,
  trip: TripSummary,
  generation: number,
) => {
  const setBranch = kind === "pending" ? setPendingBranch : setInboundBranch;
  const reason = kind === "pending" ? "Thiếu" : "Dư";
  setBranch({ ...emptyBranch<string[]>(), status: "loading" });
  try {
    const result = await fetchAllLoadingItems(kind, trip.id, trip.displayStationSequence);
    if (generationRef.current !== generation) return;
    setItems((current) => mergeIncidentCodes(current, result.codes, reason, "auto"));
    setBranch({ status: "success", data: result.codes, error: "", invalidCount: result.invalidCount });
  } catch (error) {
    if (generationRef.current === generation) {
      setBranch({ status: "error", data: null, error: errorText(error, `Không thể tải kiện ${reason}.`), invalidCount: 0 });
    }
  }
};

const selectTrip = async (trip: TripSummary) => {
  const generation = generationRef.current + 1;
  generationRef.current = generation;
  setSelectedTrip(trip);
  setSearchResults([]);
  setItems([]);
  setStep("scan_items");
  await Promise.allSettled([
    loadDetail(trip, generation),
    loadLoadingBranch("pending", trip, generation),
    loadLoadingBranch("inbound", trip, generation),
  ]);
};
```

Render one branch status row for each of `Chi tiết chuyến`, `Kiện thiếu`, and `Kiện dư` using this file-scope component outside `TaoBienBanSuVuPage`, so React does not recreate the component type on every render:

```tsx
interface BranchStatusRowProps {
  label: string;
  state: BranchState<unknown>;
  successText: string;
  onRetry: () => void;
}

const BranchStatusRow = ({ label, state, successText, onRetry }: BranchStatusRowProps) => (
  <div className="flex flex-col gap-2 rounded-xl border border-base-300 p-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <strong className="text-sm">{label}</strong>
      {state.status === "loading" && <p className="text-xs text-base-content/60">Đang tải...</p>}
      {state.status === "success" && <p className="text-xs text-success">{successText}</p>}
      {state.status === "success" && state.invalidCount > 0 && (
        <p className="text-xs text-warning">Đã bỏ qua {state.invalidCount} item không có scan_number/to_number.</p>
      )}
      {state.status === "error" && <p className="text-xs text-error">{state.error}</p>}
    </div>
    {state.status === "error" && (
      <button type="button" className="btn btn-sm btn-outline min-h-10" onClick={onRetry}>Thử lại</button>
    )}
  </div>
);
```

Wire retries so they call only the failed branch and keep sibling data:

```tsx
<BranchStatusRow
  label="Chi tiết chuyến"
  state={detailBranch}
  successText="Đã tải thông tin chuyến."
  onRetry={() => selectedTrip && void loadDetail(selectedTrip, generationRef.current)}
/>
<BranchStatusRow
  label="Kiện thiếu"
  state={pendingBranch}
  successText={`Đã tải ${pendingBranch.data?.length ?? 0} mã thiếu.`}
  onRetry={() => selectedTrip && void loadLoadingBranch("pending", selectedTrip, generationRef.current)}
/>
<BranchStatusRow
  label="Kiện dư"
  state={inboundBranch}
  successText={`Đã tải ${inboundBranch.data?.length ?? 0} mã dư.`}
  onRetry={() => selectedTrip && void loadLoadingBranch("inbound", selectedTrip, generationRef.current)}
/>
```

Above the status rows, render the chosen trip and normalized detail data so the user can verify the selection before scanning more codes:

```tsx
{selectedTrip && (
  <section className="app-surface space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">Chuyến đã chọn</p>
        <h3 className="mt-1 font-mono text-lg font-black text-primary">
          {detailBranch.data?.tripNumber || selectedTrip.tripNumber || `Trip #${selectedTrip.id}`}
        </h3>
        <p className="text-sm font-semibold">{detailBranch.data?.tripName || selectedTrip.tripName}</p>
      </div>
      <span className="badge badge-outline">Sequence {selectedTrip.displayStationSequence}</span>
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="text-xs font-bold text-base-content/55">Biển số</dt><dd>{detailBranch.data?.vehicleNumber || selectedTrip.vehicleNumber || "Chưa có"}</dd></div>
      <div><dt className="text-xs font-bold text-base-content/55">Tài xế</dt><dd>{detailBranch.data?.driverName || selectedTrip.driverName || "Chưa có"}</dd></div>
      <div><dt className="text-xs font-bold text-base-content/55">Nhà xe</dt><dd>{detailBranch.data?.agencyName || selectedTrip.agencyName || "Chưa có"}</dd></div>
      <div><dt className="text-xs font-bold text-base-content/55">SOC hiện tại</dt><dd>{socName || "Chưa cấu hình"}</dd></div>
      <div><dt className="text-xs font-bold text-base-content/55">Loại xe</dt><dd>{detailBranch.data?.vehicleTypeName || selectedTrip.vehicleTypeName || "Chưa có"}</dd></div>
      <div><dt className="text-xs font-bold text-base-content/55">Seal</dt><dd>{detailBranch.data?.sealCodes.join(", ") || "Chưa có"}</dd></div>
      <div><dt className="text-xs font-bold text-base-content/55">Tổng kiện dự kiến</dt><dd>{detailBranch.data?.expectedQuantity ?? "Chưa có"}</dd></div>
      <div><dt className="text-xs font-bold text-base-content/55">Ngày chạy</dt><dd>{selectedTrip.tripDate > 0 ? new Date(selectedTrip.tripDate * 1000).toLocaleString("vi-VN") : "Chưa có"}</dd></div>
    </dl>
  </section>
)}
```

- [ ] **Step 4: Wire scanner input and clarify its label**

Keep the existing scan mode union. For `mode === "lhtrip"`, set `query` and immediately invoke the complete `runSearch` helper defined in Step 2:

```tsx
const applyScannedValue = (value: string, mode: ScanMode) => {
  if (mode === "lhtrip") void runSearch(value);
  else setCurrentCode(value.trim().toUpperCase());
};
```

In `EmbeddedQRScanner.tsx`, change only the visible mode label:

```tsx
{mode === "lhtrip" ? "Quét LH Trip hoặc biển số" : "Quét mã SPX / TO"} · QR / Barcode
```

- [ ] **Step 5: Typecheck, lint the touched UI files and commit**

Run:

```powershell
node node_modules/typescript/lib/tsc.js -b --pretty false
node node_modules/eslint/bin/eslint.js src/pages/TaoBienBanSuVuPage.tsx src/components/EmbeddedQRScanner.tsx src/features/incident-report/TripSearchPanel.tsx
```

Expected: both commands exit 0.

```powershell
git add src/pages/TaoBienBanSuVuPage.tsx src/components/EmbeddedQRScanner.tsx src/features/incident-report/TripSearchPanel.tsx
git commit -m "feat: search and load LH trip incidents"
```

---

### Task 5: Multi-reason item editor and workbook-shaped preview

**Files:**
- Create: `src/features/incident-report/IncidentItemsEditor.tsx`
- Create: `src/features/incident-report/IncidentReportPreview.tsx`
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`

**Interfaces:**
- Consumes: `IncidentItem[]`, `INCIDENT_REASONS`, selected trip/detail, SOC name, current manual code/reasons and existing log/send/print handlers.
- Produces: editable one-row-per-code incident list and printable preview with columns `SPX/TO`, `Rách`, `Bung seal`, `Không TO`, `Thiếu`, `Bể vỡ`, `Dư`, `Khác`.

- [ ] **Step 1: Create the reusable multi-reason editor**

Create `IncidentItemsEditor.tsx` with these props and behavior:

```tsx
import { Check, Plus, Trash2 } from "lucide-react";
import {
  INCIDENT_REASONS,
  type IncidentItem,
  type IncidentReason,
} from "./incidentReport";

interface IncidentItemsEditorProps {
  items: readonly IncidentItem[];
  code: string;
  selectedReasons: readonly IncidentReason[];
  onCodeChange: (value: string) => void;
  onReasonChange: (reason: IncidentReason) => void;
  onAdd: () => void;
  onToggleItemReason: (id: string, reason: IncidentReason) => void;
  onRemove: (id: string) => void;
  onOpenScanner: () => void;
}

const ReasonToggle = ({ selected, label, onClick }: { selected: boolean; label: IncidentReason; onClick: () => void }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`btn btn-sm min-h-10 justify-start ${selected ? "btn-primary" : "btn-outline"}`}
  >
    {selected && <Check className="h-3.5 w-3.5" />}{label}
  </button>
);

export function IncidentItemsEditor(props: IncidentItemsEditorProps) {
  return (
    <section className="space-y-4">
      <div className="app-surface space-y-3 p-4">
        <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="grid gap-1.5 text-sm font-bold">
            Mã SPX hoặc TO
            <input
              value={props.code}
              onChange={(event) => props.onCodeChange(event.target.value.toUpperCase())}
              className="input input-bordered min-h-11 w-full font-mono uppercase"
              placeholder="Quét hoặc nhập mã kiện"
            />
          </label>
          <button type="button" className="btn min-h-11" onClick={props.onOpenScanner}>Quét mã</button>
          <button type="button" className="btn btn-primary min-h-11 gap-2" onClick={props.onAdd}>
            <Plus className="h-4 w-4" /> Thêm / cập nhật
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {INCIDENT_REASONS.map((reason) => (
            <ReasonToggle
              key={reason}
              label={reason}
              selected={props.selectedReasons.includes(reason)}
              onClick={() => props.onReasonChange(reason)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {props.items.map((item, index) => (
          <article key={item.id} className="app-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div><span className="text-xs text-base-content/50">#{index + 1}</span><p className="break-all font-mono font-bold text-primary">{item.code}</p></div>
              <button className="btn btn-ghost btn-circle min-h-10 min-w-10 text-error" onClick={() => props.onRemove(item.id)} aria-label={`Xóa ${item.code}`}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {INCIDENT_REASONS.map((reason) => <ReasonToggle key={reason} label={reason} selected={item.reasons.includes(reason)} onClick={() => props.onToggleItemReason(item.id, reason)} />)}
            </div>
          </article>
        ))}
      </div>

      <div className="app-surface hidden overflow-x-auto md:block">
        <table className="table table-sm min-w-[60rem]">
          <thead><tr><th>STT</th><th>SPX/TO</th>{INCIDENT_REASONS.map((reason) => <th key={reason} className="text-center">{reason}</th>)}<th /></tr></thead>
          <tbody>{props.items.map((item, index) => (
            <tr key={item.id}>
              <td>{index + 1}</td><td className="font-mono font-bold">{item.code}</td>
              {INCIDENT_REASONS.map((reason) => <td key={reason} className="text-center"><label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><input type="checkbox" className="checkbox checkbox-sm" aria-label={`${item.code}: ${reason}`} checked={item.reasons.includes(reason)} onChange={() => props.onToggleItemReason(item.id, reason)} /></label></td>)}
              <td><button className="btn btn-ghost btn-circle text-error" onClick={() => props.onRemove(item.id)} aria-label={`Xóa ${item.code}`}><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire manual scans to merge multiple selected reasons**

In the page, replace the old single `currentReason` state with:

```tsx
const [currentCode, setCurrentCode] = useState("");
const [selectedReasons, setSelectedReasons] = useState<IncidentReason[]>(["Khác"]);

const toggleSelectedReason = (reason: IncidentReason) => {
  setSelectedReasons((current) =>
    current.includes(reason)
      ? current.length > 1 ? current.filter((item) => item !== reason) : current
      : INCIDENT_REASONS.filter((item) => item === reason || current.includes(item)),
  );
};

const addManualItem = () => {
  const code = currentCode.trim().toUpperCase();
  if (!code) return showToast("Vui lòng nhập hoặc quét mã SPX/TO.", "warning");
  setItems((current) => selectedReasons.reduce(
    (next, reason) => mergeIncidentCodes(next, [code], reason, "manual"),
    current,
  ));
  setCurrentCode("");
  showToast("Đã thêm hoặc cập nhật mã sự vụ.", "success");
};
```

Pass `toggleIncidentReason` and `removeIncidentItem` through the component props. Scanning mode `item` fills `currentCode`; the user can confirm/edit the reasons before clicking `Thêm / cập nhật`.

- [ ] **Step 3: Create the report preview matching the workbook columns**

Create `IncidentReportPreview.tsx`:

```tsx
import {
  INCIDENT_REASONS,
  type IncidentItem,
  type TripDetails,
  type TripSummary,
} from "./incidentReport";

interface IncidentReportPreviewProps {
  socName: string;
  trip: TripSummary;
  details: TripDetails | null;
  items: readonly IncidentItem[];
  createdAt: Date;
}

const display = (value: string) => value || "________________";
const formatTripDate = (seconds: number) =>
  seconds > 0 ? new Date(seconds * 1000).toLocaleString("vi-VN") : "________________";

export function IncidentReportPreview({ socName, trip, details, items, createdAt }: IncidentReportPreviewProps) {
  const driver = details?.driverName || trip.driverName;
  const secondDriver = details?.secondDriverName || trip.secondDriverName;
  const vehicle = details?.vehicleNumber || trip.vehicleNumber;
  const agency = details?.agencyName || trip.agencyName;
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-md sm:p-6 print:border-none print:p-0 print:shadow-none">
      <header className="border-b-2 border-slate-900 pb-4 text-center">
        <h2 className="text-xl font-black uppercase sm:text-2xl">Biên bản sự vụ LH Trip</h2>
        <p className="mt-1 text-xs">Lập lúc {createdAt.toLocaleString("vi-VN")}</p>
      </header>
      <dl className="my-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="font-bold">SOC</dt><dd>{display(socName)}</dd></div>
        <div><dt className="font-bold">LH Trip</dt><dd className="font-mono">{display(details?.tripNumber || trip.tripNumber)}</dd></div>
        <div><dt className="font-bold">Tên chuyến</dt><dd>{display(details?.tripName || trip.tripName)}</dd></div>
        <div><dt className="font-bold">Ngày chạy</dt><dd>{formatTripDate(details?.tripDate || trip.tripDate)}</dd></div>
        <div><dt className="font-bold">Biển số / loại xe</dt><dd>{display([vehicle, details?.vehicleTypeName || trip.vehicleTypeName].filter(Boolean).join(" · "))}</dd></div>
        <div><dt className="font-bold">Tài xế</dt><dd>{display([driver, secondDriver].filter(Boolean).join(" / "))}</dd></div>
        <div><dt className="font-bold">Nhà xe</dt><dd>{display(agency)}</dd></div>
        <div><dt className="font-bold">Seal</dt><dd>{display(details?.sealCodes.join(", ") || "")}</dd></div>
        <div><dt className="font-bold">Tổng kiện dự kiến</dt><dd>{details?.expectedQuantity ?? "________________"}</dd></div>
        <div><dt className="font-bold">Ghi chú chuyến</dt><dd>{display(details?.remark || "")}</dd></div>
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] border-collapse text-xs">
          <thead><tr><th className="border border-slate-400 p-2">STT</th><th className="border border-slate-400 p-2 text-left">SPX/TO</th>{INCIDENT_REASONS.map((reason) => <th key={reason} className="border border-slate-400 p-2">{reason}</th>)}</tr></thead>
          <tbody>{items.map((item, index) => (
            <tr key={item.id}><td className="border border-slate-300 p-2 text-center">{index + 1}</td><td className="border border-slate-300 p-2 font-mono font-bold">{item.code}</td>{INCIDENT_REASONS.map((reason) => <td key={reason} className="border border-slate-300 p-2 text-center">{item.reasons.includes(reason) ? "✓" : ""}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <footer className="mt-8 grid grid-cols-2 gap-6 text-center text-xs">
        <div><strong>Người lập biên bản</strong><p>(Ký và ghi rõ họ tên)</p><div className="h-20" /></div>
        <div><strong>Xác nhận kho / tài xế</strong><p>(Ký và ghi rõ họ tên)</p><div className="h-20" /></div>
      </footer>
    </article>
  );
}
```

- [ ] **Step 4: Replace old preview/log references and preserve existing actions**

In `TaoBienBanSuVuPage.tsx`:

```tsx
const incidentLog = formatIncidentLog(items);
const selectedTripNumber = detailBranch.data?.tripNumber || selectedTrip?.tripNumber || query;
```

Use `selectedTripNumber` as column 1 and `incidentLog` as column 2 in the existing Google Sheet request/copy UI. Keep the current `getLogUrl()`, `fetch`, `handlePrint`, toast and reset behavior, but make reset increment `generationRef.current`, set `createdAt` to `new Date()`, clear all three branch states, clear selection/results/items and return to the first step. Pass the stable `createdAt` state into `<IncidentReportPreview>` and render the preview only when `selectedTrip` is non-null.

- [ ] **Step 5: Typecheck, lint and commit the editor/preview slice**

Run:

```powershell
node node_modules/typescript/lib/tsc.js -b --pretty false
node node_modules/eslint/bin/eslint.js src/pages/TaoBienBanSuVuPage.tsx src/features/incident-report/IncidentItemsEditor.tsx src/features/incident-report/IncidentReportPreview.tsx
node --experimental-strip-types --test tests/incidentReport.test.ts
```

Expected: all commands exit 0.

```powershell
git add src/pages/TaoBienBanSuVuPage.tsx src/features/incident-report/IncidentItemsEditor.tsx src/features/incident-report/IncidentReportPreview.tsx
git commit -m "feat: build incident report editor and preview"
```

---

### Task 6: Regression verification and userscript release bundle

**Files:**
- Modify: `vite.userscript.config.ts`
- Regenerate: `userscript-dist/ops-fte.user.js`
- Regenerate: any userscript assets emitted by the existing Vite build.

**Interfaces:**
- Consumes: completed feature and existing Vite userscript build pipeline.
- Produces: installable OPS FTE userscript metadata version `0.6.0` containing the LH Trip incident report autofill feature.

- [ ] **Step 1: Run the focused feature suite and changed-file lint**

```powershell
node --experimental-strip-types --test tests/incidentReport.test.ts
node node_modules/eslint/bin/eslint.js src/pages/TaoBienBanSuVuPage.tsx src/components/EmbeddedQRScanner.tsx src/features/incident-report/incidentReport.ts src/features/incident-report/incidentReportApi.ts src/features/incident-report/TripSearchPanel.tsx src/features/incident-report/IncidentItemsEditor.tsx src/features/incident-report/IncidentReportPreview.tsx tests/incidentReport.test.ts
```

Expected: all incident-report tests PASS and lint exits 0.

- [ ] **Step 2: Run the full repository test suite and classify pre-existing failures**

```powershell
npm test
```

Expected: no new incident-report failures. If the known unrelated module/access-control tests still fail, capture their exact names and compare with the baseline before this feature; do not modify unrelated modules merely to make this feature commit green.

- [ ] **Step 3: Build the web app before changing the release metadata**

```powershell
npm run build
```

Expected: TypeScript and Vite production build complete successfully.

- [ ] **Step 4: Bump userscript version and regenerate the distributable**

Change the metadata line in `vite.userscript.config.ts` exactly to:

```ts
// @version      0.6.0
```

Then run:

```powershell
npm run build:userscript
Select-String -LiteralPath userscript-dist/ops-fte.user.js -Pattern '@version      0.6.0'
```

Expected: build exits 0 and `Select-String` finds the version header in the generated userscript.

- [ ] **Step 5: Perform the logged-in SPX smoke test**

With the generated userscript installed on `https://spx.shopee.vn/`, verify these exact cases:

1. Search a valid `LT...` value and confirm the request contains only `trip_number`.
2. Search a plate with more than one match and confirm no trip is selected until clicking one result.
3. Confirm pending requests use the selected result's `display_station_sequence` and auto-mark every page as `Thiếu`.
4. Confirm inbound requests use the same sequence and auto-mark every page as `Dư`.
5. Confirm an item with blank `scan_number` displays its `to_number`.
6. Scan an existing code, add `Rách`, and confirm it stays one row with both flags.
7. Force one loading request to fail, verify the other branch remains visible, then use the failed branch's retry button.
8. Select a second trip before the first finishes and confirm first-trip responses do not overwrite the new trip.
9. Preview, copy log, send log and print; verify multi-reason output such as `SPXVN001@Rách + Thiếu`.
10. Confirm the printable table has all seven reason columns and contains no hardcoded sample person/address/plate from the workbook.

- [ ] **Step 6: Review the release diff and commit the bundle**

```powershell
git status --short
git diff --check
git diff --stat
git add vite.userscript.config.ts userscript-dist/ops-fte.user.js
git add -u userscript-dist
git commit -m "build: release incident report autofill userscript"
```

Expected: the untracked `Record biên bản.xlsx` remains unmodified and uncommitted.

---

## Completion Checklist

- [ ] Search handles LH Trip and plate number with safe URL encoding.
- [ ] Multiple trips require explicit selection.
- [ ] Detail, pending and inbound branches use the selected `id`; loading branches use `display_station_sequence`.
- [ ] No code reads or depends on `trip_station`.
- [ ] Pagination retrieves all pages and stops safely.
- [ ] `scan_number` wins over `to_number`; invalid rows are counted and shown.
- [ ] Pending/Dư/manual scans merge by normalized code and keep multiple reasons.
- [ ] Branch errors remain isolated and retriable; stale trip responses are ignored.
- [ ] Mobile editor and desktop table expose all seven workbook reason columns.
- [ ] Preview includes SOC/trip/vehicle/driver/agency/seal/quantity without workbook sample data.
- [ ] Existing log, copy, send, print and reset actions still work.
- [ ] Focused tests, changed-file lint, TypeScript, production build and userscript build pass.
- [ ] Userscript metadata and generated header both report `0.6.0`.
