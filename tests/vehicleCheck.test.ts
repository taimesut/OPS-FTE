import assert from "node:assert/strict";
import test from "node:test";
import {
  createVehicleCheckParams,
  createVehicleCheckQueryWindow,
  isVehicleCheckRowVisible,
  mapPleikuStationStatus,
  parseVehicleCheckResponse,
  resolveOperationalState,
  VEHICLE_CHECK_PAGE_SIZE,
  type VehicleCheckStation,
} from "../src/utils/vehicleCheck.ts";

const station = (
  name: string,
  code: string,
  status: number,
  extra: Partial<VehicleCheckStation> = {},
): VehicleCheckStation => ({
  sequenceNumber: 1,
  stationId: null,
  stationCode: code,
  stationName: name,
  tripStationStatus: status,
  eta: null,
  etd: null,
  ata: null,
  atd: null,
  sta: null,
  std: null,
  ...extra,
});

test("query window is exactly current time -1 day to +1 day", () => {
  const now = 1_791_754_437_000;
  assert.deepEqual(createVehicleCheckQueryWindow(now), {
    from: 1_791_668_037,
    to: 1_791_840_837,
  });
});

test("list_v2 params match the requested FMS query", () => {
  const params = createVehicleCheckParams(
    { from: 1_791_668_037, to: 1_791_840_837 },
    1,
  );
  assert.deepEqual(params, {
    station_type: "2,3,7,12,14,16,18",
    trip_station_status: "50,60,70,80,200",
    pageno: 1,
    count: VEHICLE_CHECK_PAGE_SIZE,
    query_type: 1,
    tab_type: 2,
    sta: "1791668037,1791840837",
  });
});

test("Pleiku direct statuses map exactly to requested labels", () => {
  assert.deepEqual(mapPleikuStationStatus(60), {
    process: "unseal",
    label: "Unseal",
  });
  assert.deepEqual(mapPleikuStationStatus(50), {
    process: "arrival",
    label: "Arrival",
  });
  assert.deepEqual(mapPleikuStationStatus(200), {
    process: "pending",
    label: "Pending",
  });
  assert.deepEqual(mapPleikuStationStatus(70), {
    process: "loading",
    label: "Loading",
  });
  assert.deepEqual(mapPleikuStationStatus(80), {
    process: "unloaded",
    label: "Unloaded",
  });
});

test("Pleiku status 0 + previous 40 means moving from previous SOC to Pleiku", () => {
  const stations = [
    station("Hung Yen SOC", "25SOCHYT", 40, {
      sequenceNumber: 1,
      atd: 1_791_682_008,
    }),
    station("Pleiku SOC", "44SOCGL", 0, {
      sequenceNumber: 2,
      eta: 1_791_837_862,
    }),
  ];
  const result = resolveOperationalState(stations, 1);
  assert.equal(result.state, "moving");
  assert.equal(
    result.label,
    "Đang di chuyển Hung Yen SOC → Pleiku SOC",
  );
});

test("when previous station is 0 it keeps walking backwards to status 40", () => {
  const stations = [
    station("Kon Tum SOC", "43SOCKT", 40, {
      sequenceNumber: 1,
    }),
    station("BMT SOC", "45SOCDLK", 0, {
      sequenceNumber: 2,
    }),
    station("Pleiku SOC", "44SOCGL", 0, {
      sequenceNumber: 3,
    }),
  ];
  const result = resolveOperationalState(stations, 2);
  assert.equal(result.state, "moving");
  assert.equal(
    result.label,
    "Đang di chuyển Kon Tum SOC → BMT SOC",
  );
});

test("backward nonzero status other than 40 means that SOC is holding the vehicle", () => {
  const stations = [
    station("Kon Tum SOC", "43SOCKT", 60, {
      sequenceNumber: 1,
    }),
    station("BMT SOC", "45SOCDLK", 0, {
      sequenceNumber: 2,
    }),
    station("Pleiku SOC", "44SOCGL", 0, {
      sequenceNumber: 3,
    }),
  ];
  const result = resolveOperationalState(stations, 2);
  assert.equal(result.state, "holding");
  assert.equal(result.label, "Kon Tum SOC đang giữ xe");
});

test("response filters by inbound > 0, driver != 0, and requires 44SOCGL", () => {
  const payload = {
    retcode: 0,
    data: {
      pageno: 1,
      total: 3,
      list: [
        {
          id: 1,
          trip_number: "KEEP",
          driver: 123461,
          to_inbound_quantity: 10,
          order_inbound_quantity: 50,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "25SOCHYT",
              station_name: "Hung Yen SOC",
              trip_station_status: 40,
              atd: 1_791_682_008,
            },
            {
              sequence_number: 2,
              station_code: "44SOCGL",
              station_name: "Pleiku SOC",
              trip_station_status: 0,
              eta: 1_791_837_862,
            },
          ],
        },
        {
          id: 2,
          trip_number: "DROP-ZERO-TO",
          driver: 123462,
          to_inbound_quantity: 0,
          order_inbound_quantity: 50,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "44SOCGL",
              station_name: "Pleiku SOC",
              trip_station_status: 50,
            },
          ],
        },
        {
          id: 3,
          trip_number: "DROP-ZERO-DRIVER",
          driver: 0,
          to_inbound_quantity: 9,
          order_inbound_quantity: 20,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "44SOCGL",
              station_name: "Pleiku SOC",
              trip_station_status: 0,
            },
          ],
        },
        {
          id: 4,
          trip_number: "DROP-NO-PLEIKU",
          driver: 123463,
          to_inbound_quantity: 9,
          order_inbound_quantity: 20,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "45SOCDLK",
              station_name: "BMT SOC",
              trip_station_status: 40,
            },
          ],
        },
      ],
    },
  };

  const page = parseVehicleCheckResponse(payload);
  assert.equal(page.rows.length, 2);
  const keep = page.rows.find((row) => row.tripNumber === "KEEP");
  const noPleiku = page.rows.find(
    (row) => row.tripNumber === "DROP-NO-PLEIKU",
  );
  assert.ok(keep);
  assert.equal(keep.driverId, 123461);
  assert.equal(keep.pendingInboundTo, 10);
  assert.equal(keep.pendingInboundOrder, 50);
  assert.ok(noPleiku);
  assert.equal(noPleiku.pleikuStationIndex, -1);
  assert.equal(noPleiku.etaPleiku, null);
});

test("keeps vehicles already at Pleiku even when pending inbound reaches zero", () => {
  const payload = {
    retcode: 0,
    data: {
      pageno: 1,
      total: 3,
      list: [
        {
          id: 11,
          trip_number: "AT-PLEIKU-UNSEAL",
          driver: 321,
          to_inbound_quantity: 0,
          order_inbound_quantity: 0,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "44SOCGL",
              station_name: "Pleiku SOC",
              trip_station_status: 60,
            },
          ],
        },
        {
          id: 12,
          trip_number: "AT-PLEIKU-LOADING",
          driver: 322,
          to_inbound_quantity: 0,
          order_inbound_quantity: 0,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "44SOCGL",
              station_name: "Pleiku SOC",
              trip_station_status: 70,
            },
          ],
        },
        {
          id: 13,
          trip_number: "AT-PLEIKU-UNLOADED",
          driver: 323,
          to_inbound_quantity: 0,
          order_inbound_quantity: 0,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "44SOCGL",
              station_name: "Pleiku SOC",
              trip_station_status: 80,
            },
          ],
        },
      ],
    },
  };

  const page = parseVehicleCheckResponse(payload);
  assert.deepEqual(
    page.rows.map((row) => [row.tripNumber, row.pleikuProcessLabel]),
    [
      ["AT-PLEIKU-UNSEAL", "Unseal"],
      ["AT-PLEIKU-LOADING", "Loading"],
      ["AT-PLEIKU-UNLOADED", "Unloaded"],
    ],
  );
});

test("trip route preserves every SOC in trip_station", () => {
  const payload = {
    retcode: 0,
    data: {
      pageno: 1,
      total: 1,
      list: [
        {
          id: 1,
          trip_number: "ROUTE",
          driver: 999,
          to_inbound_quantity: 10,
          order_inbound_quantity: 100,
          trip_station: [
            {
              sequence_number: 1,
              station_code: "25SOCHYT",
              station_name: "Hung Yen SOC",
              trip_station_status: 40,
            },
            {
              sequence_number: 2,
              station_code: "44SOCGL",
              station_name: "Pleiku SOC",
              trip_station_status: 0,
            },
            {
              sequence_number: 3,
              station_code: "45SOCDLK",
              station_name: "BMT SOC",
              trip_station_status: 0,
            },
            {
              sequence_number: 4,
              station_code: "63SOCBD1",
              station_name: "BD A Mega SOC",
              trip_station_status: 0,
            },
          ],
        },
      ],
    },
  };

  const page = parseVehicleCheckResponse(payload);
  assert.deepEqual(
    page.rows[0].stations.map((item) => item.stationName),
    ["Hung Yen SOC", "Pleiku SOC", "BMT SOC", "BD A Mega SOC"],
  );
});

test("all final results are filtered only by calculated ETA in N hours", () => {
  const base = {
    tripId: 1,
    tripNumber: "LT",
    tripName: "",
    vehiclePlateNumber: "81H",
    vehicleTypeName: "Truck",
    agencyName: "Agency",
    driverId: 123,
    pendingInboundTo: 10,
    pendingInboundOrder: 100,
    stations: [],
    pleikuStationIndex: 0,
    pleikuProcessStatus: "not_arrived" as const,
    pleikuProcessLabel: "Chưa đến Pleiku",
    operationalState: "moving" as const,
    currentPositionLabel: "Đang di chuyển BMT SOC → Pleiku SOC",
    currentStationName: "BMT SOC",
    nextStationName: "Pleiku SOC",
    referenceStationIndex: 0,
  };
  const window = { from: 1000, to: 2000 };

  assert.equal(
    isVehicleCheckRowVisible(
      {
        ...base,
        pleikuStationStatus: 0,
        etaPleiku: 1500,
      },
      window,
    ),
    true,
  );
  assert.equal(
    isVehicleCheckRowVisible(
      {
        ...base,
        pleikuStationStatus: 0,
        etaPleiku: 2500,
      },
      window,
    ),
    false,
  );
  assert.equal(
    isVehicleCheckRowVisible(
      {
        ...base,
        pleikuStationStatus: 50,
        pleikuProcessStatus: "arrival",
        pleikuProcessLabel: "Arrival",
        etaPleiku: null,
      },
      window,
    ),
    true,
  );
  assert.equal(
    isVehicleCheckRowVisible(
      {
        ...base,
        pleikuStationStatus: 60,
        pleikuProcessStatus: "unseal",
        pleikuProcessLabel: "Unseal",
        etaPleiku: 1500,
      },
      window,
    ),
    true,
  );
});
