import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TRANSFER_ORDER_COLUMNS,
  matchesTransferOrderSearch,
  parseTransferOrderColumns,
  serializeTransferOrderColumns,
  TRANSFER_ORDER_COLUMNS,
} from "../src/utils/transferOrderTable.ts";

const order = {
  to_number: "TO-001",
  operator: "Nguyen Van A",
  sender: "Pleiku SOC",
  receiver: "44-GLI Chu Se Hub",
  pack_name: "BAG-001",
};

test("defines Sender and one classification column in default order", () => {
  const keys = TRANSFER_ORDER_COLUMNS.map(({ key }) => key);
  assert.deepEqual(keys.slice(0, 6), [
    "to_number",
    "operator",
    "classification",
    "sender",
    "route",
    "pack_name",
  ]);
  assert.ok(DEFAULT_TRANSFER_ORDER_COLUMNS.includes("sender"));
  assert.ok(DEFAULT_TRANSFER_ORDER_COLUMNS.includes("classification"));
  assert.ok(!keys.some((key: string) => key === "high_value"));
  assert.ok(!keys.some((key: string) => key === "dg_type"));
});

test("migrates legacy column arrays once", () => {
  assert.deepEqual(
    parseTransferOrderColumns(
      JSON.stringify(["to_number", "high_value", "dg_type", "route", "action"]),
    ),
    ["to_number", "classification", "sender", "route", "action"],
  );
});

test("respects hidden Sender in version 2 preferences", () => {
  assert.deepEqual(
    parseTransferOrderColumns(
      JSON.stringify({ version: 2, columns: ["to_number", "route", "action"] }),
    ),
    ["to_number", "route", "action"],
  );
});

test("falls back safely for malformed preferences", () => {
  assert.deepEqual(
    parseTransferOrderColumns("not-json"),
    DEFAULT_TRANSFER_ORDER_COLUMNS,
  );
  assert.deepEqual(
    parseTransferOrderColumns(JSON.stringify({ version: 99, columns: [] })),
    DEFAULT_TRANSFER_ORDER_COLUMNS,
  );
});

test("serializes version 2 preferences", () => {
  assert.equal(
    serializeTransferOrderColumns(["to_number", "sender"]),
    JSON.stringify({ version: 2, columns: ["to_number", "sender"] }),
  );
});

test("matches quick search by Sender", () => {
  assert.equal(matchesTransferOrderSearch(order, "pleiku"), true);
  assert.equal(matchesTransferOrderSearch(order, "chu se"), true);
  assert.equal(matchesTransferOrderSearch(order, "missing"), false);
});
