import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  groupTransferOrderTrackingByStationAndFlow,
  parseTransferOrderTrackingResponse,
} from "../src/utils/transferOrderTracking.ts";
import { getTrackingStatusName } from "../src/utils/trackingStatusMap.ts";

test("maps all known SPX numeric tracking statuses to canonical names", () => {
  assert.equal(getTrackingStatusName("0"), "Created");
  assert.equal(getTrackingStatusName("8"), "SOC_Received");
  assert.equal(getTrackingStatusName("9"), "SOC_Packing");
  assert.equal(getTrackingStatusName("33"), "SOC_Packed");
  assert.equal(getTrackingStatusName("34"), "SOC_LHPacking");
  assert.equal(getTrackingStatusName("35"), "SOC_LHPacked");
  assert.equal(getTrackingStatusName("15"), "SOC_LHTransporting");
  assert.equal(getTrackingStatusName("36"), "SOC_LHTransported");
  assert.equal(getTrackingStatusName("882"), "SOC_LHArrived");
  assert.equal(getTrackingStatusName("918"), "SOC_LHUnloading");
  assert.equal(getTrackingStatusName("928"), "SOC_LHUnloaded");
  assert.equal(getTrackingStatusName("123456"), "");
});

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
        location: "SOC A",
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
          workstation: "[WS1030]ManualSort",
          tags: ["Mass"],
          children: [],
          event_children: [],
        },
        {
          id: 0,
          timestamp: 1789283546,
          status: -2,
          station_name: "DN Mega SOC",
          station_id: 3983,
          message: "",
          operator: "",
          children: [],
          event_children: [
            {
              track_id: "1201031888",
              event_code: "INSTATION_UPDATE_ASM_PHOTO",
              track_time_ms: 1789283546000,
              track_time: 1789283546,
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
  assert.equal(events[0].statusName, "SOC_Packed");
  assert.equal(events[0].location, "Pleiku SOC");
  assert.equal(events[0].stationId, "1030");
  assert.equal(events[0].operator, "spx@shopee.com");
  assert.equal(events[0].workstation, "[WS1030]ManualSort");
  assert.deepEqual(events[0].tags, ["Mass"]);

  const asmPhoto = events[1];
  assert.equal(asmPhoto.status, "");
  assert.equal(asmPhoto.statusName, "ASM_Photo");
  assert.equal(asmPhoto.source, "event");
  assert.equal(asmPhoto.eventCode, "INSTATION_UPDATE_ASM_PHOTO");
  assert.equal(asmPhoto.timestamp, 1789283546);
  assert.equal(asmPhoto.title, "Parcel photo is taken by the ASM.");
  assert.equal(asmPhoto.location, "DN Mega SOC");
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

test("groups timeline by station and then by operational flow", () => {
  const events = parseTransferOrderTrackingResponse({
    retcode: 0,
    data: {
      tracking_list: [
        { status: 0, timestamp: 100, message: "Order has been created", operator: "sls" },
        { status: 8, timestamp: 200, station_name: "36-DNG Warehouse Inbound", station_id: 3983, tags: ["Mass"], message: "Parcel arrived at sorting center" },
        { status: 9, timestamp: 210, message: "Parcel packing into TO [TO1]" },
        { status: 33, timestamp: 220, message: "Parcel packed into TO [TO1]" },
        { status: 34, timestamp: 230, message: "Parcel [TO1] adding into LH Task [LT1]" },
        { status: 35, timestamp: 240, message: "Parcel [TO1] added into LH Task [LT1]" },
        { status: 15, timestamp: 250, message: "Parcel [TO1] transporting to [DN Mega SOC]" },
        { status: 882, timestamp: 260, station_name: "DN Mega SOC", station_id: 4000, message: "[TO1] arrived at [DN Mega SOC] via Linehaul Trip [LT1]" },
        { status: 918, timestamp: 270, message: "[TO1] unloading at [DN Mega SOC] via Linehaul Trip [LT1]" },
        { status: 928, timestamp: 280, message: "[TO1] unloaded at [DN Mega SOC] via Linehaul Trip [LT1]" },
      ],
    },
  });

  const groups = groupTransferOrderTrackingByStationAndFlow(events);

  assert.deepEqual(
    groups.map((group) => group.stationName),
    ["Khởi tạo", "36-DNG Warehouse Inbound", "DN Mega SOC"],
  );
  assert.deepEqual(
    groups[1].flows.map((flow) => flow.flow),
    ["Inbound", "Đóng bao", "Linehaul"],
  );
  assert.deepEqual(
    groups[1].flows[2].events.map((event) => event.statusName),
    ["SOC_LHPacking", "SOC_LHPacked", "SOC_LHTransporting"],
  );
  assert.deepEqual(
    groups[2].flows[0].events.map((event) => event.statusName),
    ["SOC_LHArrived", "SOC_LHUnloading", "SOC_LHUnloaded"],
  );
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
  assert.equal(event.statusName, "");
  assert.equal(event.title, "A future SPX tracking state");
  assert.equal(event.location, "Future SOC");
});

test("uses canonical status name as fallback and rejects empty tracking", () => {
  const [event] = parseTransferOrderTrackingResponse({
    retcode: 0,
    data: { tracking_list: [{ status: 882, timestamp: 123 }] },
  });
  assert.equal(event.title, "SOC_LHArrived");
  assert.equal(event.statusName, "SOC_LHArrived");
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

test("wires TO detail to first shipment tracking and renders SPX-style timeline", async () => {
  const [apiSource, tableSource, modalSource] = await Promise.all([
    readFile(new URL("../src/utils/transferOrderTrackingApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/TOTable.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/TrackingModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(apiSource, /buildTransferOrderDetailPath\(normalizedToNumber\)/);
  assert.match(apiSource, /parseFirstFleetOrderId\(detailResponse\.data\)/);
  assert.match(apiSource, /buildShipmentTrackingPath\(shipmentId\)/);
  assert.match(apiSource, /parseTransferOrderTrackingResponse\(trackingResponse\.data\)/);
  assert.match(tableSource, /fetchTransferOrderTracking\(item\.to_number\)/);
  assert.match(tableSource, /onViewTracking/);
  assert.match(tableSource, />\s*Tracking\s*</);
  assert.match(tableSource, /<TrackingModal/);
  assert.match(modalSource, /Order Tracking History/);
  assert.match(modalSource, /groupTransferOrderTrackingByStationAndFlow/);
  assert.match(modalSource, /TimelineRail/);
  assert.match(modalSource, /StationTimelineGroup/);
  assert.match(modalSource, /group\/station/);
  assert.match(modalSource, /event\.statusName/);
  assert.match(modalSource, /event\.workstation/);
  assert.match(modalSource, /photoCount > 0/);
  assert.match(modalSource, /ảnh tracking/);
  assert.match(modalSource, /max-w-\[480px\]/);
  assert.match(modalSource, /Đang tải toàn bộ hành trình/);
  assert.match(modalSource, /Thử lại/);
});
