import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createInternalHubVolumePayload,
  createInternalHubVolumeRows,
  getInternalHubVolumeCooldownRemaining,
  INTERNAL_HUB_VOLUME_COOLDOWN_KEY,
  INTERNAL_HUB_VOLUME_PATH,
  parseInternalHubVolumeResponse,
  startInternalHubVolumeCooldown,
  summarizeInternalHubVolume,
  validateInternalHubVolumeConfig,
} from "../src/utils/internalHubVolume.ts";
import {
  fetchAllInternalHubVolumes,
  fetchInternalHubVolume,
} from "../src/utils/internalHubVolumeApi.ts";

test("builds the exact internal-Hub volume request", () => {
  assert.equal(
    INTERNAL_HUB_VOLUME_PATH,
    "/api/fleet_order/order/tracking_list/search",
  );
  assert.deepEqual(createInternalHubVolumePayload(" 1030 ", " 1812 "), {
    order_status: "8,33",
    count: 24,
    next_station_ids: "1812",
    current_station_ids: "1030",
    page_no: 1,
  });
});

test("rejects missing station IDs", () => {
  assert.throws(
    () => createInternalHubVolumePayload("", "1812"),
    /SOC.*ID/i,
  );
  assert.throws(
    () => createInternalHubVolumePayload("1030", ""),
    /Hub.*ID/i,
  );
});

test("parses only a finite non-negative data.total", () => {
  assert.equal(
    parseInternalHubVolumeResponse({
      retcode: 0,
      data: { total: 191, list: [{ tracking_number: "ignored" }] },
    }),
    191,
  );

  for (const payload of [
    null,
    { retcode: 1, message: "Không có quyền" },
    { retcode: 0, data: {} },
    { retcode: 0, data: { total: "191" } },
    { retcode: 0, data: { total: -1 } },
    { retcode: 0, data: { total: Number.NaN } },
  ]) {
    assert.throws(
      () => parseInternalHubVolumeResponse(payload),
      /total|quyền|hợp lệ/i,
    );
  }
});

test("creates rows and summarizes only successful Hub totals", () => {
  const rows = createInternalHubVolumeRows([
    { name: "Hub A", id: "101" },
    { name: "Hub B", id: "102" },
  ]);
  rows[0] = {
    ...rows[0],
    status: "success",
    total: 12,
    updatedAt: 2_000,
  };
  rows[1] = { ...rows[1], status: "error", error: "Timeout" };

  assert.deepEqual(summarizeInternalHubVolume(rows), {
    successfulHubs: 1,
    totalHubs: 2,
    totalVolume: 12,
    latestUpdatedAt: 2_000,
  });
});

test("validates every required configuration value", () => {
  assert.match(
    validateInternalHubVolumeConfig({
      soc: "",
      socId: "1",
      cookies: "x",
      hubs: [],
    }) ?? "",
    /SOC/i,
  );
  assert.match(
    validateInternalHubVolumeConfig({
      soc: "SOC",
      socId: "",
      cookies: "x",
      hubs: [],
    }) ?? "",
    /ID/i,
  );
  assert.match(
    validateInternalHubVolumeConfig({
      soc: "SOC",
      socId: "1",
      cookies: "",
      hubs: [],
    }) ?? "",
    /Cookie/i,
  );
  assert.match(
    validateInternalHubVolumeConfig({
      soc: "SOC",
      socId: "1",
      cookies: "x",
      hubs: [],
    }) ?? "",
    /Hub/i,
  );
  assert.match(
    validateInternalHubVolumeConfig({
      soc: "SOC",
      socId: "1",
      cookies: "x",
      hubs: [{ name: "Hub A", id: "" }],
    }) ?? "",
    /Hub A/,
  );
  assert.equal(
    validateInternalHubVolumeConfig({
      soc: "SOC",
      socId: "1",
      cookies: "x",
      hubs: [{ name: "Hub A", id: "101" }],
    }),
    null,
  );
});

test("persists and expires the ten-second cooldown safely", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };

  startInternalHubVolumeCooldown(storage, 5_000);
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 5_000), 10_000);
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 12_500), 2_500);
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 15_000), 0);

  values.set(INTERNAL_HUB_VOLUME_COOLDOWN_KEY, "bad");
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 20_000), 0);
  values.set(INTERNAL_HUB_VOLUME_COOLDOWN_KEY, "999999");
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 20_000), 0);
});

test("storage failures do not break cooldown checks", () => {
  const storage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(getInternalHubVolumeCooldownRemaining(storage, 5_000), 0);
  assert.doesNotThrow(() => startInternalHubVolumeCooldown(storage, 5_000));
});

test("posts the exact volume payload and returns data.total", async () => {
  const calls: unknown[][] = [];
  const total = await fetchInternalHubVolume("1030", "1812", {
    post: async (...args) => {
      calls.push(args);
      return {
        data: { retcode: 0, data: { total: 191, list: [] } },
      };
    },
  });

  assert.equal(total, 191);
  assert.deepEqual(calls, [
    [
      "/api/fleet_order/order/tracking_list/search",
      {
        order_status: "8,33",
        count: 24,
        next_station_ids: "1812",
        current_station_ids: "1030",
        page_no: 1,
      },
      { suppressErrorToast: true },
    ],
  ]);
});

test("runs every Hub request concurrently and keeps failures independent", async () => {
  let active = 0;
  let maximum = 0;
  const result = await fetchAllInternalHubVolumes(
    "1030",
    [
      { name: "Hub A", id: "101" },
      { name: "Hub B", id: "102" },
    ],
    {
      post: async (_path, payload) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        if (payload.next_station_ids === "102") {
          throw new Error("Timeout");
        }
        return { data: { retcode: 0, data: { total: 7 } } };
      },
    },
  );

  assert.equal(maximum, 2);
  assert.deepEqual(result, [
    { hub: { name: "Hub A", id: "101" }, ok: true, total: 7 },
    { hub: { name: "Hub B", id: "102" }, ok: false, error: "Timeout" },
  ]);
});

test("wires the internal-Hub volume route and navigation item", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const layout = readFileSync(
    new URL("../src/layouts/MobileLayout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /path="\/check-sot\/noi-tinh\/volume"/);
  assert.match(layout, /path:\s*"\/check-sot\/noi-tinh\/volume"/);
  assert.match(layout, /label:\s*"Volume nội tỉnh"/);
});
