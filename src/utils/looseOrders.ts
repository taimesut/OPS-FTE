export const LOOSE_ORDER_SEARCH_PATH =
  "/api/fleet_order/order/tracking_list/search";

export const DEFAULT_LOOSE_ORDER_PAYLOAD = {
  count: 1000,
  current_station_ids: "1030",
  next_station_ids: "1069",
  order_status: "8",
  page_no: 1,
} as const;

export interface LooseOrderSummary {
  total: number;
  dgCount: number;
  highValueCount: number;
}

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null ? (value as JsonObject) : null;

const isNonZeroNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value !== 0;

export const summarizeLooseOrderResponse = (
  payload: unknown,
): LooseOrderSummary => {
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

  const list = Array.isArray(data.list) ? data.list : [];
  let dgCount = 0;
  let highValueCount = 0;

  for (const value of list) {
    const item = asObject(value);
    if (!item) continue;
    if (isNonZeroNumber(item.dg_type)) dgCount += 1;
    if (isNonZeroNumber(item.high_value)) highValueCount += 1;
  }

  return {
    total:
      typeof data.total === "number" && Number.isFinite(data.total)
        ? data.total
        : list.length,
    dgCount,
    highValueCount,
  };
};
