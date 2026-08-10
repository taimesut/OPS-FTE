import apiClient from "./apiClient";
import {
  createTransferOrderLookupPayload,
  parseTransferOrderLookupResponse,
  TRANSFER_ORDER_LOOKUP_PATH,
  type TransferOrderLookupResult,
} from "./transferOrderLookup";

export const fetchTransferOrderNumber = async (
  shipmentId: string,
): Promise<TransferOrderLookupResult> => {
  const payload = createTransferOrderLookupPayload(shipmentId);
  const response = await apiClient.post(TRANSFER_ORDER_LOOKUP_PATH, payload, {
    suppressErrorToast: true,
  });

  return parseTransferOrderLookupResponse(response.data, payload.shipment_id);
};
