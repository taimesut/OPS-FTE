import assert from "node:assert/strict";
import test from "node:test";
import {
  createStationIdMap,
  formatStationEntry,
  parseStationLine,
  parseStationLines,
  validateUniqueStations,
} from "../src/utils/stations.ts";
import { DEFAULT_STATION_CONFIG } from "../src/config/defaultStationConfig.ts";

test("parses and formats Name | ID station entries", () => {
  assert.deepEqual(parseStationLine("Hub Alpha | 2001"), {
    name: "Hub Alpha",
    id: "2001",
  });
  assert.deepEqual(parseStationLines("Hub Alpha | 2001\nHub Beta | 2002", "Hub"), [
    { name: "Hub Alpha", id: "2001" },
    { name: "Hub Beta", id: "2002" },
  ]);
  assert.equal(formatStationEntry("Hub Alpha", "2001"), "Hub Alpha | 2001");
});

test("rejects incomplete station lines", () => {
  assert.throws(() => parseStationLine("Hub Alpha"), /Tên \| ID/);
  assert.throws(() => parseStationLine("Hub Alpha | "), /thiếu ID/);
});

test("rejects duplicate names and IDs", () => {
  assert.throws(
    () => validateUniqueStations([
      { name: "Hub Alpha", id: "2001" },
      { name: "hub alpha", id: "2002" },
    ]),
    /Tên trạm bị trùng/,
  );
  assert.throws(
    () => validateUniqueStations([
      { name: "Hub Alpha", id: "2001" },
      { name: "Hub Beta", id: "2001" },
    ]),
    /ID 2001/,
  );
});

test("creates a station name-to-ID lookup", () => {
  assert.deepEqual(createStationIdMap([
    { name: "Hub Alpha", id: "2001" },
    { name: "Hub Beta", id: "2002" },
  ]), { "Hub Alpha": "2001", "Hub Beta": "2002" });
});

test("default sample is sanitized and every station/group member has an ID", () => {
  assert.equal(DEFAULT_STATION_CONFIG.cookies, "");
  assert.equal(DEFAULT_STATION_CONFIG.ggsheet_log_url, "");
  const entries = [
    { name: DEFAULT_STATION_CONFIG.soc, id: DEFAULT_STATION_CONFIG.soc_id || "" },
    ...DEFAULT_STATION_CONFIG.hubs.map((name) => ({
      name,
      id: DEFAULT_STATION_CONFIG.hub_ids?.[name] || "",
    })),
    ...DEFAULT_STATION_CONFIG.socs.map((name) => ({
      name,
      id: DEFAULT_STATION_CONFIG.soc_ids?.[name] || "",
    })),
  ];
  assert.doesNotThrow(() => validateUniqueStations(entries));
  assert.ok(entries.every(({ id }) => id));
  const configuredSocs = new Set(DEFAULT_STATION_CONFIG.socs);
  assert.ok(Object.values(DEFAULT_STATION_CONFIG.group_socs).flat()
    .every((name) => configuredSocs.has(name)));
});
