import type { TransferOrder } from "../components/TOTable";
import type { LooseOrderSummary } from "./looseOrders";
import {
  summarizePackedOrders,
  type PackedOrderMetrics,
} from "./packedOrderMetrics.ts";

export const OVERVIEW_COOLDOWN_MS = 120_000;
export const OVERVIEW_COOLDOWN_KEY = "internal-hub-overview:last-start-v1";
export const OVERVIEW_HUB_COOLDOWN_MS = 15_000;
export const OVERVIEW_HUB_COOLDOWN_KEY =
  "internal-hub-overview:hub-last-start-v1";
export const OVERVIEW_HUB_CONCURRENCY = 3;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HubDefinition {
  name: string;
  id: string;
}

export type HubOverviewStatus = "idle" | "loading" | "success" | "error";
export type BranchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface HubOverviewRow {
  name: string;
  id: string;
  status: HubOverviewStatus;
  loose: {
    data: LooseOrderSummary | null;
    error: string | null;
    stale: boolean;
  };
  packed: {
    orders: TransferOrder[];
    metrics: PackedOrderMetrics;
    hasData: boolean;
    error: string | null;
    stale: boolean;
  };
  updatedAt: number | null;
}

export interface OverviewConfigInput {
  soc: string;
  socId: string;
  cookies: string;
  hubs: HubDefinition[];
}

export interface OverviewTotals {
  completedHubs: number;
  totalHubs: number;
  looseTotal: number;
  looseDg: number;
  looseGtc: number;
  packedTo: number;
  packedQuantity: number;
  packedDg: number;
  packedGtc: number;
  latestUpdatedAt: number | null;
}

const EMPTY_PACKED_METRICS: PackedOrderMetrics = {
  totalQuantity: 0,
  dgBagCount: 0,
  gtcBagCount: 0,
};

export const createInitialHubRows = (
  hubs: readonly HubDefinition[],
): HubOverviewRow[] =>
  hubs.map(({ name, id }) => ({
    name,
    id,
    status: "idle",
    loose: { data: null, error: null, stale: false },
    packed: {
      orders: [],
      metrics: { ...EMPTY_PACKED_METRICS },
      hasData: false,
      error: null,
      stale: false,
    },
    updatedAt: null,
  }));

export const validateOverviewConfig = (
  input: OverviewConfigInput,
): string | null => {
  if (!input.soc.trim()) return "Chưa cấu hình SOC nguồn.";
  if (!input.socId.trim()) return "SOC nguồn chưa có ID.";
  if (!input.cookies.trim()) return "Chưa có Cookie SPX.";
  if (input.hubs.length === 0) return "Chưa cấu hình Hub nội tỉnh.";
  const missing = input.hubs
    .filter((hub) => !hub.id.trim())
    .map((hub) => hub.name);
  return missing.length
    ? `Các Hub chưa có ID: ${missing.join(", ")}`
    : null;
};

export const beginHubRefresh = (row: HubOverviewRow): HubOverviewRow => ({
  ...row,
  status: "loading",
  loose: {
    ...row.loose,
    error: null,
    stale: row.loose.data !== null,
  },
  packed: {
    ...row.packed,
    error: null,
    stale: row.packed.hasData,
  },
});

export function mergeHubBranchResult(
  row: HubOverviewRow,
  branch: "loose",
  result: BranchResult<LooseOrderSummary>,
): HubOverviewRow;
export function mergeHubBranchResult(
  row: HubOverviewRow,
  branch: "packed",
  result: BranchResult<TransferOrder[]>,
): HubOverviewRow;
export function mergeHubBranchResult(
  row: HubOverviewRow,
  branch: "loose" | "packed",
  result: BranchResult<LooseOrderSummary> | BranchResult<TransferOrder[]>,
): HubOverviewRow {
  if (branch === "loose") {
    if (result.ok) {
      return {
        ...row,
        loose: {
          data: result.data as LooseOrderSummary,
          error: null,
          stale: false,
        },
      };
    }
    return {
      ...row,
      loose: {
        ...row.loose,
        error: result.error,
        stale: row.loose.data !== null,
      },
    };
  }

  if (result.ok) {
    const orders = result.data as TransferOrder[];
    return {
      ...row,
      packed: {
        orders,
        metrics: summarizePackedOrders(orders),
        hasData: true,
        error: null,
        stale: false,
      },
    };
  }
  return {
    ...row,
    packed: {
      ...row.packed,
      error: result.error,
      stale: row.packed.hasData,
    },
  };
}

export const finishHubRefresh = (
  row: HubOverviewRow,
  completedAt: number,
): HubOverviewRow => {
  const hasFreshLooseData = row.loose.data !== null && !row.loose.stale;
  const hasFreshPackedData = row.packed.hasData && !row.packed.stale;
  const hasError = row.loose.error !== null || row.packed.error !== null;

  return {
    ...row,
    status: hasError ? "error" : "success",
    updatedAt:
      hasFreshLooseData || hasFreshPackedData ? completedAt : row.updatedAt,
  };
};

export const summarizeOverview = (
  rows: readonly HubOverviewRow[],
): OverviewTotals =>
  rows.reduce<OverviewTotals>(
    (totals, row) => {
      if (row.updatedAt !== null) {
        totals.completedHubs += 1;
        totals.latestUpdatedAt =
          totals.latestUpdatedAt === null
            ? row.updatedAt
            : Math.max(totals.latestUpdatedAt, row.updatedAt);
      }
      if (row.loose.data !== null) {
        totals.looseTotal += row.loose.data.total;
        totals.looseDg += row.loose.data.dgCount;
        totals.looseGtc += row.loose.data.highValueCount;
      }
      if (row.packed.hasData) {
        totals.packedTo += row.packed.orders.length;
        totals.packedQuantity += row.packed.metrics.totalQuantity;
        totals.packedDg += row.packed.metrics.dgBagCount;
        totals.packedGtc += row.packed.metrics.gtcBagCount;
      }
      return totals;
    },
    {
      completedHubs: 0,
      totalHubs: rows.length,
      looseTotal: 0,
      looseDg: 0,
      looseGtc: 0,
      packedTo: 0,
      packedQuantity: 0,
      packedDg: 0,
      packedGtc: 0,
      latestUpdatedAt: null,
    },
  );

export const getOverviewCooldownRemaining = (
  storage: StorageLike,
  now: number,
): number => {
  try {
    if (!Number.isFinite(now)) return 0;
    const raw = storage.getItem(OVERVIEW_COOLDOWN_KEY);
    if (raw === null || raw.trim() === "") return 0;
    const startedAt = Number(raw);
    if (!Number.isFinite(startedAt) || startedAt < 0 || startedAt > now) {
      return 0;
    }
    return Math.max(0, OVERVIEW_COOLDOWN_MS - (now - startedAt));
  } catch {
    return 0;
  }
};

export const startOverviewCooldown = (
  storage: StorageLike,
  now: number,
): void => {
  try {
    storage.setItem(OVERVIEW_COOLDOWN_KEY, String(now));
  } catch {
    // Storage may be unavailable in privacy mode; the current session still runs.
  }
};

const readHubCooldowns = (storage: StorageLike): Record<string, number> => {
  try {
    const raw = storage.getItem(OVERVIEW_HUB_COOLDOWN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          key.trim() !== "" &&
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0,
      ),
    );
  } catch {
    return {};
  }
};

export const getOverviewHubCooldownRemaining = (
  storage: StorageLike,
  hubKey: string,
  now: number,
): number => {
  if (!hubKey.trim() || !Number.isFinite(now)) return 0;
  const cooldowns = readHubCooldowns(storage);
  if (!Object.prototype.hasOwnProperty.call(cooldowns, hubKey)) return 0;
  const startedAt = cooldowns[hubKey];
  if (startedAt === undefined || startedAt > now) return 0;
  return Math.max(0, OVERVIEW_HUB_COOLDOWN_MS - (now - startedAt));
};

export const startOverviewHubCooldown = (
  storage: StorageLike,
  hubKey: string,
  now: number,
): void => {
  if (!hubKey.trim() || !Number.isFinite(now)) return;
  try {
    storage.setItem(
      OVERVIEW_HUB_COOLDOWN_KEY,
      JSON.stringify({ ...readHubCooldowns(storage), [hubKey]: now }),
    );
  } catch {
    // Storage may be unavailable; the in-memory request still proceeds.
  }
};

export const runWithConcurrency = async <T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<T[]> => {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("Concurrency limit must be at least 1.");
  }
  if (tasks.length === 0) return [];

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.floor(limit), tasks.length);

  const worker = async (): Promise<void> => {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};
