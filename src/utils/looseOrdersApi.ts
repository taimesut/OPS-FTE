import apiClient from "./apiClient";
import {
  createLooseOrderPayload,
  LOOSE_ORDER_SEARCH_PATH,
  summarizeLooseOrderResponse,
  type LooseOrderSummary,
} from "./looseOrders";

export const fetchLooseOrderSummary = async (
  currentStationId: string,
  nextStationIds: string[],
): Promise<LooseOrderSummary> => {
  const response = await apiClient.post(
    LOOSE_ORDER_SEARCH_PATH,
    createLooseOrderPayload(currentStationId, nextStationIds),
    { suppressErrorToast: true },
  );

  return summarizeLooseOrderResponse(response.data);
};
