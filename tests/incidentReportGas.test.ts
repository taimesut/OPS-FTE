import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const HEADERS = [
  "LH TRIP",
  "Đơn sự vụ",
  "Thời gian nhận",
  "SOC",
  "Trip ID",
  "Trip Name",
  "Trip Date",
  "Trip Type",
  "Vehicle Plate",
  "Vehicle Type",
  "Driver",
  "Helper",
  "Agency",
  "Seal",
  "Expected Quantity",
  "Payload JSON",
];

const payload = {
  schemaVersion: 1,
  lhTrip: "LT0Q944WOQG72",
  incidentLogs: "SPXVN001@Rách + Thiếu",
  soc: "Pleiku SOC",
  createdAt: "2026-09-05T11:00:00.000Z",
  trip: {
    id: 296766439,
    tripNumber: "LT0Q944WOQG72",
    tripName: "Trip name",
    tripDate: 1788454800,
    tripTypeName: "By Land",
    tripSource: 0,
    costType: 1,
    driverName: "Driver",
    secondDriverName: "",
    vehicleNumber: "29E-259.57",
    vehicleTypeName: "Truck_8T60m3",
    agencyName: "Agency",
    sealCodes: ["S1"],
    remark: "",
    operator: "operator",
    expectedQuantity: 68,
  },
  incidents: [{ code: "SPXVN001", reasons: ["Rách", "Thiếu"] }],
};

async function gasSources() {
  const [code, incident] = await Promise.all([
    readFile(new URL("../gas/code.gs", import.meta.url), "utf8"),
    readFile(new URL("../gas/incident-report.gs", import.meta.url), "utf8"),
  ]);
  return `${code}\n${incident}`;
}

function outputService() {
  return {
    MimeType: { JSON: "JSON" },
    createTextOutput: (content: string) => ({
      content,
      setMimeType() {
        return this;
      },
    }),
  };
}

async function createPostHarness(existingRows: unknown[][] = []) {
  const rows = existingRows.map((row) => [...row]);
  let createdSheet = false;
  let activeSheetRead = false;
  let lockDepth = 0;

  const range = (
    row: number,
    column: number,
    numRows = 1,
    numColumns = 1,
  ) => ({
    getValues: () =>
      Array.from({ length: numRows }, (_, rowIndex) =>
        Array.from(
          { length: numColumns },
          (_, columnIndex) =>
            rows[row - 1 + rowIndex]?.[column - 1 + columnIndex] ?? "",
        ),
      ),
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
    getSheetByName: (name: string) =>
      name === "LogSutVu" && (createdSheet || rows.length > 0) ? sheet : null,
    insertSheet: (name: string) => {
      assert.equal(name, "LogSutVu");
      createdSheet = true;
      return sheet;
    },
    getActiveSheet: () => {
      activeSheetRead = true;
      return sheet;
    },
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: {
      getDocumentLock: () => ({
        waitLock: () => {
          lockDepth += 1;
        },
        releaseLock: () => {
          lockDepth -= 1;
        },
      }),
    },
    ContentService: outputService(),
    JSON,
    Date,
    console: { error() {} },
  });
  vm.runInContext(await gasSources(), context);
  return {
    context,
    rows,
    wasActiveSheetRead: () => activeSheetRead,
    lockDepth: () => lockDepth,
  };
}

test("doPost creates LogSutVu, writes A:P and never reads the active sheet", async () => {
  const harness = await createPostHarness();
  const output = harness.context.doPost({
    postData: { contents: JSON.stringify(payload) },
  });
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

test("doPost extends a two-column header without changing legacy rows", async () => {
  const legacy = [
    ["LH TRIP", "Đơn sự vụ"],
    ["LT-OLD", "SPX-OLD@Thiếu"],
  ];
  const harness = await createPostHarness(legacy);
  harness.context.doPost({ postData: { contents: JSON.stringify(payload) } });
  assert.deepEqual(harness.rows[0], HEADERS);
  assert.deepEqual(harness.rows[1].slice(0, 2), legacy[1]);
  assert.equal(harness.rows[2][0], payload.lhTrip);
});

test("doPost still accepts the legacy two-field payload", async () => {
  const harness = await createPostHarness();
  const legacyPayload = {
    lhTrip: "LT-OLD",
    incidentLogs: "SPX-OLD@Thiếu",
  };
  const output = harness.context.doPost({
    postData: { contents: JSON.stringify(legacyPayload) },
  });
  assert.equal(JSON.parse(output.content).status, "success");
  assert.deepEqual(harness.rows[1].slice(0, 2), [
    legacyPayload.lhTrip,
    legacyPayload.incidentLogs,
  ]);
  assert.equal(harness.rows[1][15], "");
});

test("doPost rejects malformed data without appending", async () => {
  const invalidBodies = [
    "not-json",
    JSON.stringify({ ...payload, lhTrip: "" }),
    JSON.stringify({ ...payload, createdAt: "not-a-date" }),
    JSON.stringify({
      ...payload,
      trip: { ...payload.trip, tripDate: "1788454800" },
    }),
    JSON.stringify({
      ...payload,
      incidents: [{ code: "SPX", reasons: ["Sai"] }],
    }),
  ];
  for (const body of invalidBodies) {
    const harness = await createPostHarness([["LH TRIP", "Đơn sự vụ"]]);
    const output = harness.context.doPost({ postData: { contents: body } });
    assert.equal(JSON.parse(output.content).status, "error");
    assert.equal(harness.rows.length, 1);
    assert.equal(harness.lockDepth(), 0);
  }
});

const columnNumber = (letters: string) =>
  [...letters].reduce(
    (result, letter) => result * 26 + letter.charCodeAt(0) - 64,
    0,
  );

const parseA1 = (notation: string) => {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(notation);
  if (!match) throw new Error(`Unsupported A1 notation: ${notation}`);
  const row = Number(match[2]);
  const column = columnNumber(match[1]);
  const endRow = Number(match[4] ?? match[2]);
  const endColumn = columnNumber(match[3] ?? match[1]);
  return {
    row,
    column,
    numRows: endRow - row + 1,
    numColumns: endColumn - column + 1,
  };
};

async function createEditHarness(logRows: unknown[][]) {
  let cells = new Map<string, unknown>();
  const properties = new Map<string, string>();
  const inserted: Array<[number, number]> = [];
  const deleted: Array<[number, number]> = [];
  const toasts: string[] = [];
  let writes = 0;
  let lockDepth = 0;

  const key = (row: number, column: number) => `${row}:${column}`;
  const valueAt = (row: number, column: number) =>
    cells.get(key(row, column)) ?? "";
  const setAt = (row: number, column: number, value: unknown) => {
    cells.set(key(row, column), value);
  };

  const shiftRows = (position: number, count: number, remove: boolean) => {
    const next = new Map<string, unknown>();
    for (const [cellKey, value] of cells) {
      const [rowText, columnText] = cellKey.split(":");
      const row = Number(rowText);
      const column = Number(columnText);
      if (remove && row >= position && row < position + count) continue;
      const nextRow = remove
        ? row >= position + count
          ? row - count
          : row
        : row >= position
          ? row + count
          : row;
      next.set(key(nextRow, column), value);
    }
    cells = next;
  };

  type SheetLike = {
    getName(): string;
    getParent(): typeof spreadsheet;
  };

  const createRange = (
    sheet: SheetLike,
    notation: string,
    row: number,
    column: number,
    numRows: number,
    numColumns: number,
  ) => {
    const range = {
      getA1Notation: () => notation,
      getNumRows: () => numRows,
      getNumColumns: () => numColumns,
      getSheet: () => sheet,
      getDisplayValue: () => String(valueAt(row, column)),
      getDisplayValues: () =>
        Array.from({ length: numRows }, (_, rowIndex) =>
          Array.from({ length: numColumns }, (_, columnIndex) =>
            String(valueAt(row + rowIndex, column + columnIndex)),
          ),
        ),
      getValues: () =>
        Array.from({ length: numRows }, (_, rowIndex) =>
          Array.from({ length: numColumns }, (_, columnIndex) =>
            valueAt(row + rowIndex, column + columnIndex),
          ),
        ),
      setValue: (value: unknown) => {
        writes += 1;
        setAt(row, column, value);
        return range;
      },
      setValues: (values: unknown[][]) => {
        writes += 1;
        values.forEach((valuesRow, rowIndex) =>
          valuesRow.forEach((value, columnIndex) =>
            setAt(row + rowIndex, column + columnIndex, value),
          ),
        );
        return range;
      },
      clearContent: () => {
        writes += 1;
        for (let rowIndex = 0; rowIndex < numRows; rowIndex += 1) {
          for (let columnIndex = 0; columnIndex < numColumns; columnIndex += 1) {
            setAt(row + rowIndex, column + columnIndex, "");
          }
        }
        return range;
      },
      copyTo: () => range,
    };
    return range;
  };

  const getReportRange = (
    sheet: SheetLike,
    rowOrA1: number | string,
    column?: number,
    numRows = 1,
    numColumns = 1,
  ) => {
    if (typeof rowOrA1 === "string") {
      const parsed = parseA1(rowOrA1);
      return createRange(
        sheet,
        rowOrA1,
        parsed.row,
        parsed.column,
        parsed.numRows,
        parsed.numColumns,
      );
    }
    return createRange(
      sheet,
      `${rowOrA1}:${column}`,
      rowOrA1,
      column ?? 1,
      numRows,
      numColumns,
    );
  };

  const reportSheet = {
    getName: () => "Biên bản sự vụ",
    getSheetId: () => 42,
    getParent: () => spreadsheet,
    getLastRow: () => 157,
    getRange(
      rowOrA1: number | string,
      column?: number,
      numRows = 1,
      numColumns = 1,
    ) {
      return getReportRange(
        reportSheet,
        rowOrA1,
        column,
        numRows,
        numColumns,
      );
    },
    getRangeList(notations: string[]) {
      return {
        clearContent() {
          notations.forEach((notation) =>
            reportSheet.getRange(notation).clearContent(),
          );
        },
      };
    },
    insertRowsBefore(position: number, count: number) {
      inserted.push([position, count]);
      shiftRows(position, count, false);
    },
    deleteRows(position: number, count: number) {
      deleted.push([position, count]);
      shiftRows(position, count, true);
    },
  };

  const logSheet = {
    getLastRow: () => logRows.length,
    getRange: (
      row: number,
      column: number,
      numRows = 1,
      numColumns = 1,
    ) => ({
      getValues: () =>
        Array.from({ length: numRows }, (_, rowIndex) =>
          Array.from(
            { length: numColumns },
            (_, columnIndex) =>
              logRows[row - 1 + rowIndex]?.[column - 1 + columnIndex] ?? "",
          ),
        ),
    }),
  };

  const spreadsheet = {
    getSheetByName: (name: string) =>
      name === "LogSutVu"
        ? logSheet
        : name === "Biên bản sự vụ"
          ? reportSheet
          : null,
    toast: (message: string) => {
      toasts.push(message);
    },
  };

  const documentProperties = {
    getProperty: (propertyKey: string) => properties.get(propertyKey) ?? null,
    setProperty: (propertyKey: string, value: string) => {
      properties.set(propertyKey, value);
    },
    deleteProperty: (propertyKey: string) => {
      properties.delete(propertyKey);
    },
  };

  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      CopyPasteType: { PASTE_FORMAT: "PASTE_FORMAT" },
    },
    LockService: {
      getDocumentLock: () => ({
        waitLock: () => {
          lockDepth += 1;
        },
        releaseLock: () => {
          lockDepth -= 1;
        },
      }),
    },
    PropertiesService: {
      getDocumentProperties: () => documentProperties,
    },
    ContentService: outputService(),
    JSON,
    Date,
    console: { error() {} },
  });
  vm.runInContext(await gasSources(), context);

  const sheetForName = (name: string) => {
    if (name === "Biên bản sự vụ") return reportSheet;
    return {
      getName: () => name,
      getParent: () => spreadsheet,
    };
  };

  return {
    context,
    setReportCell(notation: string, value: unknown) {
      const parsed = parseA1(notation);
      setAt(parsed.row, parsed.column, value);
    },
    getReportCell(notation: string) {
      const parsed = parseA1(notation);
      return valueAt(parsed.row, parsed.column);
    },
    editEvent(sheetName: string, notation: string) {
      const sheet = sheetForName(sheetName);
      const parsed = parseA1(notation);
      return {
        range: createRange(
          sheet,
          notation,
          parsed.row,
          parsed.column,
          parsed.numRows,
          parsed.numColumns,
        ),
      };
    },
    insertCalls: () => inserted,
    deleteCalls: () => deleted,
    lastToast: () => toasts.at(-1) ?? "",
    writeCount: () => writes,
    lockDepth: () => lockDepth,
  };
}

test("L3 loads the newest structured log and maps trip fields", async () => {
  const harness = await createEditHarness([
    HEADERS,
    [
      payload.lhTrip,
      payload.incidentLogs,
      new Date(1),
      "Old SOC",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      JSON.stringify({ ...payload, soc: "Old SOC" }),
    ],
    [
      payload.lhTrip,
      payload.incidentLogs,
      new Date(2),
      payload.soc,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      JSON.stringify(payload),
    ],
  ]);
  harness.setReportCell("L3", payload.lhTrip.toLowerCase());
  harness.context.handleIncidentReportEdit_(
    harness.editEvent("Biên bản sự vụ", "L3"),
  );
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
  assert.equal(harness.lockDepth(), 0);
});

test("onEdit ignores every location except a single report L3 cell", async () => {
  const harness = await createEditHarness([HEADERS]);
  for (const event of [
    harness.editEvent("Other", "L3"),
    harness.editEvent("Biên bản sự vụ", "L4"),
    harness.editEvent("Biên bản sự vụ", "L3:M3"),
  ]) {
    harness.context.onEdit(event);
  }
  assert.equal(harness.writeCount(), 0);
});

test("legacy log fills incident rows and reports missing trip detail", async () => {
  const harness = await createEditHarness([
    ["LH TRIP", "Đơn sự vụ"],
    ["LT-OLD", "SPX-1@Thiếu + Dư#TO-2@Khác"],
  ]);
  harness.setReportCell("L3", "LT-OLD");
  harness.context.handleIncidentReportEdit_(
    harness.editEvent("Biên bản sự vụ", "L3"),
  );
  assert.equal(harness.getReportCell("B21"), "SPX-1");
  assert.equal(harness.getReportCell("F21"), "X");
  assert.equal(harness.getReportCell("H21"), "X");
  assert.equal(harness.getReportCell("B22"), "TO-2");
  assert.equal(harness.getReportCell("I22"), "X");
  assert.match(harness.lastToast(), /log cũ/i);
});

test("more than 30 incidents inserts then replaces previous overflow", async () => {
  const many = {
    ...payload,
    incidentLogs: Array.from(
      { length: 35 },
      (_, index) => `SPX-${index + 1}@Thiếu`,
    ).join("#"),
    incidents: Array.from({ length: 35 }, (_, index) => ({
      code: `SPX-${index + 1}`,
      reasons: ["Thiếu"],
    })),
  };
  const harness = await createEditHarness([
    HEADERS,
    [
      many.lhTrip,
      many.incidentLogs,
      new Date(),
      many.soc,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      JSON.stringify(many),
    ],
  ]);
  harness.setReportCell("L3", many.lhTrip);
  const event = harness.editEvent("Biên bản sự vụ", "L3");
  harness.context.handleIncidentReportEdit_(event);
  assert.deepEqual(harness.insertCalls(), [[51, 5]]);
  assert.equal(harness.getReportCell("B55"), "SPX-35");
  harness.context.handleIncidentReportEdit_(event);
  assert.deepEqual(harness.deleteCalls(), [[51, 5]]);
  assert.deepEqual(harness.insertCalls(), [
    [51, 5],
    [51, 5],
  ]);
  assert.equal(harness.getReportCell("B55"), "SPX-35");
});

test("blank or unknown L3 clears managed output without stale incidents", async () => {
  const harness = await createEditHarness([HEADERS]);
  harness.setReportCell("B21", "STALE");
  harness.setReportCell("L5", "STALE TRIP");
  harness.setReportCell("L3", "LT-NOT-FOUND");
  harness.context.handleIncidentReportEdit_(
    harness.editEvent("Biên bản sự vụ", "L3"),
  );
  assert.equal(harness.getReportCell("B21"), "");
  assert.equal(harness.getReportCell("L5"), "");
  assert.match(harness.lastToast(), /Không tìm thấy log/);
});
