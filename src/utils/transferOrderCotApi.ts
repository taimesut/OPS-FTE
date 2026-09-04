import apiClient from "./apiClient";
import {
  buildShipmentTrackingPath,
  buildTransferOrderDetailPath,
  parseFirstFleetOrderId,
  parseLatestStatus882Timestamp,
} from "./transferOrderCot";

export type CotGetRequest = (path: string) => Promise<{ data: unknown }>;

const defaultGet: CotGetRequest = async (path) =>
  apiClient.get(path, { suppressErrorToast: true });

/**
 * Với mỗi TO:
 * 1. Lấy chi tiết TO và chọn fleet_order_id đầu tiên trong data.list.
 * 2. Lấy tracking của shipment đó.
 * 3. Trả về timestamp lớn nhất của trạng thái 882 để so với mốc COT.
 */
export const fetchLatestTransferOrderCotTimestamp = async (
  toNumber: string,
  get: CotGetRequest = defaultGet,
): Promise<number> => {
  const detailResponse = await get(buildTransferOrderDetailPath(toNumber));
  const shipmentId = parseFirstFleetOrderId(detailResponse.data);
  const trackingResponse = await get(buildShipmentTrackingPath(shipmentId));
  return parseLatestStatus882Timestamp(trackingResponse.data);
};
