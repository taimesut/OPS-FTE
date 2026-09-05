import assert from "node:assert/strict";
import test from "node:test";
import {
  createTripDetailPath,
  createTripSearchPath,
  parseTripDetailResponse,
  parseTripSearchResponse,
} from "../src/features/incident-report/incidentReport.ts";

const trip = {
  id: 296766439,
  trip_number: "LT0Q944WOQG72",
  trip_name: "20260904TC17:30_QL14_._HYenSOC02",
  trip_date: 1788454800,
  trip_status: 40,
  driver_name: "Quốc Tuấn - Phan Thanh Tùng",
  second_driver_name: "",
  vehicle_number: "29E-259.57",
  vehicle_type_name: "Truck_8T60m3",
  agency_name: "Quốc Tuấn",
  display_station_sequence: 3,
};

test("builds list_v2 search URLs for LH Trip and plate number", () => {
  assert.equal(
    createTripSearchPath(" lt0q944woqg72 "),
    "/api/admin/transportation/trip/list_v2?station_type=2&trip_number=LT0Q944WOQG72&pageno=1&count=24&query_type=1&tab_type=1",
  );
  assert.equal(
    createTripSearchPath(" 29e-259.57 "),
    "/api/admin/transportation/trip/list_v2?station_type=2&plate_number=29E-259.57&pageno=1&count=24&query_type=1&tab_type=1",
  );
  assert.throws(() => createTripSearchPath("   "), /LH Trip|biển số/i);
});

test("parses zero, one and multiple trip results", () => {
  assert.deepEqual(parseTripSearchResponse({ retcode: 0, data: { list: [] } }), []);
  assert.equal(
    parseTripSearchResponse({ retcode: 0, data: { list: [trip] } })[0]
      ?.displayStationSequence,
    3,
  );
  assert.equal(
    parseTripSearchResponse({
      retcode: 0,
      data: { list: [trip, { ...trip, id: 2 }] },
    }).length,
    2,
  );
});

test("rejects malformed selected-trip identifiers and application errors", () => {
  assert.throws(
    () =>
      parseTripSearchResponse({
        retcode: 0,
        data: { list: [{ ...trip, id: 0 }] },
      }),
    /id/i,
  );
  assert.throws(
    () =>
      parseTripSearchResponse({
        retcode: 0,
        data: { list: [{ ...trip, display_station_sequence: "3" }] },
      }),
    /sequence/i,
  );
  assert.throws(
    () =>
      parseTripSearchResponse({ retcode: 401, message: "Không có quyền" }),
    /Không có quyền/i,
  );
});

test("builds and parses detail_v2 without trip_station", () => {
  assert.equal(
    createTripDetailPath(296220351),
    "/api/admin/transportation/trip/detail_v2?trip_id=296220351&new_process_switch=false",
  );
  assert.deepEqual(
    parseTripDetailResponse({
      retcode: 0,
      data: {
        ...trip,
        id: 296220351,
        trip_type_name: "By Land",
        seal_code: "SEAL-1",
        seal_code_list: ["SEAL-2"],
        remark: "",
        operator: "operator@spxexpress.com",
        remark_loading_quantity: 68,
        trip_station: [{ ignored: true }],
      },
    }),
    {
      id: 296220351,
      tripNumber: trip.trip_number,
      tripName: trip.trip_name,
      tripDate: trip.trip_date,
      tripTypeName: "By Land",
      driverName: trip.driver_name,
      secondDriverName: "",
      vehicleNumber: trip.vehicle_number,
      vehicleTypeName: trip.vehicle_type_name,
      agencyName: trip.agency_name,
      sealCodes: ["SEAL-1", "SEAL-2"],
      remark: "",
      operator: "operator@spxexpress.com",
      expectedQuantity: 68,
    },
  );
});
