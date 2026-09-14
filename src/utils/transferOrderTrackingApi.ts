import apiClient from "./apiClient";
import {
  buildShipmentTrackingPath,
  buildTransferOrderDetailPath,
  parseFirstFleetOrderId,
} from "./transferOrderCot";
import {
  parseTransferOrderTrackingResponse,
  type TransferOrderTrackingResult,
} from "./transferOrderTracking";

export type TrackingGetRequest = (path: string) => Promise<{ data: unknown }>;

const defaultGet: TrackingGetRequest = async (path) =>
  apiClient.get(path, { suppressErrorToast: true });

export const fetchTransferOrderTracking = async (
  toNumber: string,
  get: TrackingGetRequest = defaultGet,
): Promise<TransferOrderTrackingResult> => {
  const normalizedToNumber = toNumber.trim();
  if (!normalizedToNumber) throw new Error("Mã TO không hợp lệ.");

  const detailResponse = await get(buildTransferOrderDetailPath(normalizedToNumber));
  const shipmentId = parseFirstFleetOrderId(detailResponse.data);
  const trackingResponse = await get(buildShipmentTrackingPath(shipmentId));
  const events = parseTransferOrderTrackingResponse(trackingResponse.data);

  return {
    toNumber: normalizedToNumber,
    shipmentId,
    events,
  };
};
