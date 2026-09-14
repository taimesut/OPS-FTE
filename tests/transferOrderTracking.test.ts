import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseTransferOrderTrackingResponse } from "../src/utils/transferOrderTracking.ts";

test("flattens nested tracking events and sorts newest first", () => {
  const events = parseTransferOrderTrackingResponse({
    retcode: 0,
    data: {
      tracking_list: [
        {
          status: 10,
          timestamp: 100,
          status_name: "Đã nhận hàng",
          station_name: "SOC A",
          children: [
            {
              status: 20,
              timestamp: 300,
              description: "Đã rời SOC",
              location_name: "SOC B",
            },
          ],
          event_children: [
            {
              status: 15,
              timestamp: "200",
              event_name: "Đang trung chuyển",
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(
    events.map(({ status, timestamp, title, location }) => ({
      status,
      timestamp,
      title,
      location,
    })),
    [
      {
        status: "20",
        timestamp: 300,
        title: "Đã rời SOC",
        location: "SOC B",
      },
      {
        status: "15",
        timestamp: 200,
        title: "Đang trung chuyển",
        location: "",
      },
      {
        status: "10",
        timestamp: 100,
        title: "Đã nhận hàng",
        location: "SOC A",
      },
    ],
  );
});

test("falls back to status code and rejects empty tracking", () => {
  const [event] = parseTransferOrderTrackingResponse({
    retcode: 0,
    data: { tracking_list: [{ status: 882, timestamp: 123 }] },
  });
  assert.equal(event.title, "Trạng thái 882");
  assert.equal(event.status, "882");

  assert.throws(
    () =>
      parseTransferOrderTrackingResponse({
        retcode: 0,
        data: { tracking_list: [] },
      }),
    /chưa có dữ liệu tracking/i,
  );
});

test("propagates SPX tracking API errors", () => {
  assert.throws(
    () =>
      parseTransferOrderTrackingResponse({
        retcode: 1001,
        message: "Không có quyền xem tracking",
      }),
    /Không có quyền xem tracking/,
  );
});

test("wires TO detail to first shipment tracking and renders modal actions", async () => {
  const [apiSource, tableSource, modalSource] = await Promise.all([
    readFile(
      new URL("../src/utils/transferOrderTrackingApi.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/components/TOTable.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/TrackingModal.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(apiSource, /buildTransferOrderDetailPath\(normalizedToNumber\)/);
  assert.match(apiSource, /parseFirstFleetOrderId\(detailResponse\.data\)/);
  assert.match(apiSource, /buildShipmentTrackingPath\(shipmentId\)/);
  assert.match(apiSource, /parseTransferOrderTrackingResponse\(trackingResponse\.data\)/);

  assert.match(tableSource, /fetchTransferOrderTracking\(item\.to_number\)/);
  assert.match(tableSource, /onViewTracking/);
  assert.match(tableSource, />\s*Tracking\s*</);
  assert.match(tableSource, /<TrackingModal/);

  assert.match(modalSource, /Đơn đại diện đầu tiên trong bao/);
  assert.match(modalSource, /Đang lấy đơn đầu tiên trong bao/);
  assert.match(modalSource, /Thử lại/);
});
