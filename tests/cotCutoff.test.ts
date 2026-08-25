import assert from "node:assert/strict";
import test from "node:test";
import {
  createCotWindow,
  formatLocalDateTimeInput,
  isValidCotLocalDateTime,
  parseCotCutoffPreferences,
  parseCotLocalDateTime,
  serializeCotCutoffPreferences,
} from "../src/utils/cotCutoff.ts";

test("formats a local Date for datetime-local at minute precision", () => {
  assert.equal(
    formatLocalDateTimeInput(new Date(2026, 7, 25, 9, 7, 41)),
    "2026-08-25T09:07",
  );
});

test("parses only real local datetime-local values", () => {
  const parsed = parseCotLocalDateTime("2026-08-25T14:30");
  assert.deepEqual(
    [
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      parsed.getHours(),
      parsed.getMinutes(),
    ],
    [2026, 7, 25, 14, 30],
  );
  assert.equal(isValidCotLocalDateTime("2026-02-29T10:00"), false);
  assert.equal(isValidCotLocalDateTime(""), false);
  assert.throws(() => parseCotLocalDateTime("not-a-date"), /COT không hợp lệ/i);
});

test("creates an inclusive Unix range one clamped calendar month back", () => {
  const window = createCotWindow("2026-03-31T10:15");
  const expectedFrom = Math.floor(new Date(2026, 1, 28, 10, 15).getTime() / 1000);
  const expectedCot = Math.floor(new Date(2026, 2, 31, 10, 15).getTime() / 1000);
  assert.deepEqual(window, {
    cotTimestamp: expectedCot,
    currentStationReceivedTime: `${expectedFrom},${expectedCot}`,
  });
});

test("round-trips versioned COT preferences", () => {
  const preferences = { enabled: true, localDateTime: "2026-08-25T09:30" };
  assert.deepEqual(
    parseCotCutoffPreferences(serializeCotCutoffPreferences(preferences)),
    preferences,
  );
});

test("falls back safely for missing, malformed, or future preferences", () => {
  const fallback = { enabled: false, localDateTime: "" };
  assert.deepEqual(parseCotCutoffPreferences(null), fallback);
  assert.deepEqual(parseCotCutoffPreferences("not-json"), fallback);
  assert.deepEqual(
    parseCotCutoffPreferences(JSON.stringify({ version: 99, enabled: true })),
    fallback,
  );
  assert.deepEqual(
    parseCotCutoffPreferences(
      JSON.stringify({ version: 1, enabled: true, localDateTime: "invalid" }),
    ),
    fallback,
  );
});
