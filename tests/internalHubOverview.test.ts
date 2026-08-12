import assert from "node:assert/strict";
import test from "node:test";
import {
  beginHubRefresh,
  createInitialHubRows,
  finishHubRefresh,
  getOverviewHubCooldownRemaining,
  getOverviewCooldownRemaining,
  mergeHubBranchResult,
  runWithConcurrency,
  startOverviewCooldown,
  startOverviewHubCooldown,
  summarizeOverview,
  validateOverviewConfig,
} from "../src/utils/internalHubOverview.ts";
import {
  createPackedOrdersSearchPath,
  fetchHubOverviewBranches,
  parsePackedOrdersForSoc,
} from "../src/utils/internalHubOverviewApi.ts";

test("creates one idle row per configured Hub", () => {
  assert.deepEqual(
    createInitialHubRows([
      { name: "Hub A", id: "101" },
      { name: "Hub B", id: "102" },
    ]).map(({ name, id, status }) => ({ name, id, status })),
    [
      { name: "Hub A", id: "101", status: "idle" },
      { name: "Hub B", id: "102", status: "idle" },
    ],
  );
});

test("validates SOC, cookie, Hub list and every Hub ID before requests", () => {
  assert.match(validateOverviewConfig({ soc: "", socId: "1", cookies: "x", hubs: [] }) ?? "", /SOC/i);
  assert.match(validateOverviewConfig({ soc: "SOC", socId: "", cookies: "x", hubs: [] }) ?? "", /ID/i);
  assert.match(validateOverviewConfig({ soc: "SOC", socId: "1", cookies: "", hubs: [] }) ?? "", /Cookie/i);
  assert.match(validateOverviewConfig({ soc: "SOC", socId: "1", cookies: "x", hubs: [] }) ?? "", /Hub/i);
  assert.match(
    validateOverviewConfig({
      soc: "SOC",
      socId: "1",
      cookies: "x",
      hubs: [{ name: "Hub A", id: "" }, { name: "Hub B", id: "2" }],
    }) ?? "",
    /Hub A/,
  );
  assert.equal(
    validateOverviewConfig({
      soc: "SOC",
      socId: "1",
      cookies: "x",
      hubs: [{ name: "Hub A", id: "2" }],
    }),
    null,
  );
});

const packedOrders = [
  { to_number: "TO-A", quantity: 5, dg_type: [1], high_value: 1 },
  { to_number: "TO-B", quantity: 3, dg_type: [2], high_value: 2 },
] as never[];

test("merges branches independently and totals only successful data", () => {
  let [row] = createInitialHubRows([{ name: "Hub A", id: "101" }]);
  row = mergeHubBranchResult(row, "loose", {
    ok: true,
    data: { total: 7, dgCount: 2, highValueCount: 1 },
  });
  row = mergeHubBranchResult(row, "packed", { ok: true, data: packedOrders });
  row = finishHubRefresh(row, 1_000);

  assert.deepEqual(row.packed.metrics, {
    totalQuantity: 8,
    dgBagCount: 1,
    gtcBagCount: 1,
  });
  assert.equal(row.status, "success");
  assert.deepEqual(summarizeOverview([row]), {
    completedHubs: 1,
    totalHubs: 1,
    looseTotal: 7,
    looseDg: 2,
    looseGtc: 1,
    packedTo: 2,
    packedQuantity: 8,
    packedDg: 1,
    packedGtc: 1,
    latestUpdatedAt: 1_000,
  });
});

test("keeps previous successful data when a refresh branch fails", () => {
  let [row] = createInitialHubRows([{ name: "Hub A", id: "101" }]);
  row = mergeHubBranchResult(row, "packed", { ok: true, data: packedOrders });
  row = finishHubRefresh(row, 1_000);
  row = beginHubRefresh(row);
  row = mergeHubBranchResult(row, "packed", { ok: false, error: "Packed timeout" });
  row = finishHubRefresh(row, 2_000);
  assert.equal(row.packed.orders.length, 2);
  assert.equal(row.packed.error, "Packed timeout");
  assert.equal(row.packed.stale, true);
  assert.equal(row.updatedAt, 1_000);
  assert.equal(row.status, "error");
});

test("keeps successful sibling data and refresh timestamp when the other branch fails", () => {
  let [row] = createInitialHubRows([{ name: "Hub A", id: "101" }]);
  row = beginHubRefresh(row);
  row = mergeHubBranchResult(row, "loose", { ok: false, error: "Loose timeout" });
  row = mergeHubBranchResult(row, "packed", { ok: true, data: packedOrders });
  row = finishHubRefresh(row, 2_000);
  assert.equal(row.packed.orders.length, 2);
  assert.equal(row.updatedAt, 2_000);
  assert.equal(row.status, "error");
});

const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

test("persists a 120-second cooldown and expires exactly on time", () => {
  const storage = createStorage();
  startOverviewCooldown(storage, 10_000);
  assert.equal(getOverviewCooldownRemaining(storage, 10_000), 120_000);
  assert.equal(getOverviewCooldownRemaining(storage, 70_000), 60_000);
  assert.equal(getOverviewCooldownRemaining(storage, 130_000), 0);
});

test("malformed or future cooldown timestamps do not lock the page", () => {
  const malformed = createStorage({ "internal-hub-overview:last-start-v1": "bad" });
  const future = createStorage({ "internal-hub-overview:last-start-v1": "999999" });
  assert.equal(getOverviewCooldownRemaining(malformed, 5_000), 0);
  assert.equal(getOverviewCooldownRemaining(future, 5_000), 0);
});

test("storage failures do not break cooldown checks or startup", () => {
  const storage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  assert.equal(getOverviewCooldownRemaining(storage, 5_000), 0);
  assert.doesNotThrow(() => startOverviewCooldown(storage, 5_000));
});

test("persists an independent 15-second cooldown per Hub", () => {
  const storage = createStorage();
  startOverviewHubCooldown(storage, "1069", 10_000);
  startOverviewHubCooldown(storage, "1070", 12_000);

  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 10_000), 15_000);
  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 20_000), 5_000);
  assert.equal(getOverviewHubCooldownRemaining(storage, "1070", 20_000), 7_000);
  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 25_000), 0);
});

test("ignores malformed, future, and blank per-Hub cooldown entries", () => {
  const malformed = createStorage({
    "internal-hub-overview:hub-last-start-v1": "not-json",
  });
  const future = createStorage({
    "internal-hub-overview:hub-last-start-v1": JSON.stringify({ "1069": 99_999 }),
  });
  const blankKey = createStorage({
    "internal-hub-overview:hub-last-start-v1": JSON.stringify({ "": 5_000 }),
  });
  const inheritedKey = createStorage({
    "internal-hub-overview:hub-last-start-v1": JSON.stringify({ "1069": 5_000 }),
  });

  assert.equal(getOverviewHubCooldownRemaining(malformed, "1069", 5_000), 0);
  assert.equal(getOverviewHubCooldownRemaining(future, "1069", 5_000), 0);
  assert.equal(getOverviewHubCooldownRemaining(blankKey, "", 5_000), 0);
  assert.equal(getOverviewHubCooldownRemaining(inheritedKey, "toString", 5_000), 0);
});

test("per-Hub cooldown storage failures are safe", () => {
  const storage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };

  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 5_000), 0);
  assert.doesNotThrow(() => startOverviewHubCooldown(storage, "1069", 5_000));
});

test("runs no more than three Hub workers concurrently and preserves order", async () => {
  let active = 0;
  let maximum = 0;
  const release: Array<() => void> = [];
  const work = [1, 2, 3, 4, 5].map((value) => async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => release.push(resolve));
    active -= 1;
    return value * 10;
  });

  const resultPromise = runWithConcurrency(work, 3);
  await Promise.resolve();
  assert.equal(active, 3);
  while (release.length) {
    release.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.deepEqual(await resultPromise, [10, 20, 30, 40, 50]);
  assert.equal(maximum, 3);
});

test("rejects invalid concurrency limits", async () => {
  await assert.rejects(() => runWithConcurrency([async () => 1], 0), /limit/i);
});

test("builds the exact seven-day packed-order search URL", () => {
  assert.equal(
    createPackedOrdersSearchPath("44-GLI An Khe Hub", 1_000_000),
    "/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=44-GLI%20An%20Khe%20Hub&status=2&ctime=395200,1000000",
  );
});

test("keeps only packed orders currently at the configured SOC", () => {
  const validMatchingOrder = {
    to_number: "A",
    sender: "BD A Mega SOC",
    receiver: "44-GLI An Khe Hub",
    operator: "Operator",
    quantity: 5,
    weight: 2_500,
    status: "Packed",
    complete_time: 1_000_000,
    pack_name: "Bao 90x70",
    high_value: 2,
    dg_type: [1],
    current_station_name: "Pleiku SOC",
  };
  const response = {
    retcode: 0,
    data: {
      list: [
        validMatchingOrder,
        { to_number: "B", current_station_name: "Other SOC" },
      ],
    },
  };
  assert.deepEqual(
    parsePackedOrdersForSoc(response, "Pleiku SOC").map((item) => item.to_number),
    ["A"],
  );
});

test("rejects malformed packed orders matching the configured SOC", () => {
  const validOrder = {
    to_number: "A",
    sender: "BD A Mega SOC",
    receiver: "44-GLI An Khe Hub",
    operator: "Operator",
    quantity: 5,
    weight: 2_500,
    status: "Packed",
    complete_time: 1_000_000,
    pack_name: "Bao 90x70",
    high_value: 2,
    dg_type: [1],
    current_station_name: "Pleiku SOC",
  };

  for (const malformedOrder of [
    { ...validOrder, to_number: " " },
    { ...validOrder, quantity: Number.NaN },
    { ...validOrder, weight: Number.POSITIVE_INFINITY },
    { ...validOrder, high_value: "1" },
    { ...validOrder, dg_type: {} },
  ]) {
    assert.throws(
      () =>
        parsePackedOrdersForSoc(
          { retcode: 0, data: { list: [malformedOrder] } },
          "Pleiku SOC",
        ),
      /Transfer Order|packed/i,
    );
  }
});

test("rejects packed responses with a non-zero application retcode", () => {
  assert.throws(
    () => parsePackedOrdersForSoc({ retcode: 1, message: "Session expired", data: { list: [] } }, "Pleiku SOC"),
    /Session expired|retcode/i,
  );
});

test("rejects packed responses with a missing retcode", () => {
  assert.throws(
    () => parsePackedOrdersForSoc({ data: { list: [] } }, "Pleiku SOC"),
    /retcode|dữ liệu/i,
  );
});

test("rejects string packed retcodes even when the list is present", () => {
  for (const retcode of ["0", "1"]) {
    assert.throws(
      () => parsePackedOrdersForSoc({ retcode, data: { list: [] } }, "Pleiku SOC"),
      /retcode|dữ liệu/i,
    );
  }
});

test("rejects packed responses with a missing or malformed list", () => {
  assert.throws(
    () => parsePackedOrdersForSoc({ retcode: 0, data: {} }, "Pleiku SOC"),
    /list|dữ liệu/i,
  );
  assert.throws(
    () => parsePackedOrdersForSoc({ retcode: 0, data: { list: {} } }, "Pleiku SOC"),
    /list|dữ liệu/i,
  );
});

test("maps packed parse errors independently and preserves a fulfilled loose branch", async () => {
  const result = await fetchHubOverviewBranches(
    "Pleiku SOC",
    "1030",
    { name: "44-GLI An Khe Hub", id: "1069" },
    1_000_000,
    {
      fetchPackedOrders: async () => ({
        data: { retcode: 1, message: "Packed application error", data: { list: [] } },
      }),
      fetchLooseOrders: async () => ({ total: 7, dgCount: 2, highValueCount: 1 }),
    },
  );

  assert.deepEqual(result.packed, { ok: false, error: "Packed application error" });
  assert.deepEqual(result.loose, {
    ok: true,
    data: { total: 7, dgCount: 2, highValueCount: 1 },
  });
});

test("preserves the loose sibling when a matching packed order is malformed", async () => {
  const looseSummary = { total: 7, dgCount: 2, highValueCount: 1 };
  const result = await fetchHubOverviewBranches(
    "Pleiku SOC",
    "1030",
    { name: "44-GLI An Khe Hub", id: "1069" },
    1_000_000,
    {
      fetchPackedOrders: async () => ({
        data: {
          retcode: 0,
          data: {
            list: [
              {
                to_number: "TO-A",
                current_station_name: "Pleiku SOC",
                quantity: "5",
                weight: 2_500,
                high_value: 2,
              },
            ],
          },
        },
      }),
      fetchLooseOrders: async () => looseSummary,
    },
  );

  assert.equal(result.packed.ok, false);
  assert.match(result.packed.ok ? "" : result.packed.error, /Transfer Order|packed/i);
  assert.deepEqual(result.loose, { ok: true, data: looseSummary });
});
