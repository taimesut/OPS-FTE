import type { TransferOrder } from "../components/TOTable";
import type { BranchResult, HubDefinition } from "./internalHubOverview";
import type { LooseOrderSummary } from "./looseOrders";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

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
  const root = payload as { data?: { list?: unknown } } | null;
  const list = Array.isArray(root?.data?.list) ? root.data.list : [];

  return list.filter(
    (item): item is TransferOrder =>
      typeof item === "object" &&
      item !== null &&
      (item as { current_station_name?: unknown }).current_station_name === soc,
  );
};

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : "Không thể tải dữ liệu.";

export interface HubBranchResults {
  loose: BranchResult<LooseOrderSummary>;
  packed: BranchResult<TransferOrder[]>;
}

export const fetchHubOverviewBranches = async (
  soc: string,
  socId: string,
  hub: HubDefinition,
  nowSeconds: number,
): Promise<HubBranchResults> => {
  const [{ default: apiClient }, { fetchLooseOrderSummary }] = await Promise.all([
    import("./apiClient.ts"),
    import("./looseOrdersApi.ts"),
  ]);
  const [packed, loose] = await Promise.allSettled([
    apiClient.get(createPackedOrdersSearchPath(hub.name, nowSeconds), {
      suppressErrorToast: true,
    }),
    fetchLooseOrderSummary(socId, [hub.id]),
  ]);

  return {
    packed:
      packed.status === "fulfilled"
        ? { ok: true, data: parsePackedOrdersForSoc(packed.value.data, soc) }
        : { ok: false, error: errorMessage(packed.reason) },
    loose:
      loose.status === "fulfilled"
        ? { ok: true, data: loose.value }
        : { ok: false, error: errorMessage(loose.reason) },
  };
};
