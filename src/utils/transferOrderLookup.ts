export const TRANSFER_ORDER_LOOKUP_PATH =
  "/api/fleet_order/order/tracking_list/search";

export interface TransferOrderLookupPayload {
  count: 24;
  page_no: 1;
  shipment_id: string;
}

export interface TransferOrderLookupResult {
  shipmentId: string;
  currentToNumber: string;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;

export const createTransferOrderLookupPayload = (
  shipmentId: string,
): TransferOrderLookupPayload => {
  const normalizedShipmentId = shipmentId.trim();
  if (!normalizedShipmentId) {
    throw new Error("Vui lòng nhập mã đơn hàng.");
  }

  return {
    count: 24,
    page_no: 1,
    shipment_id: normalizedShipmentId,
  };
};

export const parseTransferOrderLookupResponse = (
  response: unknown,
  requestedShipmentId: string,
): TransferOrderLookupResult => {
  const root = asRecord(response);
  if (!root) {
    throw new Error("Phản hồi tra cứu không hợp lệ.");
  }

  if (root.retcode !== 0) {
    const message =
      typeof root.message === "string" && root.message.trim()
        ? root.message.trim()
        : "Không thể tra cứu mã TO.";
    throw new Error(message);
  }

  const data = asRecord(root.data);
  const list = Array.isArray(data?.list)
    ? data.list
        .map(asRecord)
        .filter((item): item is UnknownRecord => item !== null)
    : [];

  if (list.length === 0) {
    throw new Error("Không tìm thấy đơn hàng.");
  }

  const normalizedShipmentId = requestedShipmentId.trim();
  const exactItem = list.find(
    (item) =>
      String(item.shipment_id ?? "").trim() === normalizedShipmentId,
  );
  const item = exactItem ?? (list.length === 1 ? list[0] : undefined);

  if (!item) {
    throw new Error("Không tìm thấy đơn hàng.");
  }

  const currentToNumber = String(item.current_to_number ?? "").trim();
  if (!currentToNumber) {
    throw new Error("Đơn hàng chưa có mã TO.");
  }

  return {
    shipmentId: normalizedShipmentId,
    currentToNumber,
  };
};
