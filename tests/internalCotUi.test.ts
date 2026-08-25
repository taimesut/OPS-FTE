import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("COT control exposes an accessible switch, local date-time input, and progress", async () => {
  const source = await readSource("../src/components/CotCutoffControl.tsx");
  assert.match(source, /Cắt COT/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /role="switch"/);
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /Đang kiểm tra toàn bộ dữ liệu/);
  assert.match(source, /Đang kiểm tra COT/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /min-h-11/);
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
