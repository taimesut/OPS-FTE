import {
  createLooseOrderPayload,
  createLooseOrderSummary,
  LOOSE_ORDER_CATEGORIES,
  LOOSE_ORDER_SEARCH_PATH,
  readLooseOrderTotal,
  type LooseOrderCategory,
  type LooseOrderSummary,
} from "./looseOrders.ts";

type LooseOrderPayload = ReturnType<typeof createLooseOrderPayload>;

export interface LooseOrderApiDependency {
  post(
    path: string,
    payload: LooseOrderPayload,
    options: { suppressErrorToast: true },
  ): Promise<{ data: unknown }>;
}

const loadApiDependency = async (): Promise<LooseOrderApiDependency> => {
  const { default: apiClient } = await import("./apiClient.ts");
  return {
    post: (path, payload, options) => apiClient.post(path, payload, options),
  };
};

export const fetchLooseOrderSummary = async (
  currentStationId: string,
  nextStationIds: string[],
  currentStationReceivedTime?: string,
  dependency?: LooseOrderApiDependency,
): Promise<LooseOrderSummary> => {
  const client = dependency ?? (await loadApiDependency());
  const entries = await Promise.all(
    LOOSE_ORDER_CATEGORIES.map(async (category) => {
      const response = await client.post(
        LOOSE_ORDER_SEARCH_PATH,
        createLooseOrderPayload(
          currentStationId,
          nextStationIds,
          category,
          currentStationReceivedTime,
        ),
        { suppressErrorToast: true },
      );
      return [category, readLooseOrderTotal(response.data)] as const;
    }),
  );

  return createLooseOrderSummary(
    Object.fromEntries(entries) as Record<LooseOrderCategory, number>,
  );
};
