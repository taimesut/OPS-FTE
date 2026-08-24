import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  loadAppVersionInfo,
  normalizeAppVersionInfo,
  type AppVersionRunner,
} from "../src/utils/appVersion.ts";

const createRunner = (outcome: unknown | Error): AppVersionRunner => {
  let successHandler: (value: unknown) => void = () => {};
  let failureHandler: () => void = () => {};

  return {
    withSuccessHandler(handler) {
      successHandler = handler;
      return this;
    },
    withFailureHandler(handler) {
      failureHandler = handler;
      return this;
    },
    getAppVersionInfo() {
      if (outcome instanceof Error) failureHandler();
      else successHandler(outcome);
    },
  };
};

test("normalizes valid VERSION data", () => {
  assert.deepEqual(
    normalizeAppVersionInfo({
      version: " 1.2.3 ",
      updateContent: " Sửa lỗi\nThêm tính năng ",
    }),
    { version: "1.2.3", updateContent: "Sửa lỗi\nThêm tính năng" },
  );
});

test("rejects empty and malformed VERSION data", () => {
  assert.equal(normalizeAppVersionInfo(null), null);
  assert.equal(normalizeAppVersionInfo({ version: "", updateContent: "" }), null);
  assert.equal(normalizeAppVersionInfo({ version: 123, updateContent: [] }), null);
});

test("loads VERSION data through the Apps Script runner", async () => {
  assert.deepEqual(
    await loadAppVersionInfo(
      createRunner({ version: "2.0", updateContent: "Bản mới" }),
    ),
    { version: "2.0", updateContent: "Bản mới" },
  );
});

test("falls back when Apps Script is unavailable or fails", async () => {
  assert.equal(await loadAppVersionInfo(null), null);
  assert.equal(await loadAppVersionInfo(createRunner(new Error("failed"))), null);
});

test("HomePage renders SeaTalk and VERSION states", async () => {
  const source = await readFile(
    new URL("../src/pages/HomePage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /https:\/\/link\.seatalk\.io\/profile\/open\?seatalk_id=1386905313/,
  );
  assert.match(source, /loadAppVersionInfo/);
  assert.match(source, /Đang tải thông tin phiên bản/);
  assert.match(source, /Chưa có thông tin phiên bản/);
  assert.match(source, /whitespace-pre-wrap/);
});
