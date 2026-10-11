import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createVehicleCheckParams,
  createVehicleCheckWindow,
  parseVehicleCheckResponse,
  parseVehicleLocationResponse,
  VEHICLE_CHECK_PATH,
  VEHICLE_LOCATION_PATH,
} from "../src/utils/vehicleCheck.ts";
import {
  fetchVehicleCheckRows,
  fetchVehicleLocation,
} from "../src/utils/vehicleCheckApi.ts";

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

test("uses station 1030 ETA for movement status regardless of display sequence", () => {
  const page = parseVehicleCheckResponse({
    retcode: 0,
    data: {
      pageno: 1,
      total: 2,
      list: [
        {
          id: 302289721,
          trip_number: "LT-ARRIVING",
          vehicle_number: "37C-586.46",
          display_station_sequence: 1,
          to_inbound_quantity: 180,
          order_inbound_quantity: 2089,
          trip_station: [
            {
              sequence_number: 1,
              station: 3909,
              station_name: "Hung Yen SOC",
              eta: 1791700000,
            },
            {
              sequence_number: 2,
              station: 1030,
              station_name: "Pleiku SOC",
              eta: 1791805877,
            },
          ],
        },
        {
          id: 302289722,
          trip_number: "LT-HELD",
          vehicle_number: "81A-000.02",
          display_station_sequence: 1,
          to_inbound_quantity: 12,
          order_inbound_quantity: 120,
          trip_station: [
            {
              sequence_number: 1,
              station: 725,
              station_name: "BMT SOC",
              eta: 1791700000,
            },
            {
              sequence_number: 2,
              station: 1030,
              station_name: "Pleiku SOC",
              eta: 0,
            },
          ],
        },
      ],
    },
  });

  assert.equal(page.rows[0].tripId, 302289721);
  assert.equal(page.rows[0].eta, 1791805877);
  assert.equal(page.rows[0].movementStatus, "arriving");
  assert.equal(page.rows[0].stations[1].isTarget, true);
  assert.equal(page.rows[0].stations[0].isTarget, false);

  assert.equal(page.rows[1].tripId, 302289722);
  assert.equal(page.rows[1].eta, null);
  assert.equal(page.rows[1].movementStatus, "held");
  assert.equal(page.rows[1].lastLocationUpdatedAt, null);
});

test("parses fallback ETA and latest location upload_time", () => {
  assert.deepEqual(
    parseVehicleLocationResponse({
      retcode: 0,
      data: {
        eta: 1791759957,
        location_list: [
          { upload_time: 1791683842, lat: 20.8, lng: 106.0 },
          { upload_time: 1791742876, lat: 15.5, lng: 107.8 },
          { upload_time: 1791730000, lat: 16.2, lng: 107.6 },
        ],
      },
    }),
    {
      eta: 1791759957,
      lastUpdatedAt: 1791742876,
    },
  );
});

test("fetches Trip Location only for held trips and keeps held classification", async () => {
  const calls: string[] = [];
  const dependency = {
    get: async (
      path: string,
      options: {
        params?: ReturnType<typeof createVehicleCheckParams>;
        suppressErrorToast: true;
      },
    ) => {
      calls.push(path);
      if (path === VEHICLE_CHECK_PATH) {
        assert.equal(options.params?.count, 50);
        return {
          data: {
            retcode: 0,
            data: {
              pageno: 1,
              total: 2,
              list: [
                {
                  id: 302289721,
                  trip_number: "LT-ARRIVING",
                  vehicle_number: "37C-586.46",
                  to_inbound_quantity: 10,
                  order_inbound_quantity: 100,
                  trip_station: [
                    {
                      sequence_number: 1,
                      station: 1030,
                      station_name: "Pleiku SOC",
                      eta: 1791805877,
                    },
                  ],
                },
                {
                  id: 302289722,
                  trip_number: "LT-HELD",
                  vehicle_number: "81A-000.02",
                  to_inbound_quantity: 20,
                  order_inbound_quantity: 200,
                  trip_station: [
                    {
                      sequence_number: 1,
                      station: 1030,
                      station_name: "Pleiku SOC",
                      eta: 0,
                    },
                  ],
                },
              ],
            },
          },
        };
      }

      if (
        path ===
        `${VEHICLE_LOCATION_PATH}?trip_id=302289722`
      ) {
        return {
          data: {
            retcode: 0,
            data: {
              eta: 1791759957,
              location_list: [
                { upload_time: 1791700000 },
                { upload_time: 1791742876 },
              ],
            },
          },
        };
      }

      throw new Error(`Unexpected request: ${path}`);
    },
  };

  const result = await fetchVehicleCheckRows(
    8,
    1_791_654_215_000,
    dependency,
  );

  assert.deepEqual(calls, [
    VEHICLE_CHECK_PATH,
    `${VEHICLE_LOCATION_PATH}?trip_id=302289722`,
  ]);

  const arriving = result.rows.find((row) => row.tripNumber === "LT-ARRIVING");
  const held = result.rows.find((row) => row.tripNumber === "LT-HELD");
  assert.equal(arriving?.movementStatus, "arriving");
  assert.equal(arriving?.eta, 1791805877);
  assert.equal(arriving?.lastLocationUpdatedAt, null);

  assert.equal(held?.movementStatus, "held");
  assert.equal(held?.eta, 1791759957);
  assert.equal(held?.lastLocationUpdatedAt, 1791742876);
});

test("location lookup errors do not remove held trips", async () => {
  const result = await fetchVehicleCheckRows(
    8,
    1_791_654_215_000,
    {
      get: async (path, options) => {
        if (path === VEHICLE_CHECK_PATH) {
          return {
            data: {
              retcode: 0,
              data: {
                pageno: 1,
                total: 1,
                list: [
                  {
                    id: 302289721,
                    trip_number: "LT-HELD",
                    to_inbound_quantity: 2,
                    order_inbound_quantity: 20,
                    trip_station: [
                      {
                        sequence_number: 1,
                        station: 1030,
                        station_name: "Pleiku SOC",
                        eta: 0,
                      },
                    ],
                  },
                ],
              },
            },
          };
        }
        assert.equal(options.suppressErrorToast, true);
        throw new Error("Location timeout");
      },
    },
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].movementStatus, "held");
  assert.equal(result.rows[0].eta, null);
  assert.equal(result.rows[0].lastLocationUpdatedAt, null);
});

test("fetchVehicleLocation uses trip_id query and parses response", async () => {
  const calls: string[] = [];
  const info = await fetchVehicleLocation(302289721, {
    get: async (path) => {
      calls.push(path);
      return {
        data: {
          retcode: 0,
          data: {
            eta: 1791759957,
            location_list: [{ upload_time: 1791742876 }],
          },
        },
      };
    },
  });

  assert.deepEqual(calls, [
    `${VEHICLE_LOCATION_PATH}?trip_id=302289721`,
  ]);
  assert.deepEqual(info, {
    eta: 1791759957,
    lastUpdatedAt: 1791742876,
  });
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
