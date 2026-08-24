# LIST SOC Sheet Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay các ô nhập tay SOC/Hub/Group trong trang Cấu hình bằng danh mục SOC và Hub được đọc có kiểm soát từ sheet `LIST SOC`, sau đó lưu cấu hình hoàn chỉnh vào localStorage để các màn tra cứu hiện tại tiếp tục hoạt động.

**Architecture:** Google Apps Script cung cấp hai lời gọi tách biệt: `getStationCatalog()` chỉ trả A–D của toàn bộ SOC và `getStationHubs(socId)` chỉ đọc E của SOC được chọn. Frontend chuẩn hóa response, dựng `AppConfig` qua các hàm thuần có kiểm thử, rồi `SettingsPage` điều phối trạng thái tải/chọn/nhập/lưu; các màn check TO không gọi sheet.

**Tech Stack:** Google Apps Script ES5, React 19, TypeScript 6, Tailwind CSS 4 + daisyUI 5, Lucide React, Node built-in test runner, Vite 8.

## Global Constraints

- Sheet nguồn có tên chính xác `LIST SOC`; hàng 1 là tiêu đề, dữ liệu bắt đầu từ hàng 2, cột A–E lần lượt là `station_name`, `station_code`, `id`, `number_prefix`, `list hub`.
- Chỉ `getStationHubs(socId)` được đọc cột E và chỉ đọc đúng hàng của SOC được chọn; không tải Hub của SOC ngoại tỉnh.
- Không tải được catalog hoặc Hub của SOC đang chọn thì khóa lưu; không xóa cấu hình local hiện có.
- SOC hiện tại không xuất hiện trong danh sách SOC ngoại tỉnh, SOC đại diện hoặc thành viên Group SOC.
- SOC đại diện luôn là thành viên đầu tiên và xuất hiện đúng một lần trong nhóm.
- Giữ Cookie, xóa Cookie, URL Log Sự Vụ, scanner, nhập/xuất JSON và đặt lại; bỏ nhập tay SOC/Hub/Group và bỏ nút tải mẫu.
- Import JSON không được dùng `hubs`, `hub_ids`, `hub_codes`, `socs`, `soc_ids` hoặc `soc_codes` trong file để ghi đè dữ liệu lấy từ sheet.
- Không đổi payload API packed TO/loose order và không gọi `LIST SOC` trong các màn tra cứu.
- Không sửa hoặc stage các thay đổi có sẵn trong `src/layouts/MobileLayout.tsx` và `src/pages/HomePage.tsx` trừ khi người dùng yêu cầu riêng.
- Không đồng bộ artifact deploy `gas/index.html` trong kế hoạch này.

## File Structure

- Create `tests/stationCatalogGas.test.ts`: VM harness và kiểm thử hai hàm GAS cùng parser cột E.
- Modify `gas/code.gs`: hằng số/routines đọc `LIST SOC`, validate catalog và Hub.
- Create `src/utils/stationCatalog.ts`: types, response normalization và Promise bridge cho `google.script.run`.
- Create `tests/stationCatalog.test.ts`: kiểm thử normalization và bridge frontend.
- Create `src/utils/stationConfiguration.ts`: đối chiếu cấu hình cũ, lọc SOC ngoại tỉnh, chuẩn hóa Group SOC và dựng `AppConfig` nguyên khối.
- Modify `src/utils/config.ts`: metadata mã trạm/prefix dạng additive.
- Rewrite `tests/stations.test.ts`: thay test parser nhập tay/default mẫu bằng test cấu hình từ catalog.
- Create `src/components/StationSelect.tsx`: combobox SOC tìm theo tên và mã, dùng `SearchableSelect` hiện có.
- Create `src/components/SocGroupEditor.tsx`: tạo/sửa/xóa nhóm bằng SOC đại diện và chip thành viên.
- Rewrite `src/pages/SettingsPage.tsx`: tải catalog/Hub, chống race, import vào draft, preview dữ liệu và lưu cấu hình mới.
- Modify `tests/config.test.ts`: giữ regression xóa Cookie và thêm assertions cho UI cấu hình mới.
- Delete in Task 5 `src/config/defaultStationConfig.ts`: bỏ dữ liệu Pleiku viết cứng sau khi Settings không còn import.
- Delete in Task 5 `src/utils/stations.ts`: bỏ parser `Tên | ID` sau khi Settings không còn consumer.
- Modify `package.json`: đưa hai test mới vào script `test`.

---

### Task 1: Google Apps Script station catalog API

**Files:**
- Create: `tests/stationCatalogGas.test.ts`
- Modify: `gas/code.gs`
- Modify: `package.json`

**Interfaces:**
- Consumes: active spreadsheet có sheet `LIST SOC`.
- Produces: `getStationCatalog(): Array<{stationName, stationCode, id, numberPrefix}>` và `getStationHubs(socId): Array<{stationName, stationCode, id}>` callable qua `google.script.run`.

- [ ] **Step 1: Viết VM harness và test thất bại cho catalog A–D**

Tạo `tests/stationCatalogGas.test.ts` với sheet mock ghi lại mọi lời gọi `getRange`. Test đầu dùng hai hàng SOC và xác nhận kết quả không có trường `hubs`:

```ts
test("returns only LIST SOC columns A-D for the catalog", async () => {
  const harness = await createStationCatalogHarness({
    rows: [
      ["BD A Mega SOC", "63SOCBD1", "2490", "63", "Hub A | 63A01 | 3954"],
      ["HN SOC", "20SOCHN", "6", "20", "Hub HN | 20HN01 | 100"],
    ],
  });

  assert.deepEqual(toPlain(harness.context.getStationCatalog()), [
    { stationName: "BD A Mega SOC", stationCode: "63SOCBD1", id: "2490", numberPrefix: "63" },
    { stationName: "HN SOC", stationCode: "20SOCHN", id: "6", numberPrefix: "20" },
  ]);
  assert.deepEqual(harness.getRanges(), [[2, 1, 2, 4]]);
});
```

Harness phải mock `getLastRow()`, `getRange(row, column, rowCount?, columnCount?)`, `getDisplayValues()` và `getDisplayValue()`; `toPlain` dùng `JSON.parse(JSON.stringify(value))` để đưa object khỏi VM realm.

- [ ] **Step 2: Viết test thất bại cho Hub của đúng SOC**

Thêm các ca xác nhận ID được dùng để tìm hàng, chỉ cột E của hàng đó được đọc, và parser nhận cả newline lẫn `<br>`:

```ts
test("loads and parses only the selected SOC hub cell", async () => {
  const harness = await createStationCatalogHarness({
    rows: [
      ["BD A Mega SOC", "63SOCBD1", "2490", "63", "Hub A | 63A01 | 3954<br>Hub B | 63A02 | 5409"],
      ["HN SOC", "20SOCHN", "6", "20", "Hub HN | 20HN01 | 100"],
    ],
  });

  assert.deepEqual(toPlain(harness.context.getStationHubs("2490")), [
    { stationName: "Hub A", stationCode: "63A01", id: "3954" },
    { stationName: "Hub B", stationCode: "63A02", id: "5409" },
  ]);
  assert.ok(harness.getRanges().some((args) => args[0] === 2 && args[1] === 5));
  assert.ok(!harness.getRanges().some((args) => args[1] === 5 && args[0] === 3));
});
```

- [ ] **Step 3: Viết test thất bại cho validation nguyên khối**

Thêm test cho sheet thiếu, catalog rỗng, SOC thiếu/trùng tên-mã-ID, SOC ID không tồn tại, Hub sai ba phần và Hub trùng tên-mã-ID. Dùng assertions cụ thể:

```ts
assert.throws(() => context.getStationCatalog(), /LIST SOC/);
assert.throws(() => context.getStationHubs("missing"), /không tồn tại/);
assert.throws(() => context.getStationHubs("2490"), /dòng Hub 2/);
assert.throws(() => context.getStationCatalog(), /station_code.*bị trùng/i);
```

- [ ] **Step 4: Chạy test để xác nhận đang fail**

Run: `node --experimental-strip-types --test tests/stationCatalogGas.test.ts`

Expected: FAIL vì `getStationCatalog` và `getStationHubs` chưa tồn tại.

- [ ] **Step 5: Cài đặt hàm GAS tối thiểu**

Thêm vào đầu `gas/code.gs`, cạnh hằng số VERSION:

```js
var STATION_CATALOG_SHEET_NAME = "LIST SOC";
var STATION_CATALOG_FIRST_DATA_ROW = 2;

function getStationCatalog() {
  var source = getStationCatalogSource_();
  return source.rows.map(function (row) {
    return {
      stationName: row.stationName,
      stationCode: row.stationCode,
      id: row.id,
      numberPrefix: row.numberPrefix
    };
  });
}

function getStationHubs(socId) {
  var source = getStationCatalogSource_();
  var normalizedId = String(socId || "").trim();
  var matches = source.rows.filter(function (row) { return row.id === normalizedId; });
  if (matches.length !== 1) {
    throw new Error('SOC ID "' + normalizedId + '" không tồn tại duy nhất trong LIST SOC.');
  }
  var hubText = source.sheet.getRange(matches[0].sheetRow, 5).getDisplayValue();
  return parseStationHubs_(hubText, matches[0].sheetRow);
}
```

`getStationCatalogSource_()` phải đọc đúng một range A–D, trim string, bỏ hàng trống hoàn toàn, ghi `sheetRow`; chỉ tên/mã/ID là bắt buộc, còn prefix được phép rỗng. Uniqueness không phân biệt hoa thường cho tên/mã và dùng exact string cho ID. Cài đặt các helper theo cấu trúc sau:

```js
function stationKey_(value) {
  return String(value || "").trim().toLowerCase();
}

function getStationCatalogSource_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(STATION_CATALOG_SHEET_NAME);
  if (!sheet) throw new Error('Không tìm thấy sheet "LIST SOC".');

  var lastRow = sheet.getLastRow();
  if (lastRow < STATION_CATALOG_FIRST_DATA_ROW) {
    throw new Error('Sheet "LIST SOC" chưa có dữ liệu SOC.');
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var rows = [];
  var names = {};
  var codes = {};
  var ids = {};

  values.forEach(function (valuesRow, index) {
    var sheetRow = index + STATION_CATALOG_FIRST_DATA_ROW;
    var row = {
      stationName: String(valuesRow[0] || "").trim(),
      stationCode: String(valuesRow[1] || "").trim(),
      id: String(valuesRow[2] || "").trim(),
      numberPrefix: String(valuesRow[3] || "").trim(),
      sheetRow: sheetRow
    };
    if (!row.stationName && !row.stationCode && !row.id && !row.numberPrefix) return;
    if (!row.stationName || !row.stationCode || !row.id) {
      throw new Error("LIST SOC hàng " + sheetRow + " thiếu station_name, station_code hoặc id.");
    }

    var nameKey = stationKey_(row.stationName);
    var codeKey = stationKey_(row.stationCode);
    if (names[nameKey]) throw new Error("station_name bị trùng tại hàng " + sheetRow + ".");
    if (codes[codeKey]) throw new Error("station_code bị trùng tại hàng " + sheetRow + ".");
    if (ids[row.id]) throw new Error("id SOC bị trùng tại hàng " + sheetRow + ".");
    names[nameKey] = true;
    codes[codeKey] = true;
    ids[row.id] = true;
    rows.push(row);
  });

  if (!rows.length) throw new Error('Sheet "LIST SOC" chưa có dữ liệu SOC.');
  return { sheet: sheet, rows: rows };
}

function parseStationHubs_(value, sheetRow) {
  var names = {};
  var codes = {};
  var ids = {};
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line !== ""; })
    .map(function (line, index) {
      var parts = line.split("|").map(function (part) { return part.trim(); });
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        throw new Error("LIST SOC hàng " + sheetRow + ", dòng Hub " + (index + 1) + " phải có dạng Tên | Mã | ID.");
      }
      var nameKey = stationKey_(parts[0]);
      var codeKey = stationKey_(parts[1]);
      if (names[nameKey] || codes[codeKey] || ids[parts[2]]) {
        throw new Error("LIST SOC hàng " + sheetRow + ", dòng Hub " + (index + 1) + " bị trùng tên, mã hoặc ID.");
      }
      names[nameKey] = true;
      codes[codeKey] = true;
      ids[parts[2]] = true;
      return { stationName: parts[0], stationCode: parts[1], id: parts[2] };
    });
}
```

- [ ] **Step 6: Chạy test GAS và regression VERSION**

Run: `node --experimental-strip-types --test tests/stationCatalogGas.test.ts tests/appVersionGas.test.ts`

Expected: tất cả test catalog và VERSION PASS.

- [ ] **Step 7: Thêm test mới vào script và commit**

Trong `package.json`, thêm `tests/stationCatalogGas.test.ts` vào chuỗi `test`, sau đó:

```bash
git add gas/code.gs tests/stationCatalogGas.test.ts package.json
git commit -m "feat: expose LIST SOC catalog from Apps Script"
```

### Task 2: Frontend Apps Script bridge and response normalization

**Files:**
- Create: `src/utils/stationCatalog.ts`
- Create: `tests/stationCatalog.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: GAS methods from Task 1.
- Produces: `StationCatalogSoc`, `StationCatalogHub`, `loadStationCatalog(runner?)`, `loadStationHubs(socId, runner?)`, `normalizeStationCatalog(value)`, `normalizeStationHubs(value)`.

- [ ] **Step 1: Viết test thất bại cho normalization nghiêm ngặt**

Tạo `tests/stationCatalog.test.ts`:

```ts
test("normalizes catalog and hub display strings", () => {
  assert.deepEqual(normalizeStationCatalog([
    { stationName: " BD A Mega SOC ", stationCode: " 63SOCBD1 ", id: " 2490 ", numberPrefix: " 63 " },
  ]), [
    { stationName: "BD A Mega SOC", stationCode: "63SOCBD1", id: "2490", numberPrefix: "63" },
  ]);
  assert.deepEqual(normalizeStationHubs([
    { stationName: " Hub A ", stationCode: " 63A01 ", id: " 3954 " },
  ]), [
    { stationName: "Hub A", stationCode: "63A01", id: "3954" },
  ]);
});

test("rejects malformed and duplicate catalog responses", () => {
  assert.throws(() => normalizeStationCatalog(null), /không hợp lệ/);
  assert.throws(() => normalizeStationCatalog([
    { stationName: "HN SOC", stationCode: "20SOCHN", id: "6", numberPrefix: "20" },
    { stationName: "hn soc", stationCode: "OTHER", id: "7", numberPrefix: "20" },
  ]), /bị trùng/);
});
```

- [ ] **Step 2: Viết runner giả và test Promise bridge**

Runner giả phải lưu success/failure handler và triển khai cả hai method. Xác nhận method/argument chính xác và lỗi GAS trở thành rejected `Error` có message dùng được trên UI:

```ts
assert.deepEqual(await loadStationCatalog(createRunner({ catalog })), catalog);
assert.deepEqual(await loadStationHubs("2490", createRunner({ hubs })), hubs);
await assert.rejects(loadStationCatalog(createRunner({ error: new Error("sheet missing") })), /sheet missing/);
await assert.rejects(loadStationHubs("", createRunner({ hubs: [] })), /SOC/);
```

- [ ] **Step 3: Chạy test để xác nhận đang fail**

Run: `node --experimental-strip-types --test tests/stationCatalog.test.ts`

Expected: FAIL vì module `src/utils/stationCatalog.ts` chưa tồn tại.

- [ ] **Step 4: Cài đặt types, normalizers và bridge**

Tạo interface runner dạng chain tương thích `google.script.run`:

```ts
export interface StationCatalogRunner {
  withSuccessHandler(handler: (value: unknown) => void): StationCatalogRunner;
  withFailureHandler(handler: (error: unknown) => void): StationCatalogRunner;
  getStationCatalog(): void;
  getStationHubs(socId: string): void;
}

export const loadStationCatalog = (
  runner: StationCatalogRunner | null = getDefaultRunner(),
): Promise<StationCatalogSoc[]> =>
  runCatalogCall(runner, (activeRunner) => activeRunner.getStationCatalog(), normalizeStationCatalog);

export const loadStationHubs = (
  socId: string,
  runner: StationCatalogRunner | null = getDefaultRunner(),
): Promise<StationCatalogHub[]> => {
  if (!socId.trim()) return Promise.reject(new Error("Hãy chọn SOC trước khi tải Hub."));
  return runCatalogCall(
    runner,
    (activeRunner) => activeRunner.getStationHubs(socId.trim()),
    normalizeStationHubs,
  );
};
```

Private runner helper dùng cùng một đường lỗi cho cả hai method:

```ts
const runCatalogCall = <T>(
  runner: StationCatalogRunner | null,
  invoke: (activeRunner: StationCatalogRunner) => void,
  normalize: (value: unknown) => T,
): Promise<T> => {
  if (!runner) return Promise.reject(new Error("Không tìm thấy Google Apps Script để tải LIST SOC."));
  return new Promise((resolve, reject) => {
    try {
      const activeRunner = runner
        .withSuccessHandler((value) => {
          try { resolve(normalize(value)); }
          catch (error) { reject(toStationCatalogError(error)); }
        })
        .withFailureHandler((error) => reject(toStationCatalogError(error)));
      invoke(activeRunner);
    } catch (error) {
      reject(toStationCatalogError(error));
    }
  });
};

const toStationCatalogError = (error: unknown): Error => {
  if (error instanceof Error && error.message.trim()) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message).trim();
    if (message) return new Error(message);
  }
  return new Error("Không thể tải dữ liệu từ LIST SOC.");
};
```

Không trả `null`: runner thiếu, response sai kiểu và failure handler đều reject với message cụ thể để Settings chuyển sang trạng thái khóa. `getDefaultRunner()` đọc `(globalThis as GoogleAppsScriptGlobal).google?.script?.run ?? null`, cùng pattern với `appVersion.ts`. Normalizers frontend lặp lại validation bắt buộc/uniqueness để không tin response động từ Apps Script; `stationName`, `stationCode`, `id` là bắt buộc, còn `numberPrefix` là chuỗi được phép rỗng.

- [ ] **Step 5: Chạy test utility**

Run: `node --experimental-strip-types --test tests/stationCatalog.test.ts tests/appVersion.test.ts`

Expected: PASS.

- [ ] **Step 6: Thêm test vào script và commit**

Thêm `tests/stationCatalog.test.ts` vào `package.json`, rồi:

```bash
git add src/utils/stationCatalog.ts tests/stationCatalog.test.ts package.json
git commit -m "feat: load station catalog in frontend"
```

### Task 3: Pure station configuration builder and legacy reconciliation

**Files:**
- Create: `src/utils/stationConfiguration.ts`
- Modify: `src/utils/config.ts`
- Rewrite: `tests/stations.test.ts`

**Interfaces:**
- Consumes: `StationCatalogSoc`, `StationCatalogHub` từ Task 2 và `AppConfig` hiện có.
- Produces: `findConfiguredSocId`, `getExternalSocs`, `reconcileGroupSocs`, `validateGroupSocs`, `buildStationConfig`.

- [ ] **Step 1: Thay test parser nhập tay bằng test đối chiếu cấu hình cũ**

Viết lại `tests/stations.test.ts` để không import default Pleiku hoặc parser `Tên | ID`. Khai báo fixtures dùng chung trước các test:

```ts
const emptyConfig: AppConfig = {
  soc: "",
  cookies: "",
  hubs: [],
  socs: [],
  group_socs: {},
};

const catalog: StationCatalogSoc[] = [
  { stationName: "BD A Mega SOC", stationCode: "63SOCBD1", id: "2490", numberPrefix: "63" },
  { stationName: "HN SOC", stationCode: "20SOCHN", id: "6", numberPrefix: "20" },
  { stationName: "DN Mega SOC", stationCode: "36SOCDNG", id: "3983", numberPrefix: "36" },
];
```

Sau đó thêm ca đối chiếu:

```ts
test("matches stored SOC by id, then code, then name", () => {
  assert.equal(findConfiguredSocId({ ...emptyConfig, soc_id: "2490" }, catalog), "2490");
  assert.equal(findConfiguredSocId({ ...emptyConfig, soc_code: "63SOCBD1" }, catalog), "2490");
  assert.equal(findConfiguredSocId({ ...emptyConfig, soc: "BD A Mega SOC" }, catalog), "2490");
  assert.equal(findConfiguredSocId({ ...emptyConfig, soc: "Missing SOC" }, catalog), "");
});
```

- [ ] **Step 2: Viết test loại SOC hiện tại và reconcile Group SOC**

```ts
test("excludes the current SOC and normalizes valid groups", () => {
  const external = getExternalSocs(catalog, "2490");
  assert.deepEqual(external.map(({ id }) => id), ["6", "3983"]);
  assert.deepEqual(reconcileGroupSocs({
    "HN SOC": ["DN Mega SOC", "HN SOC", "HN SOC", "Missing SOC", "BD A Mega SOC"],
    "BD A Mega SOC": ["BD A Mega SOC", "HN SOC"],
  }, external), {
    "HN SOC": ["HN SOC", "DN Mega SOC"],
  });
});
```

Quy tắc reconcile cho cấu hình cũ/import: input không phải object được coi là `{}`; key không thuộc external bị bỏ; representative đứng đầu; phần tử không phải string/trùng/current SOC/missing member bị bỏ; nhóm chỉ còn representative không cần lưu trong map.

Thêm test riêng cho đường lưu nghiêm ngặt:

```ts
assert.throws(
  () => validateGroupSocs({ "HN SOC": ["HN SOC", "Missing SOC"] }, external),
  /Missing SOC.*không thuộc danh sách SOC ngoại tỉnh/,
);
assert.deepEqual(
  validateGroupSocs({ "HN SOC": ["DN Mega SOC", "HN SOC", "HN SOC"] }, external),
  { "HN SOC": ["HN SOC", "DN Mega SOC"] },
);
```

- [ ] **Step 3: Viết test dựng AppConfig nguyên khối**

```ts
test("builds local config from the selected sheet row", () => {
  const result = buildStationConfig({
    previousConfig: { ...emptyConfig, proxy_url: "https://proxy", scanner_url: "https://scan" },
    catalog,
    currentSocId: "2490",
    hubs: [{ stationName: "Hub A", stationCode: "63A01", id: "3954" }],
    groupSocs: { "HN SOC": ["HN SOC", "DN Mega SOC"] },
    cookies: " cookie=value ",
    logUrl: " https://log ",
  });

  assert.equal(result.soc, "BD A Mega SOC");
  assert.equal(result.soc_code, "63SOCBD1");
  assert.equal(result.number_prefix, "63");
  assert.deepEqual(result.hub_ids, { "Hub A": "3954" });
  assert.deepEqual(result.hub_codes, { "Hub A": "63A01" });
  assert.deepEqual(result.socs, ["HN SOC", "DN Mega SOC"]);
  assert.equal(result.cookies, "cookie=value");
  assert.equal(result.proxy_url, "https://proxy");
  assert.equal(result.raw_group_socs_text, undefined);
});
```

Thêm test throws cho SOC ID không tồn tại, Hub response trùng/thiếu trường và group chứa phần tử ngoài external.

- [ ] **Step 4: Chạy test để xác nhận đang fail**

Run: `node --experimental-strip-types --test tests/stations.test.ts tests/config.test.ts`

Expected: FAIL vì helper mới chưa tồn tại.

- [ ] **Step 5: Mở rộng AppConfig và cài đặt helper thuần**

Thêm vào `AppConfig` trong `src/utils/config.ts`:

```ts
soc_code?: string;
number_prefix?: string;
hub_codes?: Record<string, string>;
soc_codes?: Record<string, string>;
```

Tạo `src/utils/stationConfiguration.ts` với input rõ ràng:

```ts
export interface BuildStationConfigInput {
  previousConfig: AppConfig;
  catalog: readonly StationCatalogSoc[];
  currentSocId: string;
  hubs: readonly StationCatalogHub[];
  groupSocs: Record<string, string[]>;
  cookies: string;
  logUrl: string;
}

export const buildStationConfig = (input: BuildStationConfigInput): AppConfig => {
  const current = input.catalog.find(({ id }) => id === input.currentSocId);
  if (!current) throw new Error("SOC hiện tại không còn tồn tại trong LIST SOC.");
  const external = getExternalSocs(input.catalog, current.id);
  const groups = validateGroupSocs(input.groupSocs, external);
  return {
    ...input.previousConfig,
    soc: current.stationName,
    soc_id: current.id,
    soc_code: current.stationCode,
    number_prefix: current.numberPrefix,
    cookies: input.cookies.trim(),
    hubs: input.hubs.map(({ stationName }) => stationName),
    hub_ids: Object.fromEntries(input.hubs.map((hub) => [hub.stationName, hub.id])),
    hub_codes: Object.fromEntries(input.hubs.map((hub) => [hub.stationName, hub.stationCode])),
    socs: external.map(({ stationName }) => stationName),
    soc_ids: Object.fromEntries(external.map((soc) => [soc.stationName, soc.id])),
    soc_codes: Object.fromEntries(external.map((soc) => [soc.stationName, soc.stationCode])),
    group_socs: groups,
    raw_group_socs_text: undefined,
    ggsheet_log_url: input.logUrl.trim(),
  };
};
```

`findConfiguredSocId` nhận `Pick<Partial<AppConfig>, "soc" | "soc_id" | "soc_code">`, so sánh ID exact, code/tên sau trim và lowercase tiếng Việt. `reconcileGroupSocs` nhận `unknown` để an toàn cho JSON cũ/import và lọc phần tử lỗi. `validateGroupSocs` nhận `Record<string, string[]>`, ném lỗi nếu key/member không thuộc external, sau đó chuẩn hóa representative/trùng. Cả hai output phải deterministic theo thứ tự catalog, không dựa vào thứ tự object nhập.

- [ ] **Step 6: Chạy test helper và xác nhận Settings cũ vẫn build được**

Run: `node --experimental-strip-types --test tests/stations.test.ts tests/config.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS vì hai file legacy vẫn được giữ cho tới commit refactor Settings ở Task 5.

- [ ] **Step 7: Commit helper/config**

```bash
git add src/utils/config.ts src/utils/stationConfiguration.ts tests/stations.test.ts
git commit -m "feat: derive local station config from catalog"
```

### Task 4: Station selector and Group SOC editor

**Files:**
- Create: `src/components/StationSelect.tsx`
- Create: `src/components/SocGroupEditor.tsx`
- Modify: `tests/config.test.ts`

**Interfaces:**
- Consumes: `StationCatalogSoc[]`, normalized `Record<string, string[]>`, `SearchableSelect`.
- Produces: `StationSelect` dùng SOC ID làm value; `SocGroupEditor` phát group map mới qua `onChange`.

- [ ] **Step 1: Thêm source-contract test cho hai component**

Trong `tests/config.test.ts`, đọc source hai file và xác nhận các contract dễ regression:

```ts
test("station configuration uses searchable selectors and accessible group actions", async () => {
  const stationSelect = await readFile(new URL("../src/components/StationSelect.tsx", import.meta.url), "utf8");
  const groupEditor = await readFile(new URL("../src/components/SocGroupEditor.tsx", import.meta.url), "utf8");
  assert.match(stationSelect, /SearchableSelect/);
  assert.match(stationSelect, /stationCode/);
  assert.match(groupEditor, /SOC đại diện/);
  assert.match(groupEditor, /SOC thành viên/);
  assert.match(groupEditor, /aria-label=.*Xóa/i);
});
```

- [ ] **Step 2: Chạy test để xác nhận đang fail**

Run: `node --experimental-strip-types --test tests/config.test.ts`

Expected: FAIL vì component chưa tồn tại.

- [ ] **Step 3: Cài đặt StationSelect**

`StationSelect` map mỗi SOC thành label duy nhất `Tên · Mã` rồi map label về ID; như vậy `SearchableSelect` hiện có tìm được cả tên và mã mà không cần đổi API chung:

```ts
interface StationSelectProps {
  value: string;
  options: readonly StationCatalogSoc[];
  onChange: (socId: string) => void;
  placeholder: string;
  disabled?: boolean;
  ariaLabel: string;
}

const stationLabel = (soc: StationCatalogSoc) =>
  `${soc.stationName} · ${soc.stationCode}`;
```

Memoize `labels`, `labelToId` và selected label. Nếu value không tồn tại trong options, hiển thị placeholder thay vì label stale.

- [ ] **Step 4: Cài đặt SocGroupEditor**

Props:

```ts
interface SocGroupEditorProps {
  options: readonly StationCatalogSoc[];
  groups: Record<string, string[]>;
  onChange: (groups: Record<string, string[]>) => void;
  disabled?: boolean;
}
```

Editor giữ local `representativeId`, `memberId` và `memberNames`. Khi chọn representative đã có nhóm, nạp các thành viên ngoài representative; nút thêm member từ `StationSelect`; chips có nút `aria-label={`Xóa ${name} khỏi nhóm`}`; lưu phát object mới với `[representativeName, ...memberNames]`; xóa group phát object không còn key; hủy reset draft. Không cho chọn representative làm member, không cho thêm trùng, và sắp member theo thứ tự `options` để output ổn định.

Danh sách nhóm đã lưu hiển thị representative, số thành viên, chips và hai nút `Sửa`, `Xóa`. Dùng `min-h-11`, `touch-manipulation`, `flex-wrap`, `break-words`; không dùng horizontal scrolling.

- [ ] **Step 5: Chạy test và lint hai component**

Run: `node --experimental-strip-types --test tests/config.test.ts`

Expected: PASS.

Run: `npx eslint src/components/StationSelect.tsx src/components/SocGroupEditor.tsx`

Expected: exit 0.

- [ ] **Step 6: Commit UI components**

```bash
git add src/components/StationSelect.tsx src/components/SocGroupEditor.tsx tests/config.test.ts
git commit -m "feat: add SOC catalog selectors"
```

### Task 5: Refactor SettingsPage to use the sheet catalog

**Files:**
- Rewrite: `src/pages/SettingsPage.tsx`
- Modify: `tests/config.test.ts`
- Delete: `src/config/defaultStationConfig.ts`
- Delete: `src/utils/stations.ts`

**Interfaces:**
- Consumes: loaders Task 2, builder/reconcile helpers Task 3, selectors Task 4, existing `getConfigs`, `saveConfigs`, `clearCookies`.
- Produces: Settings UI với trạng thái catalog/hubs, draft import, preview và atomic save.

- [ ] **Step 1: Viết source-contract test thất bại cho Settings mới**

Mở rộng test Settings trong `tests/config.test.ts`:

```ts
assert.match(source, /loadStationCatalog/);
assert.match(source, /loadStationHubs/);
assert.match(source, /StationSelect/);
assert.match(source, /SocGroupEditor/);
assert.match(source, /Thử lại/);
assert.match(source, /Dữ liệu đã nạp/);
assert.match(source, /Đang tải Hub/);
assert.doesNotMatch(source, /DEFAULT_STATION_CONFIG/);
assert.doesNotMatch(source, /Tên \| ID/);
assert.doesNotMatch(source, /Tải mẫu/);
assert.doesNotMatch(source, /saveConfigs\(imported\)/);
```

- [ ] **Step 2: Chạy test để xác nhận đang fail**

Run: `node --experimental-strip-types --test tests/config.test.ts`

Expected: FAIL ở contract UI mới.

- [ ] **Step 3: Thay state nhập tay bằng state catalog/draft**

Dùng union status để TypeScript buộc xử lý các trạng thái:

```ts
type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

const [catalogState, setCatalogState] = useState<LoadState>({ status: "loading" });
const [catalog, setCatalog] = useState<StationCatalogSoc[]>([]);
const [selectedSocId, setSelectedSocId] = useState("");
const [hubState, setHubState] = useState<LoadState>({ status: "loading" });
const [hubs, setHubs] = useState<StationCatalogHub[]>([]);
const [groupSocs, setGroupSocs] = useState<Record<string, string[]>>({});
const [retryToken, setRetryToken] = useState(0);

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : "Không thể tải dữ liệu LIST SOC.";
```

Catalog effect gọi `loadStationCatalog()`, đối chiếu `initialConfig` bằng `findConfiguredSocId`, rồi lọc group bằng `reconcileGroupSocs`. Failure giữ local nguyên vẹn, lưu message và không chọn fallback hardcoded.

- [ ] **Step 4: Thêm effect tải Hub có chống response cũ**

```ts
const hubRequestRef = useRef(0);

useEffect(() => {
  const requestId = ++hubRequestRef.current;
  if (!selectedSocId) {
    setHubs([]);
    setHubState({ status: "error", message: "Hãy chọn SOC hiện tại." });
    return;
  }
  setHubState({ status: "loading" });
  loadStationHubs(selectedSocId).then(
    (nextHubs) => {
      if (requestId !== hubRequestRef.current) return;
      setHubs(nextHubs);
      setHubState({ status: "ready" });
    },
    (error) => {
      if (requestId !== hubRequestRef.current) return;
      setHubs([]);
      setHubState({ status: "error", message: getErrorMessage(error) });
    },
  );
}, [selectedSocId, hubRetryToken]);
```

Khi `selectedSocId` đổi, reconcile lại group với external mới. Nếu key/member bị loại, set `groupAdjustmentMessage` và hiển thị một alert cảnh báo cố định cạnh Group SOC cho tới khi lưu hoặc đặt lại; không chỉ dùng toast dễ biến mất. Nút retry catalog tăng `retryToken`; retry Hub tăng `hubRetryToken`.

- [ ] **Step 5: Cài đặt save nguyên khối và import vào draft**

`handleSave` chỉ chạy khi catalog/hub đều `ready` và selected SOC tồn tại:

```ts
const nextConfig = buildStationConfig({
  previousConfig: getConfigs(),
  catalog,
  currentSocId: selectedSocId,
  hubs,
  groupSocs,
  cookies,
  logUrl,
});
saveConfigs(nextConfig);
```

Import JSON phải parse object rồi:

- tìm SOC qua `findConfiguredSocId(importedConfig, catalog)`;
- set Cookie/URL vào draft nếu đúng kiểu string;
- reconcile `importedConfig.group_socs` với external của SOC import;
- set selected SOC để effect tải lại Hub từ sheet;
- không gọi `saveConfigs` trong handler import;
- báo lỗi nếu catalog chưa ready hoặc SOC import không tồn tại.

Export tiếp tục đọc `getConfigs()`. Reset xóa `configs`, làm rỗng SOC/cookie/group/URL nhưng giữ catalog đã tải để người dùng chọn lại. Xóa Cookie giữ hành vi tức thời hiện tại.

- [ ] **Step 6: Cài đặt loading/error/preview và bỏ manual UI**

Thứ tự surface:

1. `SOC hiện tại` với `StationSelect`, trạng thái tải và nút `Thử lại`;
2. summary tên/mã/ID/prefix/số Hub sau khi Hub ready;
3. Cookie + xóa Cookie;
4. URL Log;
5. scanner read-only;
6. `Dữ liệu đã nạp` bằng `<details>` chứa Hub nội tỉnh và SOC ngoại tỉnh read-only;
7. `SocGroupEditor` chỉ khi catalog ready và có current SOC.

Nút `Lưu Cài Đặt` dùng:

```tsx
disabled={catalogState.status !== "ready" || hubState.status !== "ready" || !selectedSocId}
```

Cập nhật title/description, numbering và toast sang dữ liệu sheet. Bỏ imports/icons/state/handlers của textareas và sample.

Sau khi `SettingsPage` không còn import legacy, xóa `src/utils/stations.ts` và `src/config/defaultStationConfig.ts`, rồi xác nhận:

Run: `rg -n "defaultStationConfig|parseStationLine|parseStationLines|formatStationEntry|validateUniqueStations|createStationIdMap" src tests`

Expected: không có output.

- [ ] **Step 7: Chạy targeted tests, lint và build**

Run: `node --experimental-strip-types --test tests/stationCatalog.test.ts tests/stations.test.ts tests/config.test.ts`

Expected: PASS.

Run: `npx eslint src/pages/SettingsPage.tsx src/components/StationSelect.tsx src/components/SocGroupEditor.tsx src/utils/stationCatalog.ts src/utils/stationConfiguration.ts src/utils/config.ts`

Expected: exit 0.

Run: `npm run build`

Expected: TypeScript và Vite build thành công; không copy output sang `gas/index.html`.

- [ ] **Step 8: Commit Settings refactor**

```bash
git add src/pages/SettingsPage.tsx tests/config.test.ts
git rm src/utils/stations.ts src/config/defaultStationConfig.ts
git commit -m "feat: configure SOCs from LIST SOC sheet"
```

### Task 6: Full regression and scope verification

**Files:**
- Modify only if a test exposes a defect: files already owned by Tasks 1–5.
- Do not modify: `src/layouts/MobileLayout.tsx`, `src/pages/HomePage.tsx`, `gas/index.html`.

**Interfaces:**
- Consumes: completed station configuration flow.
- Produces: verified feature with documented baseline exceptions and clean feature commits.

- [ ] **Step 1: Xác nhận không còn manual/default station source**

Run: `rg -n "DEFAULT_STATION_CONFIG|defaultStationConfig|Tên \\| ID|Tải mẫu|raw_group_socs_text" src tests`

Expected: chỉ `raw_group_socs_text` legacy type/cleanup được phép còn; các chuỗi/import manual khác không có output.

- [ ] **Step 2: Chạy toàn bộ test suite**

Run: `npm test`

Expected: mọi test mới và regression feature PASS. Nếu chỉ hai assertion đã biết trong `tests/gasAccessControl.test.ts` fail vì `allowed: true`, ghi rõ là baseline; không đổi access-control ngoài phạm vi.

- [ ] **Step 3: Chạy lint và production build**

Run: `npm run lint`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0; Vite tạo bundle production thành công.

- [ ] **Step 4: Kiểm tra diff và artifact deploy**

Run: `git diff --check`

Expected: không có whitespace error.

Run: `git status --short`

Expected: `gas/index.html` không đổi; hai thay đổi người dùng có sẵn ở `src/layouts/MobileLayout.tsx` và `src/pages/HomePage.tsx` vẫn không được stage/commit bởi feature.

Run: `git log --oneline -6`

Expected: có các commit riêng cho GAS, bridge, config builder, selectors và Settings.

- [ ] **Step 5: Commit duy nhất nếu regression buộc sửa**

Chỉ khi Step 2–3 phát hiện defect trong file thuộc phạm vi, stage đúng file đã sửa và commit:

```bash
git add gas/code.gs package.json tests/stationCatalogGas.test.ts tests/stationCatalog.test.ts tests/stations.test.ts tests/config.test.ts src/utils/stationCatalog.ts src/utils/stationConfiguration.ts src/utils/config.ts src/components/StationSelect.tsx src/components/SocGroupEditor.tsx src/pages/SettingsPage.tsx
git commit -m "fix: harden LIST SOC configuration flow"
```

Nếu không có defect, không tạo empty commit.
