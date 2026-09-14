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

test("parses real SPX event_children, photos, operators and ignores empty wrappers", () => {
  const events = parseTransferOrderTrackingResponse({
    retcode: 0,
    message: "",
    data: {
      shipment_id: "SPXVN068123536919",
      tracking_list: [
        {
          id: 118585165,
          timestamp: 1789333609,
          status: 33,
          station_name: "Pleiku SOC",
          station_id: 1030,
          message: "Parcel packed into TO [TO20260913D8UXG]",
          operator: "spx@shopee.com",
          tags: ["Mass"],
          children: [],
          event_children: [],
        },
        {
          id: 0,
          timestamp: 1789283546,
          status: -2,
          station_name: "",
          message: "",
          operator: "",
          children: [],
          event_children: [
            {
              track_id: "1201031888",
              event_code: "INSTATION_UPDATE_ASM_PHOTO",
              track_time_ms: 1789283546000,
              track_time: 1789283546,
              station_id: 3983,
              photo_url: ["https://example.com/parcel.jpg"],
              operator: "CBSNC001VN3983/Unknown/Unknown",
              message: "Parcel photo is taken by the ASM.",
              display_name: "ASM_Photo",
            },
          ],
        },
      ],
    },
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].status, "33");
  assert.equal(events[0].location, "Pleiku SOC");
  assert.equal(events[0].stationId, "1030");
  assert.equal(events[0].operator, "spx@shopee.com");
  assert.deepEqual(events[0].tags, ["Mass"]);

  const asmPhoto = events[1];
  assert.equal(asmPhoto.status, "");
  assert.equal(asmPhoto.source, "event");
  assert.equal(asmPhoto.eventCode, "INSTATION_UPDATE_ASM_PHOTO");
  assert.equal(asmPhoto.timestamp, 1789283546);
  assert.equal(asmPhoto.title, "Parcel photo is taken by the ASM.");
  assert.equal(asmPhoto.description, "ASM_Photo");
  assert.equal(asmPhoto.stationId, "3983");
  assert.equal(asmPhoto.operator, "CBSNC001VN3983/Unknown/Unknown");
  assert.deepEqual(asmPhoto.photoUrls, ["https://example.com/parcel.jpg"]);
});

test("normalizes millisecond timestamps before sorting", () => {
  const events = parseTransferOrderTrackingResponse({
    retcode: 0,
    data: {
      tracking_list: [
        {
          status: 33,
          timestamp: 1789333609,
          message: "Later tracking event",
        },
        {
          status: -1,
          timestamp: 1789283546,
          event_children: [
            {
              event_code: "INSTATION_UPDATE_ASM_PHOTO",
              track_time_ms: 1789283546000,
              message: "Earlier ASM event",
            },
          ],
        },
      ],
    },
  });

  assert.equal(events[0].title, "Later tracking event");
  assert.equal(events[0].timestamp, 1789333609);
  assert.equal(events[1].title, "Earlier ASM event");
  assert.equal(events[1].timestamp, 1789283546);
});

test("keeps unknown future statuses generic instead of requiring a status map", () => {
  const [event] = parseTransferOrderTrackingResponse({
    retcode: 0,
    data: {
      tracking_list: [
        {
          status: 123456,
          timestamp: 456,
          station_name: "Future SOC",
          message: "A future SPX tracking state",
        },
      ],
    },
  });

  assert.equal(event.status, "123456");
  assert.equal(event.title, "A future SPX tracking state");
  assert.equal(event.location, "Future SOC");
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

  assert.match(modalSource, /Đơn đại diện đầu tiên/);
  assert.match(modalSource, /Đang lấy đơn đầu tiên trong bao/);
  assert.match(modalSource, /Ảnh tracking/);
  assert.match(modalSource, /Operator/);
  assert.match(modalSource, /event\.eventCode/);
  assert.match(modalSource, /event\.photoUrls/);
  assert.match(modalSource, /Thử lại/);
});
