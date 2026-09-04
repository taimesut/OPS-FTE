export const INTERNAL_HUB_VOLUME_PATH =
  "/api/fleet_order/order/tracking_list/search";
export const INTERNAL_HUB_VOLUME_COOLDOWN_MS = 10_000;
export const INTERNAL_HUB_VOLUME_COOLDOWN_KEY =
  "internal-hub-volume:last-start-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HubVolumeDefinition {
  name: string;
  id: string;
}

export type HubVolumeStatus = "idle" | "loading" | "success" | "error";

export interface HubVolumeRow extends HubVolumeDefinition {
  status: HubVolumeStatus;
  total: number | null;
  error: string | null;
  updatedAt: number | null;
}

export interface HubVolumeSummary {
  successfulHubs: number;
  totalHubs: number;
  totalVolume: number;
  latestUpdatedAt: number | null;
}

export interface InternalHubVolumeConfigInput {
  soc: string;
  socId: string;
  hubs: readonly HubVolumeDefinition[];
}

export const createInternalHubVolumePayload = (
  currentStationId: string,
  nextStationId: string,
) => {
  const currentId = currentStationId.trim();
  const nextId = nextStationId.trim();
  if (!currentId) throw new Error("SOC nguồn chưa có ID.");
  if (!nextId) throw new Error("Hub nội tỉnh chưa có ID.");

  return {
    order_status: "8,33",
    count: 24,
    next_station_ids: nextId,
    current_station_ids: currentId,
    page_no: 1,
  } as const;
};

export const parseInternalHubVolumeResponse = (payload: unknown): number => {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Phản hồi volume không hợp lệ.");
  }

  const root = payload as {
    retcode?: unknown;
    message?: unknown;
    data?: unknown;
  };
  if (root.retcode !== 0) {
    throw new Error(
      typeof root.message === "string" && root.message.trim()
        ? root.message
        : "Không thể tải volume nội tỉnh.",
    );
  }
  if (typeof root.data !== "object" || root.data === null) {
    throw new Error("Phản hồi volume thiếu data.total hợp lệ.");
  }

  const total = (root.data as { total?: unknown }).total;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
    throw new Error("Phản hồi volume có data.total không hợp lệ.");
  }

  return total;
};

export const createInternalHubVolumeRows = (
  hubs: readonly HubVolumeDefinition[],
): HubVolumeRow[] =>
  hubs.map(({ name, id }) => ({
    name,
    id,
    status: "idle",
    total: null,
    error: null,
    updatedAt: null,
  }));

export const validateInternalHubVolumeConfig = (
  input: InternalHubVolumeConfigInput,
): string | null => {
  if (!input.soc.trim()) return "Chưa cấu hình SOC nguồn.";
  if (!input.socId.trim()) return "SOC nguồn chưa có ID.";
  if (input.hubs.length === 0) return "Chưa cấu hình Hub nội tỉnh.";

  const missingHubIds = input.hubs
    .filter((hub) => !hub.id.trim())
    .map((hub) => hub.name);
  return missingHubIds.length > 0
    ? `Các Hub chưa có ID: ${missingHubIds.join(", ")}`
    : null;
};

export const summarizeInternalHubVolume = (
  rows: readonly HubVolumeRow[],
): HubVolumeSummary =>
  rows.reduce<HubVolumeSummary>(
    (summary, row) => {
      if (row.status !== "success" || row.total === null) return summary;

      summary.successfulHubs += 1;
      summary.totalVolume += row.total;
      if (row.updatedAt !== null) {
        summary.latestUpdatedAt =
          summary.latestUpdatedAt === null
            ? row.updatedAt
            : Math.max(summary.latestUpdatedAt, row.updatedAt);
      }
      return summary;
    },
    {
      successfulHubs: 0,
      totalHubs: rows.length,
      totalVolume: 0,
      latestUpdatedAt: null,
    },
  );

export const getInternalHubVolumeCooldownRemaining = (
  storage: StorageLike,
  now: number,
): number => {
  try {
    if (!Number.isFinite(now)) return 0;
    const raw = storage.getItem(INTERNAL_HUB_VOLUME_COOLDOWN_KEY);
    if (raw === null || !raw.trim()) return 0;
    const startedAt = Number(raw);
    if (!Number.isFinite(startedAt) || startedAt < 0 || startedAt > now) {
      return 0;
    }
    return Math.max(
      0,
      INTERNAL_HUB_VOLUME_COOLDOWN_MS - (now - startedAt),
    );
  } catch {
    return 0;
  }
};

export const startInternalHubVolumeCooldown = (
  storage: StorageLike,
  now: number,
): void => {
  try {
    storage.setItem(INTERNAL_HUB_VOLUME_COOLDOWN_KEY, String(now));
  } catch {
    // Storage can be unavailable in privacy mode; the active request is still guarded.
  }
};
