import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type CatalogRow = [string, string, string, string, string];

type HarnessOptions = {
  rows?: CatalogRow[];
  missingSheet?: boolean;
};

const toPlain = (value: unknown) => JSON.parse(JSON.stringify(value));

async function createStationCatalogHarness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../gas/code.gs", import.meta.url), "utf8");
  const rows = options.rows ?? [];
  const requestedRanges: number[][] = [];

  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: (...args: number[]) => {
      requestedRanges.push(args);
      const [row, column, rowCount = 1, columnCount = 1] = args;
      return {
        getDisplayValues: () =>
          rows
            .slice(row - 2, row - 2 + rowCount)
            .map((sourceRow) => sourceRow.slice(column - 1, column - 1 + columnCount)),
        getDisplayValue: () => rows[row - 2]?.[column - 1] ?? "",
      };
    },
  };

  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => {
          if (name !== "LIST SOC" || options.missingSheet) return null;
          return sheet;
        },
      }),
    },
    console: { error() {} },
    JSON,
  });

  vm.runInContext(source, context);
  return { context, getRequestedRanges: () => requestedRanges };
}

const validRows: CatalogRow[] = [
  [
    "BD A Mega SOC",
    "63SOCBD1",
    "2490",
    "63",
    "Hub A | 63A01 | 3954<br>Hub B | 63A02 | 5409",
  ],
  ["HN SOC", "20SOCHN", "6", "20", "Hub HN | 20HN01 | 100"],
];

test("returns only LIST SOC columns A-D for the catalog", async () => {
  const harness = await createStationCatalogHarness({ rows: validRows });

  assert.deepEqual(toPlain(harness.context.getStationCatalog()), [
    {
      stationName: "BD A Mega SOC",
      stationCode: "63SOCBD1",
      id: "2490",
      numberPrefix: "63",
    },
    {
      stationName: "HN SOC",
      stationCode: "20SOCHN",
      id: "6",
      numberPrefix: "20",
    },
  ]);
  assert.deepEqual(harness.getRequestedRanges(), [[2, 1, 2, 4]]);
});

test("loads and parses only the selected SOC hub cell", async () => {
  const harness = await createStationCatalogHarness({ rows: validRows });

  assert.deepEqual(toPlain(harness.context.getStationHubs("2490")), [
    { stationName: "Hub A", stationCode: "63A01", id: "3954" },
    { stationName: "Hub B", stationCode: "63A02", id: "5409" },
  ]);
  assert.ok(
    harness
      .getRequestedRanges()
      .some(([row, column]) => row === 2 && column === 5),
  );
  assert.ok(
    !harness
      .getRequestedRanges()
      .some(([row, column]) => row === 3 && column === 5),
  );
});

test("accepts Windows and Unix newlines in the selected hub cell", async () => {
  const harness = await createStationCatalogHarness({
    rows: [[
      "BD A Mega SOC",
      "63SOCBD1",
      "2490",
      "63",
      "Hub A | 63A01 | 3954\r\nHub B | 63A02 | 5409\nHub C | 63A03 | 5410",
    ]],
  });

  assert.equal(toPlain(harness.context.getStationHubs("2490")).length, 3);
});

test("rejects missing, empty, and incomplete LIST SOC data", async () => {
  const missing = await createStationCatalogHarness({ missingSheet: true });
  const empty = await createStationCatalogHarness({ rows: [] });
  const incomplete = await createStationCatalogHarness({
    rows: [["BD A Mega SOC", "", "2490", "63", ""]],
  });

  assert.throws(() => missing.context.getStationCatalog(), /LIST SOC/);
  assert.throws(() => empty.context.getStationCatalog(), /chưa có dữ liệu/i);
  assert.throws(
    () => incomplete.context.getStationCatalog(),
    /thiếu station_name, station_code hoặc id/,
  );
});

test("rejects duplicate SOC names, codes, and ids", async () => {
  const duplicateName = await createStationCatalogHarness({
    rows: [validRows[0], ["bd a mega soc", "OTHER", "7", "63", ""]],
  });
  const duplicateCode = await createStationCatalogHarness({
    rows: [validRows[0], ["Other SOC", "63socbd1", "7", "63", ""]],
  });
  const duplicateId = await createStationCatalogHarness({
    rows: [validRows[0], ["Other SOC", "OTHER", "2490", "63", ""]],
  });

  assert.throws(() => duplicateName.context.getStationCatalog(), /station_name bị trùng/);
  assert.throws(() => duplicateCode.context.getStationCatalog(), /station_code bị trùng/);
  assert.throws(() => duplicateId.context.getStationCatalog(), /id SOC bị trùng/);
});

test("rejects missing SOC ids and malformed or duplicate hubs", async () => {
  const valid = await createStationCatalogHarness({ rows: validRows });
  const malformed = await createStationCatalogHarness({
    rows: [["BD A Mega SOC", "63SOCBD1", "2490", "63", "Hub A | 3954"]],
  });
  const duplicate = await createStationCatalogHarness({
    rows: [[
      "BD A Mega SOC",
      "63SOCBD1",
      "2490",
      "63",
      "Hub A | 63A01 | 3954\nHub B | 63A01 | 5409",
    ]],
  });

  assert.throws(() => valid.context.getStationHubs("missing"), /không tồn tại/);
  assert.throws(() => malformed.context.getStationHubs("2490"), /dòng Hub 1/);
  assert.throws(() => duplicate.context.getStationHubs("2490"), /bị trùng/);
});
