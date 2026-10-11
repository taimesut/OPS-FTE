import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createVehicleCheckDisplayWindow,
  createVehicleCheckParams,
  createVehicleCheckQueryWindow,
  isVehicleCheckRowInDisplayWindow,
  parseVehicleCheckResponse,
  parseVehicleLocationResponse,
  resolveVehicleCheckEta,
  VEHICLE_CHECK_PATH,
  VEHICLE_LOCATION_PATH,
} from "../src/utils/vehicleCheck.ts";
import {
  fetchVehicleCheckRows,
  fetchVehicleLocation,
} from "../src/utils/vehicleCheckApi.ts";

test("builds fixed -2 day/+1 day list_v2 window with count 50", () => {
  const queryWindow = createVehicleCheckQueryWindow(1_791_657_221_000);
  assert.deepEqual(queryWindow, {
    from: 1_791_484_421,
    to: 1_791_743_621,
  });
  assert.equal(
    VEHICLE_CHECK_PATH,
    "/api/admin/transportation/trip/list_v2",
  );
  assert.deepEqual(createVehicleCheckParams(queryWindow, 1), {
    station_type: "2,3,7,12,14,16,18",
    trip_station_status: 200,
    pageno: 1,
    count: 50,
    query_type: 1,
    tab_type: 2,
    sta: "1791484421,1791743621",
  });
});

test("creates the user display window independently from the API query window", () => {
  assert.deepEqual(
    createVehicleCheckDisplayWindow(1_791_657_221_000, 8),
    {
      from: 1_791_657_221,
      to: 1_791_686_021,
    },
  );
});

test("maps station 1030 STA and uses it for display-window filtering", () => {
  const page = parseVehicleCheckResponse({
    retcode: 0,
    data: {
      pageno: 1,
      total: 2,
      list: [
        {
          id: 302289721,
          trip_number: "LT-IN-WINDOW",
          to_inbound_quantity: 10,
          order_inbound_quantity: 100,
          trip_station: [
            {
              sequence_number: 1,
              station: 3909,
              station_name: "Hung Yen SOC",
              sta: 1791650000,
              eta: 0,
            },
            {
              sequence_number: 2,
              station: 1030,
              station_name: "Pleiku SOC",
              sta: 1791660000,
              eta: 1791660500,
            },
          ],
        },
        {
          id: 302289722,
          trip_number: "LT-OUT-WINDOW",
          to_inbound_quantity: 20,
          order_inbound_quantity: 200,
          trip_station: [
            {
              sequence_number: 1,
              station: 1030,
              station_name: "Pleiku SOC",
              sta: 1791700000,
              eta: 0,
            },
          ],
        },
      ],
    },
  });

  assert.equal(page.rows[0].targetSta, 1791660000);
  assert.equal(page.rows[0].stations[1].sta, 1791660000);

  const displayWindow = {
    from: 1791657221,
    to: 1791686021,
  };
  assert.equal(
    isVehicleCheckRowInDisplayWindow(page.rows[0], displayWindow),
    true,
  );
  assert.equal(
    isVehicleCheckRowInDisplayWindow(page.rows[1], displayWindow),
    false,
  );
});

test("filters by station 1030 STA before Trip Location enrichment", async () => {
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
        assert.equal(options.params?.sta, "1791484421,1791743621");
        return {
          data: {
            retcode: 0,
            data: {
              pageno: 1,
              total: 3,
              list: [
                {
                  id: 302289721,
                  trip_number: "LT-ARRIVING-IN",
                  to_inbound_quantity: 10,
                  order_inbound_quantity: 100,
                  trip_station: [
                    {
                      sequence_number: 1,
                      station: 1030,
                      station_name: "Pleiku SOC",
                      sta: 1791660000,
                      eta: 1791660500,
                    },
                  ],
                },
                {
                  id: 302289722,
                  trip_number: "LT-HELD-IN",
                  to_inbound_quantity: 20,
                  order_inbound_quantity: 200,
                  trip_station: [
                    {
                      sequence_number: 1,
                      station: 1030,
                      station_name: "Pleiku SOC",
                      sta: 1791670000,
                      eta: 0,
                    },
                  ],
                },
                {
                  id: 302289723,
                  trip_number: "LT-HELD-OUT",
                  to_inbound_quantity: 30,
                  order_inbound_quantity: 300,
                  trip_station: [
                    {
                      sequence_number: 1,
                      station: 1030,
                      station_name: "Pleiku SOC",
                      sta: 1791700000,
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
              eta: 1791670500,
              location_list: [{ upload_time: 1791669000 }],
            },
          },
        };
      }

      throw new Error(`Unexpected request: ${path}`);
    },
  };

  const result = await fetchVehicleCheckRows(
    8,
    1_791_657_221_000,
    dependency,
  );

  assert.deepEqual(
    result.rows.map((row) => row.tripNumber),
    ["LT-ARRIVING-IN", "LT-HELD-IN"],
  );
  assert.deepEqual(calls, [
    VEHICLE_CHECK_PATH,
    `${VEHICLE_LOCATION_PATH}?trip_id=302289722`,
  ]);
  assert.deepEqual(result.queryWindow, {
    from: 1791484421,
    to: 1791743621,
  });
  assert.deepEqual(result.displayWindow, {
    from: 1791657221,
    to: 1791686021,
  });
});

test("uses latest ATA/ATD event and route travel time to estimate Pleiku", () => {
  const page = parseVehicleCheckResponse({
    retcode: 0,
    data: {
      pageno: 1,
      total: 1,
      list: [
        {
          id: 302289799,
          trip_number: "LT-BMT-PLEIKU",
          vehicle_number: "89H-024.76",
          to_inbound_quantity: 12,
          order_inbound_quantity: 120,
          trip_station: [
            {
              sequence_number: 1,
              station: 2020,
              station_name: "BMT SOC",
              sta: 1791655000,
              std: 1791658000,
              ata: 1791657000,
              atd: 1791660000,
            },
            {
              sequence_number: 2,
              station: 1030,
              station_name: "Pleiku SOC",
              sta: 1791680000,
              eta: 0,
              ata: 0,
              atd: 0,
            },
          ],
        },
      ],
    },
  });

  const row = resolveVehicleCheckEta(page.rows[0], {
    "bmt soc": 270,
  });

  assert.equal(row.positionStatus, "in_transit");
  assert.equal(row.currentPositionLabel, "BMT SOC → Pleiku SOC");
  assert.equal(row.lastEventType, "atd");
  assert.equal(row.lastEventAt, 1791660000);
  assert.equal(row.etaSource, "travel_atd");
  assert.equal(row.eta, 1791676200);
});

test("parses fallback ETA and latest location upload_time", () => {
  assert.deepEqual(
    parseVehicleLocationResponse({
      retcode: 0,
      data: {
        eta: 1791759957,
        location_list: [
          { upload_time: 1791683842 },
          { upload_time: 1791742876 },
          { upload_time: 1791730000 },
        ],
      },
    }),
    {
      eta: 1791759957,
      lastUpdatedAt: 1791742876,
    },
  );
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
