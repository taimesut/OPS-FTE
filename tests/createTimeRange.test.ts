import assert from "node:assert/strict";
import test from "node:test";
import {
  createCreateTimeRange,
  createDefaultCreateTimeRangeInput,
} from "../src/utils/createTimeRange.ts";

test("default create time range covers the previous seven days", () => {
  const now = new Date(2026, 8, 14, 4, 50, 35, 0);

  assert.deepEqual(createDefaultCreateTimeRangeInput(now), {
    fromLocalDateTime: "2026-09-07T04:50",
    toLocalDateTime: "2026-09-14T04:50",
  });
});

test("create time range converts local inputs to the ctime query format", () => {
  const range = createCreateTimeRange(
    "2026-09-10T08:15",
    "2026-09-14T10:30",
  );

  const expectedFrom = Math.floor(
    new Date(2026, 8, 10, 8, 15, 0, 0).getTime() / 1000,
  );
  const expectedTo = Math.floor(
    new Date(2026, 8, 14, 10, 30, 59, 0).getTime() / 1000,
  );

  assert.equal(range.fromTimestamp, expectedFrom);
  assert.equal(range.toTimestamp, expectedTo);
  assert.equal(range.ctime, `${expectedFrom},${expectedTo}`);
});

test("create time range rejects an inverted range", () => {
  assert.throws(
    () =>
      createCreateTimeRange(
        "2026-09-14T10:31",
        "2026-09-14T10:30",
      ),
    /bắt đầu phải nhỏ hơn hoặc bằng thời gian kết thúc/,
  );
});

test("create time range requires both date-time values", () => {
  assert.throws(
    () => createCreateTimeRange("", "2026-09-14T10:30"),
    /chọn đầy đủ thời gian bắt đầu và kết thúc/,
  );
});
