import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildVehicleCheckRowsFromSheet,
  createVehicleCheckDisplayWindow,
  isVehicleCheckRowInDisplayWindow,
  parseVehicleCheckTimestamp,
} from "../src/utils/vehicleCheck.ts";
import {
  parseCsvTable,
  VEHICLE_CHECK_SPREADSHEET_ID,
} from "../src/utils/vehicleCheckSheet.ts";

const headers = [
  "trip_name",
  "trip_number",
  "sequence_number",
  "station_name",
  "next_station_name",
  "trip_sta",
  "trip_std",
  "trip_eta",
  "trip_etd",
  "trip_ata",
  "trip_atd",
  "loading_time",
  "loaded_time",
  "seal_time",
  "unseal_time",
  "unloaded_time",
  "load_quantity",
  "unload_quantity",
  "expect_unload_quantity",
  "transport_quantity",
  "load_total_transport_order",
  "unload_total_transport_order",
  "load_total_order",
  "unload_total_order",
  "load_weight",
  "unload_weight",
  "vehicle_number",
  "vehicle_type_name",
  "trip_status",
  "driver_id",
  "agency_name",
  "trip_assigned",
  "time_update",
];

const row = (values: Record<string, string | number>) =>
  headers.map((header) => String(values[header] ?? ""));

test("uses the configured OPS FTE Google Sheet as the vehicle source", () => {
  assert.equal(
    VEHICLE_CHECK_SPREADSHEET_ID,
    "1KtjQsrdSR0mvyxrL_sKo3ScOP-ELQ873iuUdLjMajWM",
  );
});

test("parses Google Sheet CSV including quoted cells", () => {
  assert.deepEqual(
    parseCsvTable('trip_number,station_name\n"LT,01","BMT SOC"\n'),
    [
      ["trip_number", "station_name"],
      ["LT,01", "BMT SOC"],
    ],
  );
});

test("creates the selected ETA display window", () => {
  assert.deepEqual(
    createVehicleCheckDisplayWindow(1_791_657_221_000, 8),
    {
      from: 1_791_657_221,
      to: 1_791_686_021,
    },
  );
});

test("parses displayed Sheet datetimes as Asia/Ho_Chi_Minh timestamps", () => {
  assert.equal(
    parseVehicleCheckTimestamp("2026-10-11 13:31:44"),
    Math.floor(Date.parse("2026-10-11T13:31:44+07:00") / 1000),
  );
});

test("finds the latest actual ATD and estimates BMT to Pleiku from Sheet travel time", () => {
  const table = {
    headers,
    sheetName: "DATA",
    sourceRowCount: 3,
    rows: [
      row({
        trip_name: "BD-QL14-DN",
        trip_number: "LT0QAA4ZZI2U1",
        sequence_number: 1,
        station_name: "BD A Mega SOC",
        next_station_name: "Gia Nghia SOC",
        trip_sta: "2026-10-10 15:03:00",
        trip_std: "2026-10-10 16:07:00",
        trip_ata: "2026-10-10 22:25:20",
        trip_atd: "2026-10-10 23:38:02",
        transport_quantity: 1400,
        vehicle_number: "89H-024.76",
        agency_name: "Minh Hiếu",
        time_update: "2026-10-10 23:38:02",
      }),
      row({
        trip_name: "BD-QL14-DN",
        trip_number: "LT0QAA4ZZI2U1",
        sequence_number: 2,
        station_name: "Gia Nghia SOC",
        next_station_name: "BMT SOC",
        trip_sta: "2026-10-10 21:03:00",
        trip_std: "2026-10-10 22:07:00",
        trip_ata: "2026-10-11 03:36:32",
        trip_atd: "2026-10-11 08:01:38",
        transport_quantity: 1042,
        vehicle_number: "89H-024.76",
        agency_name: "Minh Hiếu",
        time_update: "2026-10-11 08:01:38",
      }),
      row({
        trip_name: "BD-QL14-DN",
        trip_number: "LT0QAA4ZZI2U1",
        sequence_number: 3,
        station_name: "BMT SOC",
        next_station_name: "Pleiku SOC",
        trip_sta: "2026-10-11 01:03:00",
        trip_std: "2026-10-11 02:07:00",
        trip_eta: "2026-10-11 10:24:08",
        trip_ata: "2026-10-11 10:22:59",
        trip_atd: "2026-10-11 13:31:44",
        transport_quantity: 642,
        unload_total_transport_order: 403,
        vehicle_number: "89H-024.76",
        agency_name: "Minh Hiếu",
        time_update: "2026-10-11 13:31:44",
      }),
    ],
  };

  const result = buildVehicleCheckRowsFromSheet(table, [
    { stationName: "BMT SOC", minutes: 270 },
  ]);
  assert.equal(result.rows.length, 1);

  const vehicle = result.rows[0];
  const atd = Math.floor(Date.parse("2026-10-11T13:31:44+07:00") / 1000);
  assert.equal(vehicle.currentPositionLabel, "BMT SOC → Pleiku SOC");
  assert.equal(vehicle.positionStatus, "in_transit");
  assert.equal(vehicle.lastEventType, "atd");
  assert.equal(vehicle.lastEventAt, atd);
  assert.equal(vehicle.etaSource, "travel_atd");
  assert.equal(vehicle.travelTimeSource, "sheet_config");
  assert.equal(vehicle.travelTimeMinutes, 270);
  assert.equal(vehicle.eta, atd + 270 * 60);
  assert.equal(vehicle.transportQuantity, 642);
  assert.equal(vehicle.vehiclePlateNumber, "89H-024.76");
});

test("uses trip_eta of the Pleiku row when the Sheet provides it", () => {
  const table = {
    headers,
    sheetName: "DATA",
    sourceRowCount: 2,
    rows: [
      row({
        trip_number: "LT-ETA-PLEIKU",
        sequence_number: 1,
        station_name: "BMT SOC",
        next_station_name: "Pleiku SOC",
        trip_ata: "2026-10-11 10:00:00",
        trip_atd: "2026-10-11 11:00:00",
        vehicle_number: "81H-001.23",
        time_update: "2026-10-11 11:00:00",
      }),
      row({
        trip_number: "LT-ETA-PLEIKU",
        sequence_number: 2,
        station_name: "Pleiku SOC",
        trip_sta: "2026-10-11 15:00:00",
        trip_eta: "2026-10-11 15:20:00",
        vehicle_number: "81H-001.23",
        time_update: "2026-10-11 11:05:00",
      }),
    ],
  };

  const result = buildVehicleCheckRowsFromSheet(table);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].etaSource, "pleiku_eta");
  assert.equal(
    result.rows[0].eta,
    Math.floor(Date.parse("2026-10-11T15:20:00+07:00") / 1000),
  );
});

test("learns SOC to Pleiku travel time from historical ATA/ATD rows on the same Sheet", () => {
  const table = {
    headers,
    sheetName: "DATA",
    sourceRowCount: 4,
    rows: [
      row({
        trip_number: "LT-HISTORY",
        sequence_number: 1,
        station_name: "BMT SOC",
        next_station_name: "Pleiku SOC",
        trip_atd: "2026-10-10 10:00:00",
        vehicle_number: "81H-OLD",
        time_update: "2026-10-10 10:00:00",
      }),
      row({
        trip_number: "LT-HISTORY",
        sequence_number: 2,
        station_name: "Pleiku SOC",
        trip_ata: "2026-10-10 14:30:00",
        vehicle_number: "81H-OLD",
        time_update: "2026-10-10 14:30:00",
      }),
      row({
        trip_number: "LT-CURRENT",
        sequence_number: 1,
        station_name: "BMT SOC",
        next_station_name: "Pleiku SOC",
        trip_atd: "2026-10-11 12:00:00",
        vehicle_number: "81H-NEW",
        time_update: "2026-10-11 12:00:00",
      }),
      row({
        trip_number: "LT-CURRENT",
        sequence_number: 2,
        station_name: "Pleiku SOC",
        trip_sta: "2026-10-11 17:00:00",
        vehicle_number: "81H-NEW",
        time_update: "2026-10-11 12:00:00",
      }),
    ],
  };

  const result = buildVehicleCheckRowsFromSheet(table);
  const current = result.rows.find((item) => item.tripNumber === "LT-CURRENT");
  assert.ok(current);
  assert.equal(current.travelTimeSource, "sheet_history");
  assert.equal(current.travelTimeMinutes, 270);
  assert.equal(current.etaSource, "travel_atd");
});

test("does not treat an old Pleiku sequence as a vehicle currently heading to Pleiku", () => {
  const table = {
    headers,
    sheetName: "DATA",
    sourceRowCount: 3,
    rows: [
      row({
        trip_number: "LT-LEFT-PLEIKU",
        sequence_number: 1,
        station_name: "Gia Nghia SOC",
        next_station_name: "Pleiku SOC",
        trip_atd: "2026-10-11 02:00:00",
        vehicle_number: "81H-X",
      }),
      row({
        trip_number: "LT-LEFT-PLEIKU",
        sequence_number: 2,
        station_name: "Pleiku SOC",
        next_station_name: "Kon Tum SOC",
        trip_ata: "2026-10-11 06:00:00",
        trip_atd: "2026-10-11 07:00:00",
        vehicle_number: "81H-X",
      }),
      row({
        trip_number: "LT-LEFT-PLEIKU",
        sequence_number: 3,
        station_name: "Kon Tum SOC",
        next_station_name: "BMT SOC",
        trip_ata: "2026-10-11 09:00:00",
        vehicle_number: "81H-X",
      }),
    ],
  };

  assert.equal(buildVehicleCheckRowsFromSheet(table).rows.length, 0);
});

test("keeps an active inbound vehicle when ETA is already overdue", () => {
  const window = {
    from: 1_791_657_221,
    to: 1_791_686_021,
  };
  const activeRow = {
    tripNumber: "LT-OVERDUE",
    tripName: "",
    vehiclePlateNumber: "81H",
    vehicleTypeName: "—",
    agencyName: "—",
    stations: [],
    eta: 1_791_650_000,
    etaSource: "travel_atd" as const,
    targetSta: null,
    positionStatus: "in_transit" as const,
    currentStationName: "BMT SOC",
    nextStationName: "Pleiku SOC",
    currentPositionLabel: "BMT SOC → Pleiku SOC",
    currentSequenceNumber: 1,
    lastEventAt: 1_791_640_000,
    lastEventType: "atd" as const,
    actualArrivalAt: null,
    transportQuantity: 10,
    targetUnloadTransportOrder: null,
    sheetUpdatedAt: 1_791_656_000,
    travelTimeMinutes: 270,
    travelTimeSource: "sheet_config" as const,
  };

  assert.equal(isVehicleCheckRowInDisplayWindow(activeRow, window), true);
});

test("keeps an active inbound vehicle even when ETA cannot be calculated yet", () => {
  const window = {
    from: 1_791_657_221,
    to: 1_791_686_021,
  };
  const activeRow = {
    tripNumber: "LT-NO-ETA",
    tripName: "",
    vehiclePlateNumber: "81H",
    vehicleTypeName: "—",
    agencyName: "—",
    stations: [],
    eta: null,
    etaSource: null,
    targetSta: null,
    positionStatus: "in_transit" as const,
    currentStationName: "BMT SOC",
    nextStationName: "Pleiku SOC",
    currentPositionLabel: "BMT SOC → Pleiku SOC",
    currentSequenceNumber: 1,
    lastEventAt: 1_791_660_000,
    lastEventType: "atd" as const,
    actualArrivalAt: null,
    transportQuantity: 10,
    targetUnloadTransportOrder: null,
    sheetUpdatedAt: 1_791_660_000,
    travelTimeMinutes: null,
    travelTimeSource: null,
  };

  assert.equal(isVehicleCheckRowInDisplayWindow(activeRow, window), true);
});

test("filters calculated Sheet ETA by the requested hours", () => {
  const eta = 1_791_666_000;
  const baseRow = {
    tripNumber: "LT",
    tripName: "",
    vehiclePlateNumber: "81H",
    vehicleTypeName: "—",
    agencyName: "—",
    stations: [],
    eta,
    etaSource: "pleiku_eta" as const,
    targetSta: eta,
    positionStatus: "scheduled" as const,
    currentStationName: "",
    nextStationName: "",
    currentPositionLabel: "Chưa có ATA/ATD",
    currentSequenceNumber: null,
    lastEventAt: null,
    lastEventType: null,
    actualArrivalAt: null,
    transportQuantity: 0,
    targetUnloadTransportOrder: null,
    sheetUpdatedAt: null,
    travelTimeMinutes: null,
    travelTimeSource: null,
  };

  assert.equal(
    isVehicleCheckRowInDisplayWindow(baseRow, {
      from: 1_791_657_221,
      to: 1_791_686_021,
    }),
    true,
  );
});

test("Check xe source code no longer calls SPX trip APIs", () => {
  const page = readFileSync(
    new URL("../src/pages/CheckXePage.tsx", import.meta.url),
    "utf8",
  );
  const data = readFileSync(
    new URL("../src/utils/vehicleCheckData.ts", import.meta.url),
    "utf8",
  );
  const sheet = readFileSync(
    new URL("../src/utils/vehicleCheckSheet.ts", import.meta.url),
    "utf8",
  );

  for (const source of [page, data, sheet]) {
    assert.doesNotMatch(source, /trip\/list_v2/);
    assert.doesNotMatch(source, /trip\/location/);
    assert.doesNotMatch(source, /api\/admin\/transportation/);
  }
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
