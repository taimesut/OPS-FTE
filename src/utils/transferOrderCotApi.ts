import apiClient from "./apiClient";
import {
  buildShipmentTrackingPath,
  buildTransferOrderDetailPath,
  parseFirstFleetOrderId,
  parseLatestStatus882Timestamp,
} from "./transferOrderCot";

export const fetchLatestTransferOrderCotTimestamp = async (
  toNumber: string,
): Promise<number> => {
  const detailResponse = await apiClient.get(
    buildTransferOrderDetailPath(toNumber),
    { suppressErrorToast: true },
  );
  const shipmentId = parseFirstFleetOrderId(detailResponse.data);
  const trackingResponse = await apiClient.get(
    buildShipmentTrackingPath(shipmentId),
    { suppressErrorToast: true },
  );
  return parseLatestStatus882Timestamp(trackingResponse.data);
};
