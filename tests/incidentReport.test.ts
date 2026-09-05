import assert from "node:assert/strict";
import test from "node:test";
import {
  createLoadingPath,
  createTripDetailPath,
  createTripSearchPath,
  extractLoadingCode,
  parseLoadingPage,
  parseTripDetailResponse,
  parseTripSearchResponse,
} from "../src/features/incident-report/incidentReport.ts";
import {
  fetchAllLoadingItems,
  fetchTripDetails,
  searchTrips,
} from "../src/features/incident-report/incidentReportApi.ts";

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

test("builds exact pending and inbound loading paths from display sequence", () => {
  assert.equal(
    createLoadingPath("pending", 296220351, 3, 1),
    "/api/admin/transportation/trip/loading/list?trip_id=296220351&pageno=1&count=24&unloaded_sequence_number=3&actual_unloaded_sequence_number=0&type=pending",
  );
  assert.equal(
    createLoadingPath("inbound", 296220351, 3, 2),
    "/api/admin/transportation/trip/loading/list?trip_id=296220351&pageno=2&count=24&actual_unloaded_sequence_number=3&type=inbound&unload_list_type=2",
  );
});

test("prefers scan_number, falls back to to_number and drops blank codes", () => {
  assert.equal(
    extractLoadingCode({ scan_number: " spxvn01 ", to_number: "TO-1" }),
    "SPXVN01",
  );
  assert.equal(
    extractLoadingCode({ scan_number: "", to_number: " to2026 " }),
    "TO2026",
  );
  assert.equal(
    extractLoadingCode({ scan_number: " ", to_number: " " }),
    null,
  );
});

test("parses loading totals and counts invalid rows", () => {
  assert.deepEqual(
    parseLoadingPage({
      retcode: 0,
      data: {
        pageno: 1,
        count: 24,
        total: 3,
        list: [
          { scan_number: "SPX-1", to_number: "TO-1" },
          { scan_number: "", to_number: "TO-2" },
          { scan_number: "", to_number: "" },
        ],
      },
    }),
    {
      pageNo: 1,
      count: 24,
      total: 3,
      codes: ["SPX-1", "TO-2"],
      invalidCount: 1,
      rawItemCount: 3,
    },
  );
});

test("loads every page and stops after total is reached", async () => {
  const paths: string[] = [];
  const dependency = {
    get: async (path: string) => {
      paths.push(path);
      const pageNo = Number(
        new URL(`https://local${path}`).searchParams.get("pageno"),
      );
      return {
        data: {
          retcode: 0,
          data: {
            pageno: pageNo,
            count: 24,
            total: 25,
            list:
              pageNo === 1
                ? Array.from({ length: 24 }, (_, index) => ({
                    scan_number: `SPX-${index + 1}`,
                  }))
                : [{ scan_number: "SPX-25" }],
          },
        },
      };
    },
  };
  const result = await fetchAllLoadingItems(
    "pending",
    296220351,
    3,
    dependency,
  );
  assert.equal(paths.length, 2);
  assert.equal(result.codes.length, 25);
  assert.equal(result.invalidCount, 0);
});

test("stops safely on an empty page even when total metadata is inconsistent", async () => {
  let calls = 0;
  const result = await fetchAllLoadingItems("inbound", 1, 3, {
    get: async () => ({
      data: {
        retcode: 0,
        data: { pageno: ++calls, count: 24, total: 1000, list: [] },
      },
    }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    codes: [],
    invalidCount: 0,
    reportedTotal: 1000,
  });
});

test("API adapter delegates search and detail through the injected GET client", async () => {
  const paths: string[] = [];
  const dependency = {
    get: async (path: string) => {
      paths.push(path);
      return path.includes("list_v2")
        ? { data: { retcode: 0, data: { list: [trip] } } }
        : {
            data: {
              retcode: 0,
              data: { ...trip, id: 296766439, seal_code_list: [] },
            },
          };
    },
  };
  assert.equal((await searchTrips("LT0Q944WOQG72", dependency)).length, 1);
  assert.equal((await fetchTripDetails(296766439, dependency)).id, 296766439);
  assert.equal(paths.length, 2);
});
