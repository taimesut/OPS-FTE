export const LOOSE_ORDER_SEARCH_PATH =
  "/api/fleet_order/order/tracking_list/search";

export const LOOSE_ORDER_CATEGORIES = [
  "normal",
  "dg",
  "gtc",
  "dgAndGtc",
] as const;

export type LooseOrderCategory = (typeof LOOSE_ORDER_CATEGORIES)[number];

const LOOSE_ORDER_FILTERS: Record<
  LooseOrderCategory,
  { high_value: 0 | 1; order_dg_type: 1 | 4 }
> = {
  normal: { high_value: 0, order_dg_type: 1 },
  dg: { high_value: 0, order_dg_type: 4 },
  gtc: { high_value: 1, order_dg_type: 1 },
  dgAndGtc: { high_value: 1, order_dg_type: 4 },
};

const normalizeReceivedTimeRange = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  const match = /^(\d+),(\d+)$/.exec(value.trim());
  if (!match) throw new Error("Khoảng thời gian nhận hàng không hợp lệ.");
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) {
    throw new Error("Khoảng thời gian nhận hàng không hợp lệ.");
  }
  return `${from},${to}`;
};

export const createLooseOrderPayload = (
  currentStationId: string,
  nextStationIds: string[],
  category: LooseOrderCategory,
  currentStationReceivedTime?: string,
) => {
  const currentId = currentStationId.trim();
  const destinationIds = [...new Set(nextStationIds.map((id) => id.trim()).filter(Boolean))];
  if (!currentId) throw new Error("SOC nguồn chưa có ID.");
  if (destinationIds.length === 0) throw new Error("Tuyến đích chưa có ID.");
  const receivedTime = normalizeReceivedTimeRange(currentStationReceivedTime);
  return {
    count: 24,
    current_station_ids: currentId,
    next_station_ids: destinationIds.join(","),
    order_status: "8",
    page_no: 1,
    ...LOOSE_ORDER_FILTERS[category],
    ...(receivedTime
      ? { current_station_received_time: receivedTime }
      : {}),
  } as const;
};

export interface LooseOrderSummary {
  total: number;
  normalCount: number;
  dgCount: number;
  highValueCount: number;
  dgAndHighValueCount: number;
}

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null ? (value as JsonObject) : null;

export const readLooseOrderTotal = (payload: unknown): number => {
  const root = asObject(payload);
  if (!root) {
    throw new Error("Phản hồi hàng xá lẻ không hợp lệ.");
  }

  if (root.retcode !== 0) {
    const message =
      typeof root.message === "string" && root.message.trim()
        ? root.message
        : "Không thể tải dữ liệu hàng xá lẻ.";
    throw new Error(message);
  }

  const data = asObject(root.data);
  if (!data) {
    throw new Error("Phản hồi hàng xá lẻ không hợp lệ.");
  }

  if (
    typeof data.total !== "number" ||
    !Number.isFinite(data.total) ||
    data.total < 0
  ) {
    throw new Error("Phản hồi hàng xá lẻ có data.total không hợp lệ.");
  }

  return data.total;
};

export const createLooseOrderSummary = (
  totals: Record<LooseOrderCategory, number>,
): LooseOrderSummary => {
  const { normal, dg, gtc, dgAndGtc } = totals;
  return {
    total: normal + dg + gtc + dgAndGtc,
    normalCount: normal,
    dgCount: dg,
    highValueCount: gtc,
    dgAndHighValueCount: dgAndGtc,
  };
};
