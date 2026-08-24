import assert from "node:assert/strict";
import test from "node:test";
import {
  loadStationCatalog,
  loadStationHubs,
  normalizeStationCatalog,
  normalizeStationHubs,
  type StationCatalogRunner,
} from "../src/utils/stationCatalog.ts";

type RunnerOutcome = {
  catalog?: unknown;
  hubs?: unknown;
  error?: unknown;
};

const createRunner = (outcome: RunnerOutcome) => {
  let successHandler: (value: unknown) => void = () => {};
  let failureHandler: (error: unknown) => void = () => {};
  let requestedSocId = "";

  const runner: StationCatalogRunner = {
    withSuccessHandler(handler) {
      successHandler = handler;
      return this;
    },
    withFailureHandler(handler) {
      failureHandler = handler;
      return this;
    },
    getStationCatalog() {
      if (outcome.error) failureHandler(outcome.error);
      else successHandler(outcome.catalog);
    },
    getStationHubs(socId) {
      requestedSocId = socId;
      if (outcome.error) failureHandler(outcome.error);
      else successHandler(outcome.hubs);
    },
  };

  return { runner, getRequestedSocId: () => requestedSocId };
};

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

test("rejects malformed and duplicate hub responses but accepts no hubs", () => {
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

test("loads catalog and selected hubs through the Apps Script runner", async () => {
  const catalogRunner = createRunner({ catalog: catalogResponse });
  const hubRunner = createRunner({ hubs: hubResponse });

  assert.deepEqual(await loadStationCatalog(catalogRunner.runner), catalogResponse);
  assert.deepEqual(await loadStationHubs(" 2490 ", hubRunner.runner), hubResponse);
  assert.equal(hubRunner.getRequestedSocId(), "2490");
});

test("rejects unavailable runners, Apps Script errors, and blank SOC ids", async () => {
  await assert.rejects(loadStationCatalog(null), /Google Apps Script/);
  await assert.rejects(
    loadStationCatalog(createRunner({ error: { message: "sheet missing" } }).runner),
    /sheet missing/,
  );
  await assert.rejects(
    loadStationHubs("", createRunner({ hubs: [] }).runner),
    /chọn SOC/,
  );
});
