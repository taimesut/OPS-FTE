import type { TransferOrder } from "../components/TOTable";
import type { BranchResult, HubDefinition } from "./internalHubOverview";
import type { LooseOrderSummary } from "./looseOrders";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isTransferOrder = (value: unknown): value is TransferOrder => {
  if (typeof value !== "object" || value === null) return false;

  const order = value as Record<string, unknown>;
  return (
    typeof order.to_number === "string" &&
    order.to_number.trim().length > 0 &&
    typeof order.sender === "string" &&
    typeof order.receiver === "string" &&
    typeof order.operator === "string" &&
    isFiniteNumber(order.quantity) &&
    isFiniteNumber(order.weight) &&
    typeof order.status === "string" &&
    isFiniteNumber(order.complete_time) &&
    typeof order.pack_name === "string" &&
    isFiniteNumber(order.high_value) &&
    Array.isArray(order.dg_type) &&
    order.dg_type.every(isFiniteNumber) &&
    typeof order.current_station_name === "string"
  );
};

export const createPackedOrdersSearchPath = (
  hubName: string,
  nowSeconds: number,
): string => {
  const from = nowSeconds - SEVEN_DAYS_SECONDS;
  return `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(hubName)}&status=2&ctime=${from},${nowSeconds}`;
};

export const parsePackedOrdersForSoc = (
  payload: unknown,
  soc: string,
): TransferOrder[] => {
  const root = payload as {
    retcode?: unknown;
    message?: unknown;
    data?: { list?: unknown };
  } | null;

  if (root?.retcode !== 0) {
    const serverMessage = root?.message;
    const message =
      typeof serverMessage === "string" && serverMessage.trim()
        ? serverMessage
        : "Dữ liệu packed không hợp lệ: retcode không thành công.";
    throw new Error(message);
  }

  if (!Array.isArray(root?.data?.list)) {
    throw new Error("Dữ liệu packed không hợp lệ: thiếu data.list.");
  }

  const matchingOrders = root.data.list.filter(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as { current_station_name?: unknown }).current_station_name === soc,
  );

  if (!matchingOrders.every(isTransferOrder)) {
    throw new Error(
      "Dữ liệu packed không hợp lệ: Transfer Order tại SOC bị thiếu hoặc sai trường bắt buộc.",
    );
  }

  return matchingOrders;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : "Không thể tải dữ liệu.";

export interface HubBranchResults {
  loose: BranchResult<LooseOrderSummary>;
  packed: BranchResult<TransferOrder[]>;
}

export interface HubOverviewApiDependencies {
  fetchPackedOrders(
    path: string,
    options: { suppressErrorToast: true },
  ): Promise<{ data: unknown }>;
  fetchLooseOrders(
    currentStationId: string,
    nextStationIds: string[],
  ): Promise<LooseOrderSummary>;
}

const loadDependencies = async (): Promise<HubOverviewApiDependencies> => {
  const [{ default: apiClient }, { fetchLooseOrderSummary }] = await Promise.all([
    import("./apiClient.ts"),
    import("./looseOrdersApi.ts"),
  ]);

  return {
    fetchPackedOrders: (path, options) => apiClient.get(path, options),
    fetchLooseOrders: fetchLooseOrderSummary,
  };
};

export const fetchHubOverviewBranches = async (
  soc: string,
  socId: string,
  hub: HubDefinition,
  nowSeconds: number,
  dependencies?: HubOverviewApiDependencies,
): Promise<HubBranchResults> => {
  const { fetchPackedOrders, fetchLooseOrders } =
    dependencies ?? (await loadDependencies());

  const packedRequest = fetchPackedOrders(
    createPackedOrdersSearchPath(hub.name, nowSeconds),
    { suppressErrorToast: true },
  ).then((response) => parsePackedOrdersForSoc(response.data, soc));
  const looseRequest = fetchLooseOrders(socId, [hub.id]);

  const [packed, loose] = await Promise.allSettled([
    packedRequest,
    looseRequest,
  ]);

  return {
    packed:
      packed.status === "fulfilled"
        ? { ok: true, data: packed.value }
        : { ok: false, error: errorMessage(packed.reason) },
    loose:
      loose.status === "fulfilled"
        ? { ok: true, data: loose.value }
        : { ok: false, error: errorMessage(loose.reason) },
  };
};
