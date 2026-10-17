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

interface CotTrackingTimestamps {
  status887: number;
  status882: number;
}

const visitTrackingNode = (
  value: unknown,
  latest: CotTrackingTimestamps,
): void => {
  const node = asRecord(value);
  if (!node) return;

  if (
    typeof node.timestamp === "number" &&
    Number.isSafeInteger(node.timestamp)
  ) {
    if (node.status === 887) {
      latest.status887 = Math.max(latest.status887, node.timestamp);
    } else if (node.status === 882) {
      latest.status882 = Math.max(latest.status882, node.timestamp);
    }
  }

  for (const key of ["children", "event_children"] as const) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) visitTrackingNode(child, latest);
    }
  }
};

/**
 * Mốc COT cho TO đã đóng bao:
 * 1. Ưu tiên trạng thái 887 (Return_SOC_LHArrived). Nếu có nhiều 887, lấy 887 mới nhất.
 * 2. Chỉ khi không có 887 mới fallback sang trạng thái 882 mới nhất.
 */
export const parsePreferredCotTimestamp = (payload: unknown): number => {
  const data = successfulData(payload, "Phản hồi hành trình đơn không hợp lệ.");
  const latest: CotTrackingTimestamps = { status887: -1, status882: -1 };

  if (Array.isArray(data.tracking_list)) {
    for (const item of data.tracking_list) visitTrackingNode(item, latest);
  }

  if (latest.status887 >= 0) return latest.status887;
  if (latest.status882 >= 0) return latest.status882;

  throw new Error("Không tìm thấy trạng thái 887 hoặc 882.");
};

// Giữ export cũ để không làm hỏng các caller cũ; logic hiện tại đã ưu tiên 887.
export const parseLatestStatus882Timestamp = parsePreferredCotTimestamp;

export interface CotTransferOrder {
  to_number: string;
}

export type CotProgressHandler = (processed: number, total: number) => void;

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "Lỗi không xác định";

export const filterTransferOrdersByCot = async <T extends CotTransferOrder>(
  orders: readonly T[],
  cotTimestamp: number,
  loadCotTimestamp: (toNumber: string) => Promise<number>,
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
        const selectedCotTimestamp = await loadCotTimestamp(order.to_number);
        retained[index] = selectedCotTimestamp <= cotTimestamp;
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
