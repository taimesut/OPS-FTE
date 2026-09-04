import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildShipmentTrackingPath,
  buildTransferOrderDetailPath,
  filterTransferOrdersByCot,
  parseFirstFleetOrderId,
  parseLatestStatus882Timestamp,
} from "../src/utils/transferOrderCot.ts";

test("builds encoded SPX detail and tracking paths", () => {
  assert.equal(
    buildTransferOrderDetailPath("TO 01/A"),
    "/api/in-station/general_to/detail/search?to_number=TO%2001%2FA&pageno=1&count=10",
  );
  assert.equal(
    buildShipmentTrackingPath("SPXVN 01"),
    "/api/fleet_order/order/detail/tracking_info?shipment_id=SPXVN%2001",
  );
});

test("reads the first representative shipment from a successful detail response", () => {
  assert.equal(
    parseFirstFleetOrderId({
      retcode: 0,
      data: {
        list: [
          { fleet_order_id: " SPXVN001 " },
          { fleet_order_id: "SPXVN002" },
        ],
      },
    }),
    "SPXVN001",
  );
  assert.throws(
    () => parseFirstFleetOrderId({ retcode: 0, data: { list: [] } }),
    /đơn đại diện/i,
  );
});

test("selects the latest 882 timestamp across roots, children, and event children", () => {
  assert.equal(
    parseLatestStatus882Timestamp({
      retcode: 0,
      data: {
        tracking_list: [
          { status: 882, timestamp: 100, children: [] },
          {
            status: 8,
            timestamp: 200,
            children: [{ status: 882, timestamp: 300 }],
            event_children: [{ status: 882, timestamp: 250 }],
          },
        ],
      },
    }),
    300,
  );
  assert.throws(
    () =>
      parseLatestStatus882Timestamp({
        retcode: 0,
        data: { tracking_list: [] },
      }),
    /882/i,
  );
});

test("wires TO detail -> first shipment -> tracking -> final 882 pipeline", async () => {
  const source = await readFile(
    new URL("../src/utils/transferOrderCotApi.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /buildTransferOrderDetailPath\(toNumber\)/);
  assert.match(source, /parseFirstFleetOrderId\(detailResponse\.data\)/);
  assert.match(source, /buildShipmentTrackingPath\(shipmentId\)/);
  assert.match(source, /parseLatestStatus882Timestamp\(trackingResponse\.data\)/);
});

test("retains only timestamps at or before COT in original order", async () => {
  const orders = [{ to_number: "A" }, { to_number: "B" }, { to_number: "C" }];
  const timestamps: Record<string, number> = { A: 101, B: 100, C: 99 };
  const progress: string[] = [];
  const result = await filterTransferOrdersByCot(
    orders,
    100,
    async (toNumber) => timestamps[toNumber],
    (processed, total) => progress.push(`${processed}/${total}`),
  );
  assert.deepEqual(result, [orders[1], orders[2]]);
  assert.equal(progress.at(-1), "3/3");
});

test("never exceeds five concurrent pipelines and preserves input order", async () => {
  const orders = Array.from({ length: 12 }, (_, index) => ({
    to_number: `TO-${index}`,
  }));
  let active = 0;
  let maximumActive = 0;
  const result = await filterTransferOrdersByCot(
    orders,
    100,
    async (toNumber) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const index = Number(toNumber.split("-")[1]);
      await new Promise((resolve) => setTimeout(resolve, (12 - index) % 4));
      active -= 1;
      return index % 2 === 0 ? 100 : 101;
    },
  );
  assert.ok(maximumActive <= 5);
  assert.deepEqual(
    result.map(({ to_number }) => to_number),
    ["TO-0", "TO-2", "TO-4", "TO-6", "TO-8", "TO-10"],
  );
});

test("fails the whole cutoff pass with TO context", async () => {
  await assert.rejects(
    filterTransferOrdersByCot(
      [{ to_number: "TO-OK" }, { to_number: "TO-FAIL" }],
      100,
      async (toNumber) => {
        if (toNumber === "TO-FAIL") throw new Error("Mất kết nối");
        return 90;
      },
    ),
    /TO-FAIL.*Mất kết nối/i,
  );
});
