import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createVehicleCheckParams,
  createVehicleCheckWindow,
  parseVehicleCheckResponse,
  VEHICLE_CHECK_PATH,
} from "../src/utils/vehicleCheck.ts";
import { fetchVehicleCheckRows } from "../src/utils/vehicleCheckApi.ts";

test("builds the exact list_v2 vehicle-check request with count 50", () => {
  const window = createVehicleCheckWindow(1_791_654_215_000, 8);
  assert.deepEqual(window, {
    from: 1_791_654_215,
    to: 1_791_683_015,
  });
  assert.equal(
    VEHICLE_CHECK_PATH,
    "/api/admin/transportation/trip/list_v2",
  );
  assert.deepEqual(createVehicleCheckParams(window, 1), {
    station_type: "2,3,7,12,14,16,18",
    trip_station_status: 200,
    pageno: 1,
    count: 50,
    query_type: 1,
    tab_type: 2,
    sta: "1791654215,1791683015",
  });
});

test("maps station route, ETA and movement status while filtering Pending Inbound", () => {
  const page = parseVehicleCheckResponse({
    retcode: 0,
    data: {
      pageno: 1,
      total: 4,
      list: [
        {
          trip_number: "LT-ARRIVING",
          vehicle_number: "37C-586.46",
          vehicle_plate_number_list: ["37C-586.46"],
          display_station_sequence: 3,
          to_inbound_quantity: 180,
          order_inbound_quantity: 2089,
          trip_station: [
            {
              sequence_number: 1,
              station: 3909,
              station_name: "Hung Yen SOC",
              eta: 0,
            },
            {
              sequence_number: 2,
              station: 1769,
              station_name: "Kon Tum SOC",
              eta: 0,
            },
            {
              sequence_number: 3,
              station: 1030,
              station_name: "Pleiku SOC",
              eta: 1791805877,
            },
          ],
        },
        {
          trip_number: "LT-HELD",
          vehicle_number: "81A-000.02",
          display_station_sequence: 2,
          to_inbound_quantity: 12,
          order_inbound_quantity: 120,
          trip_station: [
            {
              sequence_number: 1,
              station: 725,
              station_name: "BMT SOC",
              eta: 0,
            },
            {
              sequence_number: 2,
              station: 1030,
              station_name: "Pleiku SOC",
              eta: 0,
            },
          ],
        },
        {
          trip_number: "LT-NO-TO",
          to_inbound_quantity: 0,
          order_inbound_quantity: 20,
          trip_station: [],
        },
        {
          trip_number: "LT-NO-ORDER",
          to_inbound_quantity: 2,
          order_inbound_quantity: 0,
          trip_station: [],
        },
      ],
    },
  });

  assert.deepEqual(page, {
    pageNo: 1,
    total: 4,
    rows: [
      {
        tripNumber: "LT-ARRIVING",
        vehiclePlateNumber: "37C-586.46",
        stations: [
          {
            sequenceNumber: 1,
            stationId: "3909",
            stationName: "Hung Yen SOC",
            isDisplay: false,
            eta: null,
          },
          {
            sequenceNumber: 2,
            stationId: "1769",
            stationName: "Kon Tum SOC",
            isDisplay: false,
            eta: null,
          },
          {
            sequenceNumber: 3,
            stationId: "1030",
            stationName: "Pleiku SOC",
            isDisplay: true,
            eta: 1791805877,
          },
        ],
        pendingInboundTo: 180,
        pendingInboundOrder: 2089,
        eta: 1791805877,
        movementStatus: "arriving",
      },
      {
        tripNumber: "LT-HELD",
        vehiclePlateNumber: "81A-000.02",
        stations: [
          {
            sequenceNumber: 1,
            stationId: "725",
            stationName: "BMT SOC",
            isDisplay: false,
            eta: null,
          },
          {
            sequenceNumber: 2,
            stationId: "1030",
            stationName: "Pleiku SOC",
            isDisplay: true,
            eta: null,
          },
        ],
        pendingInboundTo: 12,
        pendingInboundOrder: 120,
        eta: null,
        movementStatus: "held",
      },
    ],
  });
});

test("continues paging with count 50 even when a page has no matching rows", async () => {
  const calls: Array<{
    path: string;
    params: Record<string, string | number>;
  }> = [];

  const result = await fetchVehicleCheckRows(
    8,
    1_791_654_215_000,
    {
      get: async (path, options) => {
        calls.push({ path, params: options.params });
        const pageNo = Number(options.params.pageno);
        return {
          data: {
            retcode: 0,
            data: {
              pageno: pageNo,
              total: 51,
              list:
                pageNo === 1
                  ? [
                      {
                        trip_number: "LT-FILTERED",
                        vehicle_number: "81A-000.01",
                        display_station_sequence: 1,
                        to_inbound_quantity: 0,
                        order_inbound_quantity: 10,
                        trip_station: [
                          {
                            sequence_number: 1,
                            station: 1030,
                            station_name: "Pleiku SOC",
                            eta: 0,
                          },
                        ],
                      },
                    ]
                  : [
                      {
                        trip_number: "LT-SECOND",
                        vehicle_number: "81A-000.02",
                        display_station_sequence: 1,
                        to_inbound_quantity: 2,
                        order_inbound_quantity: 20,
                        trip_station: [
                          {
                            sequence_number: 1,
                            station: 1030,
                            station_name: "Pleiku SOC",
                            eta: 1791805877,
                          },
                        ],
                      },
                    ],
            },
          },
        };
      },
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, VEHICLE_CHECK_PATH);
  assert.equal(calls[0].params.count, 50);
  assert.equal(calls[0].params.sta, "1791654215,1791683015");
  assert.equal(calls[1].params.count, 50);
  assert.equal(calls[1].params.pageno, 2);
  assert.equal(result.total, 51);
  assert.deepEqual(
    result.rows.map((row) => row.tripNumber),
    ["LT-SECOND"],
  );
  assert.equal(result.rows[0].movementStatus, "arriving");
});

test("wires Check xe into browser and userscript navigation", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const userscriptApp = readFileSync(
    new URL("../src/UserscriptApp.tsx", import.meta.url),
    "utf8",
  );
  const layout = readFileSync(
    new URL("../src/layouts/MobileLayout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /path="\/check-xe"/);
  assert.match(userscriptApp, /path="\/check-xe"/);
  assert.match(layout, /path:\s*"\/check-xe"/);
  assert.match(layout, /label:\s*"Check xe"/);
});
