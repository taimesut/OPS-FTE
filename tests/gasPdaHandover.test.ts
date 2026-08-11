import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type Row = unknown[];

class MemorySheet {
  name: string;
  rows: Row[];
  failNextWrite = false;

  constructor(name: string, rows: Row[] = []) {
    this.name = name;
    this.rows = rows.map((row) => [...row]);
  }

  getLastRow() { return this.rows.length; }
  getDataRange() { return { getValues: () => this.rows.map((row) => [...row]) }; }
  appendRow(row: Row) { this.rows.push([...row]); return this; }
  getRange(row: number, column: number, rowCount = 1, columnCount = 1) {
    const range = {
      getValues: () => {
        return Array.from({ length: rowCount }, (_, rowOffset) =>
          Array.from({ length: columnCount }, (_, columnOffset) =>
            this.rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ""));
      },
      getDisplayValues: () => {
        return range.getValues().map((values) => values.map((value) => String(value ?? "")));
      },
      setValues: (values: Row[]) => {
        if (this.failNextWrite) { this.failNextWrite = false; throw new Error("sheet write failed"); }
        values.forEach((valuesRow, rowOffset) => {
          const targetRow = row - 1 + rowOffset;
          this.rows[targetRow] ||= [];
          valuesRow.forEach((value, columnOffset) => { this.rows[targetRow][column - 1 + columnOffset] = value; });
        });
        return range;
      },
      setValue: (value: unknown) => range.setValues([[value]]),
    };
    return range;
  }
}

type HarnessOptions = {
  email?: string;
  catalog?: Row[];
  allowedEmails?: string[];
  now?: string;
};

async function createPdaHarness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../gas/code.gs", import.meta.url), "utf8");
  let activeEmail = options.email ?? "owner@spxexpress.com";
  let uuid = 0;
  let fileId = 0;
  const now = options.now ?? "2026-08-11T02:03:04.000Z";
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(value?: string | number | Date) { super(value === undefined ? now : value); }
    static now() { return new RealDate(now).valueOf(); }
  }
  const sheets = new Map<string, MemorySheet>();
  sheets.set("account", new MemorySheet("account", [
    ["Email"],
    ...(options.allowedEmails ?? ["owner@spxexpress.com", "second@spxexpress.com"]).map((email) => [email]),
  ]));
  if (options.catalog !== undefined) {
    sheets.set("PDA_DanhMuc", new MemorySheet("PDA_DanhMuc", [
      ["Tên PDA", "Mã key", "Hoạt động"],
      ...options.catalog,
    ]));
  }

  const files = new Map<string, { id: string; name: string; trashed: boolean; url: string; shared: boolean }>();
  const folder = {
    createFile(blob: { name: string }) {
      const id = `file-${++fileId}`;
      const state = { id, name: blob.name, trashed: false, url: `https://drive.google.com/file/d/${id}/view`, shared: false };
      files.set(id, state);
      return {
        getId: () => id,
        getUrl: () => state.url,
        setSharing: () => { state.shared = true; return this; },
        setTrashed: (value: boolean) => { state.trashed = value; },
      };
    },
  };
  let folderExists = false;
  let lockDepth = 0;
  const spreadsheet = {
    getSheetByName: (name: string) => sheets.get(name) ?? null,
    insertSheet(name: string) { const sheet = new MemorySheet(name); sheets.set(name, sheet); return sheet; },
    getActiveSheet: () => sheets.values().next().value,
  };

  const context = vm.createContext({
    Date: FakeDate,
    Session: { getActiveUser: () => ({ getEmail: () => activeEmail }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    Utilities: {
      getUuid: () => `session-${++uuid}`,
      formatDate: (date: Date, _timezone: string, pattern: string) =>
        pattern === "yyyy-MM-dd" ? new RealDate(date).toISOString().slice(0, 10) : new RealDate(date).toISOString(),
      base64Decode: (value: string) => [...Buffer.from(value, "base64")],
      newBlob: (bytes: number[], mime: string, name: string) => ({ bytes, mime, name }),
    },
    LockService: { getScriptLock: () => ({
      waitLock: () => { lockDepth += 1; },
      releaseLock: () => { lockDepth -= 1; },
    }) },
    DriveApp: {
      Access: { DOMAIN_WITH_LINK: "DOMAIN_WITH_LINK" },
      Permission: { VIEW: "VIEW" },
      getFoldersByName: () => ({ hasNext: () => folderExists, next: () => folder }),
      createFolder: () => { folderExists = true; return folder; },
      getFileById: (id: string) => ({ setTrashed: (value: boolean) => { const file = files.get(id); if (file) file.trashed = value; } }),
    },
    HtmlService: {
      createHtmlOutput: (content: string) => ({ content, setTitle() { return this; }, addMetaTag() { return this; } }),
      createHtmlOutputFromFile: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }),
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    },
    ContentService: { createTextOutput: () => ({ setMimeType() { return this; } }), MimeType: { JSON: "JSON" } },
    console: { error() {} },
    JSON,
  });
  vm.runInContext(source, context);
  return {
    context,
    sheets,
    files,
    as(email: string) { activeEmail = email; return context; },
    lockDepth: () => lockDepth,
  };
}

const catalog: Row[] = [
  ["PDA01", "PDA01SECRET", true],
  ["PDA02", "PDA02SECRET", false],
  ["PDA03", "PDA03SECRET", "TRUE"],
];

test("creates/restores a draft snapshot and never exposes secrets", async () => {
  const harness = await createPdaHarness({ catalog });
  const first = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  const second = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  assert.equal(second.sessionId, first.sessionId);
  assert.deepEqual(JSON.parse(JSON.stringify(first.items.map((item: { pdaName: string }) => item.pdaName))), ["PDA01", "PDA03"]);
  assert.doesNotMatch(JSON.stringify(first), /SECRET/);
  assert.equal(harness.lockDepth(), 0);
  assert.deepEqual(harness.sheets.get("PDA_PhienBanGiao")?.rows[0], ["session_id", "handover_date", "shift", "status", "created_by", "created_at", "submitted_by", "submitted_at", "required_count", "completed_count"]);
});

test("rejects invalid bootstrap inputs and invalid catalogs", async () => {
  const harness = await createPdaHarness({ catalog });
  assert.throws(() => harness.context.getPdaHandoverBootstrap("2026-08-12", "06:00-15:00"), /tương lai/);
  assert.throws(() => harness.context.getPdaHandoverBootstrap("2026-08-11", "bad"), /làm việc/);
  const empty = await createPdaHarness({ catalog: [] });
  assert.throws(() => empty.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00"), /PDA hoạt động/);
  const duplicate = await createPdaHarness({ catalog: [["PDA01", "ONE", true], ["PDA01", "TWO", true]] });
  assert.throws(() => duplicate.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00"), /trùng tên/);
});

test("requires an authorized account for every public PDA operation", async () => {
  const harness = await createPdaHarness({ email: "blocked@example.com", catalog });
  assert.throws(() => harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00"), /quyền/);
  assert.throws(() => harness.context.validatePdaQr("x", "key"), /quyền/);
  assert.throws(() => harness.context.uploadPdaEvidence("x", "PDA01", "data:image/jpeg;base64,QQ=="), /quyền/);
  assert.throws(() => harness.context.submitPdaHandover("x"), /quyền/);
});

test("validates QR on the server and preserves a completed scan timestamp", async () => {
  const harness = await createPdaHarness({ catalog });
  const session = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  assert.throws(() => harness.context.validatePdaQr(session.sessionId, "WRONG"), /không hợp lệ/);
  const scanned = harness.context.validatePdaQr(session.sessionId, "  PDA01SECRET  ");
  assert.equal(scanned.pdaName, "PDA01");
  assert.equal(scanned.scanAt, "2026-08-11T02:03:04.000Z");
  assert.doesNotMatch(JSON.stringify(scanned), /SECRET/);
  const completed = harness.context.uploadPdaEvidence(session.sessionId, "PDA01", "data:image/jpeg;base64,QQ==");
  assert.equal(completed.completed, true);
  assert.equal(harness.context.validatePdaQr(session.sessionId, "PDA01SECRET").scanAt, scanned.scanAt);
});

test("ignores an inactive duplicate secret outside the session snapshot", async () => {
  const harness = await createPdaHarness({
    catalog: [
      ["PDA_OLD", "PDA01SECRET", false],
      ["PDA01", "PDA01SECRET", true],
    ],
  });
  const session = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  const scanned = harness.context.validatePdaQr(session.sessionId, "PDA01SECRET");
  assert.equal(scanned.pdaName, "PDA01");
  assert.equal(scanned.scanAt, "2026-08-11T02:03:04.000Z");
});

test("uploads evidence, replaces the old Drive file, and updates progress", async () => {
  const harness = await createPdaHarness({ catalog });
  const session = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  assert.throws(() => harness.context.uploadPdaEvidence(session.sessionId, "PDA01", "data:image/jpeg;base64,QQ=="), /quét/);
  harness.context.validatePdaQr(session.sessionId, "PDA01SECRET");
  const first = harness.context.uploadPdaEvidence(session.sessionId, "PDA01", "data:image/jpeg;base64,QQ==");
  assert.deepEqual(JSON.parse(JSON.stringify(first)), {
    pdaName: "PDA01", scanAt: "2026-08-11T02:03:04.000Z", photoAt: "2026-08-11T02:03:04.000Z",
    photoUrl: "https://drive.google.com/file/d/file-1/view", completed: true,
  });
  const second = harness.context.uploadPdaEvidence(session.sessionId, "PDA01", "data:image/png;base64,Qg==");
  assert.match(second.photoUrl, /file-2/);
  assert.equal(harness.files.get("file-1")?.trashed, true);
  assert.equal(harness.sheets.get("PDA_PhienBanGiao")?.rows[1][9], 1);
  assert.throws(() => harness.context.uploadPdaEvidence(session.sessionId, "PDA01", "data:text/plain;base64,QQ=="), /JPEG hoặc PNG/);
});

test("rolls back a newly uploaded file when the Sheet update fails", async () => {
  const harness = await createPdaHarness({ catalog });
  const session = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  harness.context.validatePdaQr(session.sessionId, "PDA01SECRET");
  harness.context.uploadPdaEvidence(session.sessionId, "PDA01", "data:image/jpeg;base64,QQ==");
  harness.sheets.get("PDA_ChiTietBanGiao")!.failNextWrite = true;
  assert.throws(() => harness.context.uploadPdaEvidence(session.sessionId, "PDA01", "data:image/jpeg;base64,Qg=="), /sheet write failed/);
  assert.equal(harness.files.get("file-1")?.trashed, false);
  assert.equal(harness.files.get("file-2")?.trashed, true);
});

test("submits only complete snapshots and blocks duplicate date/shift", async () => {
  const harness = await createPdaHarness({ catalog });
  const first = harness.context.getPdaHandoverBootstrap("2026-08-11", "13:00-22:00");
  assert.throws(() => harness.context.submitPdaHandover(first.sessionId), /chưa hoàn tất/);
  for (const [name, secret] of [["PDA01", "PDA01SECRET"], ["PDA03", "PDA03SECRET"]]) {
    harness.context.validatePdaQr(first.sessionId, secret);
    harness.context.uploadPdaEvidence(first.sessionId, name, "data:image/jpeg;base64,QQ==");
  }
  const submitted = harness.context.submitPdaHandover(first.sessionId);
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(submitted.submittedBy, "owner@spxexpress.com");
  assert.equal(submitted.completedCount, 2);
  assert.throws(() => harness.context.validatePdaQr(first.sessionId, "PDA01SECRET"), /nháp/);

  const second = harness.as("second@spxexpress.com").getPdaHandoverBootstrap("2026-08-11", "13:00-22:00");
  assert.equal(second.status, "SUBMITTED");
  assert.equal(second.sessionId, first.sessionId);
});

test("allows only one of two owners' completed drafts to be submitted", async () => {
  const harness = await createPdaHarness({ catalog });
  const first = harness.context.getPdaHandoverBootstrap("2026-08-11", "22:00-06:00");
  const second = harness.as("second@spxexpress.com").getPdaHandoverBootstrap("2026-08-11", "22:00-06:00");
  for (const [name, secret] of [["PDA01", "PDA01SECRET"], ["PDA03", "PDA03SECRET"]]) {
    harness.context.validatePdaQr(second.sessionId, secret);
    harness.context.uploadPdaEvidence(second.sessionId, name, "data:image/jpeg;base64,QQ==");
  }
  harness.as("owner@spxexpress.com");
  for (const [name, secret] of [["PDA01", "PDA01SECRET"], ["PDA03", "PDA03SECRET"]]) {
    harness.context.validatePdaQr(first.sessionId, secret);
    harness.context.uploadPdaEvidence(first.sessionId, name, "data:image/jpeg;base64,QQ==");
  }
  assert.equal(harness.context.submitPdaHandover(first.sessionId).status, "SUBMITTED");
  harness.as("second@spxexpress.com");
  assert.throws(() => harness.context.submitPdaHandover(second.sessionId), /đã được bàn giao/);
  const submittedRows = harness.sheets.get("PDA_PhienBanGiao")!.rows.slice(1)
    .filter((row) => row[1] === "2026-08-11" && row[2] === "22:00-06:00" && row[3] === "SUBMITTED");
  assert.equal(submittedRows.length, 1);
  assert.equal(harness.lockDepth(), 0);
});
