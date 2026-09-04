import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  loadStationCatalog,
  loadStationHubs,
  normalizeStationCatalog,
  normalizeStationHubs,
} from "../src/utils/stationCatalog.ts";

const catalogResponse = [
  {
    stationName: "BD A Mega SOC",
    stationCode: "63SOCBD1",
    id: "2490",
    numberPrefix: "63",
  },
];

const hubResponse = [
  { stationName: "Hub A", stationCode: "63A01", id: "3954" },
];

test("normalizes catalog and hub display strings", () => {
  assert.deepEqual(
    normalizeStationCatalog([
      {
        stationName: " BD A Mega SOC ",
        stationCode: " 63SOCBD1 ",
        id: " 2490 ",
        numberPrefix: " 63 ",
      },
    ]),
    catalogResponse,
  );
  assert.deepEqual(
    normalizeStationCatalog([
      {
        stationName: "HN SOC",
        stationCode: "20SOCHN",
        id: "6",
        numberPrefix: "",
      },
    ])[0].numberPrefix,
    "",
  );
  assert.deepEqual(
    normalizeStationHubs([
      { stationName: " Hub A ", stationCode: " 63A01 ", id: " 3954 " },
    ]),
    hubResponse,
  );
});

test("rejects malformed and duplicate catalog responses", () => {
  assert.throws(() => normalizeStationCatalog(null), /không hợp lệ/);
  assert.throws(() => normalizeStationCatalog([]), /không có SOC/);
  assert.throws(
    () =>
      normalizeStationCatalog([
        ...catalogResponse,
        {
          stationName: "bd a mega soc",
          stationCode: "OTHER",
          id: "7",
          numberPrefix: "63",
        },
      ]),
    /bị trùng/,
  );
  assert.throws(
    () =>
      normalizeStationCatalog([
        { stationName: "HN SOC", stationCode: "", id: "6", numberPrefix: "20" },
      ]),
    /thiếu.*mã/i,
  );
});

test("rejects malformed and duplicate hubs but accepts an empty hub list", () => {
  assert.deepEqual(normalizeStationHubs([]), []);
  assert.throws(() => normalizeStationHubs({}), /không hợp lệ/);
  assert.throws(
    () =>
      normalizeStationHubs([
        ...hubResponse,
        { stationName: "Hub B", stationCode: "63a01", id: "5409" },
      ]),
    /bị trùng/,
  );
});

test("loads SOC and Hub data from the embedded userscript catalog", async () => {
  const catalog = await loadStationCatalog();
  assert.ok(catalog.length > 0);

  const bdSoc = catalog.find(({ id }) => id === "2490");
  assert.ok(bdSoc);
  assert.equal(bdSoc.stationCode, "63SOCBD1");

  const hubs = await loadStationHubs(" 2490 ");
  assert.ok(hubs.length > 0);
  assert.ok(hubs.every(({ stationCode }) => stationCode.startsWith("63")));
});

test("embedded catalog has no Google Apps Script dependency", async () => {
  const source = await readFile(
    new URL("../src/utils/stationCatalog.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /google\.script\.run/);
  assert.doesNotMatch(source, /StationCatalogRunner/);
  assert.doesNotMatch(source, /Google Apps Script/);
});

test("rejects blank and unknown SOC ids when loading hubs", async () => {
  await assert.rejects(loadStationHubs(""), /chọn SOC/);
  await assert.rejects(loadStationHubs("missing"), /Không tìm thấy SOC/);
});
