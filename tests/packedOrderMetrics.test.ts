import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPackedOrder,
  isDgType,
  summarizePackedOrders,
} from "../src/utils/packedOrderMetrics.ts";

test("recognizes DG when any type differs from NON DG", () => {
  assert.equal(isDgType(undefined), false);
  assert.equal(isDgType([]), false);
  assert.equal(isDgType([1]), false);
  assert.equal(isDgType([2]), true);
  assert.equal(isDgType([1, 3]), true);
});

test("classifies every packed TO into one exclusive category", () => {
  assert.equal(classifyPackedOrder({ dg_type: [1], high_value: 2 }), "normal");
  assert.equal(classifyPackedOrder({ dg_type: [2], high_value: 2 }), "dg");
  assert.equal(classifyPackedOrder({ dg_type: [1], high_value: 1 }), "gtc");
  assert.equal(
    classifyPackedOrder({ dg_type: [1, 3], high_value: 1 }),
    "dg_and_gtc",
  );
});

test("counts packed categories without double counting", () => {
  assert.deepEqual(
    summarizePackedOrders([
      { quantity: 3, dg_type: [], high_value: 2 },
      { quantity: 4, dg_type: [1], high_value: 1 },
      { quantity: 5, dg_type: [2], high_value: 2 },
      { quantity: 6, dg_type: [1, 3], high_value: 1 },
    ]),
    {
      totalQuantity: 18,
      dgBagCount: 1,
      gtcBagCount: 1,
      dgAndGtcBagCount: 1,
    },
  );
});

test("returns zero totals for an empty list", () => {
  assert.deepEqual(summarizePackedOrders([]), {
    totalQuantity: 0,
    dgBagCount: 0,
    gtcBagCount: 0,
    dgAndGtcBagCount: 0,
  });
});

test("treats missing quantity and DG data as zero and NON DG", () => {
  assert.deepEqual(
    summarizePackedOrders([
      { quantity: undefined, dg_type: undefined, high_value: 1 },
      { quantity: 0, dg_type: [1], high_value: 0 },
    ]),
    {
      totalQuantity: 0,
      dgBagCount: 0,
      gtcBagCount: 1,
      dgAndGtcBagCount: 0,
    },
  );
});
