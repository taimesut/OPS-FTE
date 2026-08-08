import assert from "node:assert/strict";
import test from "node:test";
import {
  createLooseOrderPayload,
  LOOSE_ORDER_SEARCH_PATH,
  summarizeLooseOrderResponse,
} from "../src/utils/looseOrders.ts";

test("builds the loose-order request contract from configured route IDs", () => {
  assert.equal(
    LOOSE_ORDER_SEARCH_PATH,
    "/api/fleet_order/order/tracking_list/search",
  );
  assert.deepEqual(createLooseOrderPayload("5001", ["6001", "6002", "6001"]), {
    count: 1000,
    current_station_ids: "5001",
    next_station_ids: "6001,6002",
    order_status: "8",
    page_no: 1,
  });
});

test("rejects a loose-order route with missing IDs", () => {
  assert.throws(() => createLooseOrderPayload("", ["6001"]), /nguồn.*ID/i);
  assert.throws(() => createLooseOrderPayload("5001", []), /đích.*ID/i);
});

test("uses API total and counts DG and high-value flags independently", () => {
  assert.deepEqual(
    summarizeLooseOrderResponse({
      retcode: 0,
      data: {
        total: 8,
        list: [
          { dg_type: 1, high_value: 0 },
          { dg_type: 0, high_value: 2 },
          { dg_type: 3, high_value: 4 },
          { dg_type: 0, high_value: 0 },
          {},
        ],
      },
    }),
    { total: 8, dgCount: 2, highValueCount: 2 },
  );
});

test("normalizes a missing list and falls back to list length for invalid total", () => {
  assert.deepEqual(
    summarizeLooseOrderResponse({ retcode: 0, data: { total: 3 } }),
    { total: 3, dgCount: 0, highValueCount: 0 },
  );
  assert.deepEqual(
    summarizeLooseOrderResponse({
      retcode: 0,
      data: { total: "2", list: [{ dg_type: 2 }] },
    }),
    { total: 1, dgCount: 1, highValueCount: 0 },
  );
});

test("rejects non-success and malformed API responses", () => {
  assert.throws(
    () =>
      summarizeLooseOrderResponse({
        retcode: 1001,
        message: "Không có quyền",
      }),
    /Không có quyền/,
  );
  assert.throws(() => summarizeLooseOrderResponse(null), /không hợp lệ/i);
});
