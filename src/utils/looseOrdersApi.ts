import apiClient from "./apiClient";
import {
  DEFAULT_LOOSE_ORDER_PAYLOAD,
  LOOSE_ORDER_SEARCH_PATH,
  summarizeLooseOrderResponse,
  type LooseOrderSummary,
} from "./looseOrders";

export const fetchLooseOrderSummary = async (): Promise<LooseOrderSummary> => {
  const response = await apiClient.post(
    LOOSE_ORDER_SEARCH_PATH,
    DEFAULT_LOOSE_ORDER_PAYLOAD,
  );

  return summarizeLooseOrderResponse(response.data);
};
