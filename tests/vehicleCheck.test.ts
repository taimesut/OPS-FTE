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

test("builds the exact list_v2 vehicle-check request", () => {
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
    count: 24,
    query_type: 1,
    tab_type: 2,
    sta: "1791654215,1791683015",
  });
});

test("keeps only positive Pending Inbound trips and maps the full station route", () => {
  const page = parseVehicleCheckResponse({
    retcode: 0,
    data: {
      pageno: 1,
      total: 3,
      list: [
        {
          trip_number: "LT0QAA4ZZ49T1",
          vehicle_number: "37C-586.46",
          vehicle_plate_number_list: ["37C-586.46"],
          display_station_sequence: 3,
          to_inbound_quantity: 180,
          order_inbound_quantity: 2089,
          trip_station: [
            {
              sequence_number: 5,
              station: 2490,
              station_name: "BD A Mega SOC",
            },
            {
              sequence_number: 1,
              station: 3909,
              station_name: "Hung Yen SOC",
            },
            {
              sequence_number: 3,
              station: 1030,
              station_name: "Pleiku SOC",
            },
            {
              sequence_number: 2,
              station: 1769,
              station_name: "Kon Tum SOC",
            },
            {
              sequence_number: 4,
              station: 725,
              station_name: "BMT SOC",
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
    total: 3,
    rows: [
      {
        tripNumber: "LT0QAA4ZZ49T1",
        vehiclePlateNumber: "37C-586.46",
        stations: [
          {
            sequenceNumber: 1,
            stationId: "3909",
            stationName: "Hung Yen SOC",
            isDisplay: false,
          },
          {
            sequenceNumber: 2,
            stationId: "1769",
            stationName: "Kon Tum SOC",
            isDisplay: false,
          },
          {
            sequenceNumber: 3,
            stationId: "1030",
            stationName: "Pleiku SOC",
            isDisplay: true,
          },
          {
            sequenceNumber: 4,
            stationId: "725",
            stationName: "BMT SOC",
            isDisplay: false,
          },
          {
            sequenceNumber: 5,
            stationId: "2490",
            stationName: "BD A Mega SOC",
            isDisplay: false,
          },
        ],
        pendingInboundTo: 180,
        pendingInboundOrder: 2089,
      },
    ],
  });
});

test("continues paging even when an API page has no matching positive Pending Inbound rows", async () => {
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
              total: 25,
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
  assert.equal(calls[0].params.sta, "1791654215,1791683015");
  assert.equal(calls[1].params.sta, "1791654215,1791683015");
  assert.equal(calls[1].params.pageno, 2);
  assert.equal(result.total, 25);
  assert.deepEqual(
    result.rows.map((row) => row.tripNumber),
    ["LT-SECOND"],
  );
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
