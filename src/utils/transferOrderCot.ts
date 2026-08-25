type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;

const successfulData = (payload: unknown, fallback: string): UnknownRecord => {
  const root = asRecord(payload);
  if (!root) throw new Error(fallback);
  if (root.retcode !== 0) {
    const message =
      typeof root.message === "string" && root.message.trim()
        ? root.message.trim()
        : fallback;
    throw new Error(message);
  }
  const data = asRecord(root.data);
  if (!data) throw new Error(fallback);
  return data;
};

export const buildTransferOrderDetailPath = (toNumber: string): string =>
  `/api/in-station/general_to/detail/search?to_number=${encodeURIComponent(toNumber.trim())}&pageno=1&count=10`;

export const buildShipmentTrackingPath = (shipmentId: string): string =>
  `/api/fleet_order/order/detail/tracking_info?shipment_id=${encodeURIComponent(shipmentId.trim())}`;

export const parseFirstFleetOrderId = (payload: unknown): string => {
  const data = successfulData(payload, "Phản hồi chi tiết TO không hợp lệ.");
  const first = Array.isArray(data.list) ? asRecord(data.list[0]) : null;
  const shipmentId = String(first?.fleet_order_id ?? "").trim();
  if (!shipmentId) throw new Error("TO không có đơn đại diện.");
  return shipmentId;
};

const visitTrackingNode = (
  value: unknown,
  latest: { timestamp: number },
): void => {
  const node = asRecord(value);
  if (!node) return;
  if (
    node.status === 882 &&
    typeof node.timestamp === "number" &&
    Number.isSafeInteger(node.timestamp)
  ) {
    latest.timestamp = Math.max(latest.timestamp, node.timestamp);
  }
  for (const key of ["children", "event_children"] as const) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) visitTrackingNode(child, latest);
    }
  }
};

export const parseLatestStatus882Timestamp = (payload: unknown): number => {
  const data = successfulData(payload, "Phản hồi hành trình đơn không hợp lệ.");
  const latest = { timestamp: -1 };
  if (Array.isArray(data.tracking_list)) {
    for (const item of data.tracking_list) visitTrackingNode(item, latest);
  }
  if (latest.timestamp < 0) throw new Error("Không tìm thấy trạng thái 882.");
  return latest.timestamp;
};

export interface CotTransferOrder {
  to_number: string;
}

export type CotProgressHandler = (processed: number, total: number) => void;

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "Lỗi không xác định";

export const filterTransferOrdersByCot = async <T extends CotTransferOrder>(
  orders: readonly T[],
  cotTimestamp: number,
  loadLatest882: (toNumber: string) => Promise<number>,
  onProgress?: CotProgressHandler,
  concurrency = 5,
): Promise<T[]> => {
  if (!Number.isSafeInteger(cotTimestamp)) {
    throw new Error("Thời gian COT không hợp lệ.");
  }
  const workerCount = Math.min(
    orders.length,
    Math.max(1, Math.min(5, Math.floor(concurrency) || 1)),
  );
  const retained = new Array<boolean>(orders.length).fill(false);
  const failures: Error[] = [];
  let cursor = 0;
  let processed = 0;

  const worker = async () => {
    while (failures.length === 0) {
      const index = cursor;
      cursor += 1;
      if (index >= orders.length) return;
      const order = orders[index];
      try {
        const latest882 = await loadLatest882(order.to_number);
        retained[index] = latest882 <= cotTimestamp;
      } catch (error) {
        failures.push(
          new Error(
            `Không thể kiểm tra COT cho ${order.to_number}: ${errorMessage(error)}`,
          ),
        );
      } finally {
        processed += 1;
        onProgress?.(processed, orders.length);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failures[0]) throw failures[0];
  return orders.filter((_, index) => retained[index]);
};
