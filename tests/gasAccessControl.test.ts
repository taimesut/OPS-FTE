import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type HarnessOptions = {
  email?: string;
  allowedEmails?: string[];
  missingSheet?: boolean;
  sheetError?: Error;
};

async function createHarness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../gas/code.gs", import.meta.url), "utf8");
  let outboundFetchCount = 0;

  const htmlOutput = (content: string) => ({
    content,
    title: "",
    setTitle(title: string) {
      this.title = title;
      return this;
    },
    addMetaTag() {
      return this;
    },
    setXFrameOptionsMode() {
      return this;
    },
  });

  const context = vm.createContext({
    Session: {
      getActiveUser: () => ({ getEmail: () => options.email ?? "" }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => {
          if (options.sheetError) throw options.sheetError;
          if (name === "account" && !options.missingSheet) {
            const values = options.allowedEmails ?? [];
            return {
              getLastRow: () => values.length + 1,
              getRange: () => ({
                getDisplayValues: () => values.map((value) => [value]),
              }),
            };
          }
          return null;
        },
      }),
    },
    HtmlService: {
      createHtmlOutputFromFile: (name: string) => htmlOutput(`FILE:${name}`),
      createHtmlOutput: (content: string) => htmlOutput(content),
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    },
    UrlFetchApp: {
      fetch: () => {
        outboundFetchCount += 1;
        throw new Error("Unexpected outbound request");
      },
    },
    ContentService: {
      createTextOutput: (content: string) => ({
        content,
        setMimeType() {
          return this;
        },
      }),
      MimeType: { JSON: "JSON" },
    },
    console: { error() {} },
    JSON,
  });

  vm.runInContext(source, context);
  return { context, getOutboundFetchCount: () => outboundFetchCount };
}

test("normalizes and exactly matches an allowlisted email", async () => {
  const { context } = await createHarness({
    email: "  User@SPXExpress.com ",
    allowedEmails: [" user@spxexpress.com "],
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(context.getCurrentUserAccess_())),
    { allowed: true, email: "user@spxexpress.com", reason: "AUTHORIZED" },
  );
  assert.equal(context.doGet().content, "FILE:index");
});

test("denies blank, absent, partial, missing-sheet, and read-error identities", async () => {
  const cases: HarnessOptions[] = [
    { email: "", allowedEmails: ["user@spxexpress.com"] },
    { email: "other@spxexpress.com", allowedEmails: ["user@spxexpress.com"] },
    { email: "user", allowedEmails: ["user@spxexpress.com"] },
    { email: "user@spxexpress.com", missingSheet: true },
    { email: "user@spxexpress.com", sheetError: new Error("sheet failure") },
  ];

  for (const item of cases) {
    const { context } = await createHarness(item);
    assert.equal(context.getCurrentUserAccess_().allowed, false);
    assert.match(context.doGet().content, /Không có quyền truy cập/);
  }
});

test("escapes the displayed identity and hides internal details", async () => {
  const { context } = await createHarness({
    email: "<img src=x onerror=alert(1)>",
    sheetError: new Error("SECRET_STACK_DETAIL"),
  });

  const html = context.doGet().content;
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /SECRET_STACK_DETAIL/);
});

test("blocks unauthorized proxy calls before UrlFetchApp", async () => {
  const harness = await createHarness({
    email: "blocked@spxexpress.com",
    allowedEmails: ["allowed@spxexpress.com"],
  });

  const result = harness.context.fetchShopeeApi("/api/test", "secret", "get");
  assert.equal(result.status, 403);
  assert.equal(harness.getOutboundFetchCount(), 0);
});

test("keeps the HTTP log endpoint available", async () => {
  const { context } = await createHarness();
  assert.equal(typeof context.doPost, "function");
});
