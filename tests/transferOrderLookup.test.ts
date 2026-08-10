import assert from "node:assert/strict";
import test from "node:test";
import {
  createTransferOrderLookupPayload,
  parseTransferOrderLookupResponse,
  TRANSFER_ORDER_LOOKUP_PATH,
} from "../src/utils/transferOrderLookup.ts";

test("builds the exact shipment lookup request", () => {
  assert.equal(
    TRANSFER_ORDER_LOOKUP_PATH,
    "/api/fleet_order/order/tracking_list/search",
  );
  assert.deepEqual(createTransferOrderLookupPayload(" SPXVN062072327098 "), {
    count: 24,
    page_no: 1,
    shipment_id: "SPXVN062072327098",
  });
  assert.throws(() => createTransferOrderLookupPayload("   "), /nhập mã đơn/i);
});

test("extracts current_to_number from the sample response", () => {
  assert.deepEqual(
    parseTransferOrderLookupResponse(
      {
        retcode: 0,
        data: {
          list: [
            {
              shipment_id: "SPXVN062072327098",
              current_to_number: "TO2026081015POF",
            },
          ],
        },
      },
      "SPXVN062072327098",
    ),
    {
      shipmentId: "SPXVN062072327098",
      currentToNumber: "TO2026081015POF",
    },
  );
});

test("selects the exact shipment from a multi-item response", () => {
  const result = parseTransferOrderLookupResponse(
    {
      retcode: 0,
      data: {
        list: [
          { shipment_id: "OTHER", current_to_number: "TO-OTHER" },
          { shipment_id: "TARGET", current_to_number: "TO-TARGET" },
        ],
      },
    },
    "TARGET",
  );
  assert.equal(result.currentToNumber, "TO-TARGET");
});

test("uses a sole response item when the API omits a matching shipment id", () => {
  const result = parseTransferOrderLookupResponse(
    {
      retcode: 0,
      data: { list: [{ current_to_number: "TO-SOLE" }] },
    },
    "REQUESTED",
  );
  assert.deepEqual(result, {
    shipmentId: "REQUESTED",
    currentToNumber: "TO-SOLE",
  });
});

test("rejects API errors, missing orders, mismatches, and missing TO numbers", () => {
  assert.throws(
    () =>
      parseTransferOrderLookupResponse(
        { retcode: 1001, message: "Hết phiên" },
        "A",
      ),
    /Hết phiên/,
  );
  assert.throws(
    () =>
      parseTransferOrderLookupResponse(
        { retcode: 0, data: { list: [] } },
        "A",
      ),
    /không tìm thấy đơn hàng/i,
  );
  assert.throws(
    () =>
      parseTransferOrderLookupResponse(
        {
          retcode: 0,
          data: {
            list: [
              { shipment_id: "B", current_to_number: "TO-B" },
              { shipment_id: "C", current_to_number: "TO-C" },
            ],
          },
        },
        "A",
      ),
    /không tìm thấy đơn hàng/i,
  );
  assert.throws(
    () =>
      parseTransferOrderLookupResponse(
        {
          retcode: 0,
          data: { list: [{ shipment_id: "A", current_to_number: "" }] },
        },
        "A",
      ),
    /chưa có mã TO/i,
  );
});
