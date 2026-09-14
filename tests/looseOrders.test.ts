import assert from "node:assert/strict";
import test from "node:test";
import {
  createLooseOrderPayload,
  createLooseOrderSummary,
  LOOSE_ORDER_CATEGORIES,
  LOOSE_ORDER_SEARCH_PATH,
  readLooseOrderTotal,
  type LooseOrderCategory,
} from "../src/utils/looseOrders.ts";
import {
  fetchLooseOrderSummary,
  type LooseOrderApiDependency,
} from "../src/utils/looseOrdersApi.ts";

const EXPECTED_FILTERS: Record<
  LooseOrderCategory,
  { high_value: 0 | 1; order_dg_type: 1 | 4 }
> = {
  normal: { high_value: 0, order_dg_type: 1 },
  dg: { high_value: 0, order_dg_type: 4 },
  gtc: { high_value: 1, order_dg_type: 1 },
  dgAndGtc: { high_value: 1, order_dg_type: 4 },
};

test("builds the four loose-order request contracts from configured route IDs", () => {
  assert.equal(
    LOOSE_ORDER_SEARCH_PATH,
    "/api/fleet_order/order/tracking_list/search",
  );
  assert.deepEqual(LOOSE_ORDER_CATEGORIES, [
    "normal",
    "dg",
    "gtc",
    "dgAndGtc",
  ]);

  for (const category of LOOSE_ORDER_CATEGORIES) {
    assert.deepEqual(
      createLooseOrderPayload(
        "5001",
        ["6001", "6002", "6001"],
        category,
      ),
      {
        count: 24,
        current_station_ids: "5001",
        next_station_ids: "6001,6002",
        order_status: "8",
        page_no: 1,
        ...EXPECTED_FILTERS[category],
      },
    );
  }
});

test("rejects a loose-order route with missing IDs", () => {
  assert.throws(
    () => createLooseOrderPayload("", ["6001"], "normal"),
    /nguồn.*ID/i,
  );
  assert.throws(
    () => createLooseOrderPayload("5001", [], "normal"),
    /đích.*ID/i,
  );
});

test("adds the selected station-received range to every category only when supplied", () => {
  assert.deepEqual(
    createLooseOrderPayload(
      "5001",
      ["6001"],
      "dgAndGtc",
      "1785000000,1787677199",
    ),
    {
      count: 24,
      current_station_ids: "5001",
      next_station_ids: "6001",
      order_status: "8",
      page_no: 1,
      high_value: 1,
      order_dg_type: 4,
      current_station_received_time: "1785000000,1787677199",
    },
  );
  assert.equal(
    "current_station_received_time" in
      createLooseOrderPayload("5001", ["6001"], "normal"),
    false,
  );
});

test("rejects malformed or reversed station-received ranges", () => {
  assert.throws(
    () => createLooseOrderPayload("5001", ["6001"], "normal", "bad-range"),
    /thời gian nhận/i,
  );
  assert.throws(
    () => createLooseOrderPayload("5001", ["6001"], "normal", "200,100"),
    /thời gian nhận/i,
  );
});

test("reads only a finite non-negative API data.total", () => {
  assert.equal(
    readLooseOrderTotal({
      retcode: 0,
      data: { total: 8, list: [{ dg_type: 4, high_value: 1 }] },
    }),
    8,
  );

  for (const payload of [
    null,
    { retcode: 0 },
    { retcode: 0, data: {} },
    { retcode: 0, data: { total: "8" } },
    { retcode: 0, data: { total: -1 } },
    { retcode: 0, data: { total: Number.NaN } },
  ]) {
    assert.throws(() => readLooseOrderTotal(payload), /không hợp lệ/i);
  }
});

test("preserves an API error message", () => {
  assert.throws(
    () =>
      readLooseOrderTotal({
        retcode: 1001,
        message: "Không có quyền",
      }),
    /Không có quyền/,
  );
});

test("creates all category metrics and calculates total loose orders", () => {
  assert.deepEqual(
    createLooseOrderSummary({ normal: 7, dg: 3, gtc: 2, dgAndGtc: 1 }),
    {
      total: 13,
      normalCount: 7,
      dgCount: 3,
      highValueCount: 2,
      dgAndHighValueCount: 1,
    },
  );
});

test("posts all four category requests concurrently and summarizes their totals", async () => {
  const totalsByFilter: Record<string, number> = {
    "0:1": 7,
    "0:4": 3,
    "1:1": 2,
    "1:4": 1,
  };
  const calls: unknown[][] = [];
  let active = 0;
  let maximumActive = 0;
  const dependency: LooseOrderApiDependency = {
    post: async (...args) => {
      calls.push(args);
      const payload = args[1];
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      const key = `${payload.high_value}:${payload.order_dg_type}`;
      return {
        data: { retcode: 0, data: { total: totalsByFilter[key] } },
      };
    },
  };

  const summary = await fetchLooseOrderSummary(
    "5001",
    ["6001", "6002"],
    "1785000000,1787677199",
    dependency,
  );

  assert.equal(maximumActive, 4);
  assert.deepEqual(summary, {
    total: 13,
    normalCount: 7,
    dgCount: 3,
    highValueCount: 2,
    dgAndHighValueCount: 1,
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls.map(([path, payload, options]) => ({ path, payload, options })),
    LOOSE_ORDER_CATEGORIES.map((category) => ({
      path: LOOSE_ORDER_SEARCH_PATH,
      payload: createLooseOrderPayload(
        "5001",
        ["6001", "6002"],
        category,
        "1785000000,1787677199",
      ),
      options: { suppressErrorToast: true },
    })),
  );
});

test("rejects the complete check when one category response is invalid", async () => {
  const dependency: LooseOrderApiDependency = {
    post: async (_path, payload) => ({
      data:
        payload.order_dg_type === 4 && payload.high_value === 1
          ? { retcode: 0, data: {} }
          : { retcode: 0, data: { total: 2 } },
    }),
  };

  await assert.rejects(
    fetchLooseOrderSummary("5001", ["6001"], undefined, dependency),
    /không hợp lệ/i,
  );
});
