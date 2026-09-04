import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../src/utils/config.ts";
import type { StationCatalogSoc } from "../src/utils/stationCatalog.ts";
import {
  buildStationConfig,
  findConfiguredSocId,
  getExternalSocs,
  reconcileGroupSocs,
  validateGroupSocs,
} from "../src/utils/stationConfiguration.ts";

const emptyConfig: AppConfig = {
  soc: "",
  hubs: [],
  socs: [],
  group_socs: {},
};

const catalog: StationCatalogSoc[] = [
  {
    stationName: "BD A Mega SOC",
    stationCode: "63SOCBD1",
    id: "2490",
    numberPrefix: "63",
  },
  {
    stationName: "HN SOC",
    stationCode: "20SOCHN",
    id: "6",
    numberPrefix: "20",
  },
  {
    stationName: "DN Mega SOC",
    stationCode: "36SOCDNG",
    id: "3983",
    numberPrefix: "36",
  },
];

test("matches stored SOC by id, then code, then name", () => {
  assert.equal(
    findConfiguredSocId(
      {
        soc_id: "6",
        soc_code: "63SOCBD1",
        soc: "BD A Mega SOC",
      },
      catalog,
    ),
    "6",
  );
  assert.equal(
    findConfiguredSocId({ soc_code: " 63socbd1 " }, catalog),
    "2490",
  );
  assert.equal(
    findConfiguredSocId({ soc: " bd a mega soc " }, catalog),
    "2490",
  );
  assert.equal(findConfiguredSocId({ soc: "Missing SOC" }, catalog), "");
});

test("excludes the current SOC and reconciles valid legacy groups", () => {
  const external = getExternalSocs(catalog, "2490");
  assert.deepEqual(
    external.map(({ id }) => id),
    ["6", "3983"],
  );
  assert.deepEqual(
    reconcileGroupSocs(
      {
        "HN SOC": [
          "DN Mega SOC",
          "HN SOC",
          "HN SOC",
          "Missing SOC",
          "BD A Mega SOC",
          123,
        ],
        "BD A Mega SOC": ["BD A Mega SOC", "HN SOC"],
      },
      external,
    ),
    { "HN SOC": ["HN SOC", "DN Mega SOC"] },
  );
  assert.deepEqual(reconcileGroupSocs(null, external), {});
});

test("validates new groups strictly and normalizes representative order", () => {
  const external = getExternalSocs(catalog, "2490");
  assert.throws(
    () =>
      validateGroupSocs(
        { "HN SOC": ["HN SOC", "Missing SOC"] },
        external,
      ),
    /Missing SOC.*không thuộc danh sách SOC ngoại tỉnh/,
  );
  assert.throws(
    () => validateGroupSocs({ "Missing SOC": ["HN SOC"] }, external),
    /Missing SOC.*không thuộc danh sách SOC ngoại tỉnh/,
  );
  assert.deepEqual(
    validateGroupSocs(
      { "HN SOC": ["DN Mega SOC", "HN SOC", "HN SOC"] },
      external,
    ),
    { "HN SOC": ["HN SOC", "DN Mega SOC"] },
  );
});

test("builds local config entirely from the selected catalog row", () => {
  const result = buildStationConfig({
    previousConfig: {
      ...emptyConfig,
      scanner_url: "https://scan.example",
      raw_group_socs_text: "legacy text",
    },
    catalog,
    currentSocId: "2490",
    hubs: [
      { stationName: "Hub A", stationCode: "63A01", id: "3954" },
      { stationName: "Hub B", stationCode: "63A02", id: "5409" },
    ],
    groupSocs: { "HN SOC": ["DN Mega SOC", "HN SOC"] },
    logUrl: " https://log.example ",
  });

  assert.equal(result.soc, "BD A Mega SOC");
  assert.equal(result.soc_id, "2490");
  assert.equal(result.soc_code, "63SOCBD1");
  assert.equal(result.number_prefix, "63");
  assert.deepEqual(result.hubs, ["Hub A", "Hub B"]);
  assert.deepEqual(result.hub_ids, { "Hub A": "3954", "Hub B": "5409" });
  assert.deepEqual(result.hub_codes, {
    "Hub A": "63A01",
    "Hub B": "63A02",
  });
  assert.deepEqual(result.socs, ["HN SOC", "DN Mega SOC"]);
  assert.deepEqual(result.soc_ids, { "HN SOC": "6", "DN Mega SOC": "3983" });
  assert.deepEqual(result.soc_codes, {
    "HN SOC": "20SOCHN",
    "DN Mega SOC": "36SOCDNG",
  });
  assert.deepEqual(result.group_socs, {
    "HN SOC": ["HN SOC", "DN Mega SOC"],
  });
  assert.equal(result.ggsheet_log_url, "https://log.example");
  assert.equal(result.scanner_url, "https://scan.example");
  assert.equal(result.raw_group_socs_text, undefined);
  assert.equal("cookies" in result, false);
  assert.equal("proxy_url" in result, false);
});

test("refuses to build with a missing SOC, malformed hubs, or invalid groups", () => {
  const baseInput = {
    previousConfig: emptyConfig,
    catalog,
    currentSocId: "2490",
    hubs: [{ stationName: "Hub A", stationCode: "63A01", id: "3954" }],
    groupSocs: {},
    logUrl: "",
  };

  assert.throws(
    () => buildStationConfig({ ...baseInput, currentSocId: "missing" }),
    /không còn tồn tại/,
  );
  assert.throws(
    () =>
      buildStationConfig({
        ...baseInput,
        hubs: [
          ...baseInput.hubs,
          { stationName: "Hub B", stationCode: "63A01", id: "5409" },
        ],
      }),
    /Hub.*bị trùng/,
  );
  assert.throws(
    () =>
      buildStationConfig({
        ...baseInput,
        groupSocs: { "HN SOC": ["HN SOC", "Missing SOC"] },
      }),
    /Missing SOC.*không thuộc danh sách SOC ngoại tỉnh/,
  );
});
