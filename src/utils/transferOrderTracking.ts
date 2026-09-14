type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;

const firstText = (record: UnknownRecord, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
};

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export interface TransferOrderTrackingEvent {
  status: string;
  timestamp: number | null;
  title: string;
  description: string;
  location: string;
}

export interface TransferOrderTrackingResult {
  toNumber: string;
  shipmentId: string;
  events: TransferOrderTrackingEvent[];
}

const TITLE_KEYS = [
  "status_name",
  "status_text",
  "tracking_status",
  "display_status",
  "event_name",
  "event_title",
  "title",
  "message",
] as const;

const DESCRIPTION_KEYS = [
  "description",
  "content",
  "remark",
  "reason",
  "event_description",
] as const;

const LOCATION_KEYS = [
  "station_name",
  "current_station_name",
  "location_name",
  "location",
  "hub_name",
  "site_name",
] as const;

const collectTrackingEvents = (
  value: unknown,
  events: TransferOrderTrackingEvent[],
): void => {
  const record = asRecord(value);
  if (!record) return;

  const status = firstText(record, ["status", "status_code", "event_code", "code"]);
  const timestamp = parseTimestamp(
    record.timestamp ?? record.create_time ?? record.ctime ?? record.time,
  );
  const explicitTitle = firstText(record, TITLE_KEYS);
  const description = firstText(record, DESCRIPTION_KEYS);
  const location = firstText(record, LOCATION_KEYS);
  const title =
    explicitTitle ||
    description ||
    (status ? `Trạng thái ${status}` : "Cập nhật hành trình");

  const hasOwnEvent = Boolean(
    status || timestamp !== null || explicitTitle || description || location,
  );

  if (hasOwnEvent) {
    events.push({
      status,
      timestamp,
      title,
      description: description === title ? "" : description,
      location,
    });
  }

  for (const key of ["children", "event_children"] as const) {
    const children = record[key];
    if (!Array.isArray(children)) continue;
    for (const child of children) collectTrackingEvents(child, events);
  }
};

export const parseTransferOrderTrackingResponse = (
  payload: unknown,
): TransferOrderTrackingEvent[] => {
  const root = asRecord(payload);
  if (!root) throw new Error("Phản hồi tracking không hợp lệ.");

  if (root.retcode !== 0) {
    const message = firstText(root, ["message", "msg"]);
    throw new Error(message || "Không thể tải tracking của đơn đại diện.");
  }

  const data = asRecord(root.data);
  if (!data || !Array.isArray(data.tracking_list)) {
    throw new Error("Phản hồi tracking không có danh sách hành trình.");
  }

  const events: TransferOrderTrackingEvent[] = [];
  for (const item of data.tracking_list) collectTrackingEvents(item, events);

  const uniqueEvents = events.filter((event, index, source) => {
    const key = `${event.status}|${event.timestamp ?? ""}|${event.title}|${event.description}|${event.location}`;
    return (
      source.findIndex(
        (candidate) =>
          `${candidate.status}|${candidate.timestamp ?? ""}|${candidate.title}|${candidate.description}|${candidate.location}` === key,
      ) === index
    );
  });

  uniqueEvents.sort((left, right) => {
    if (left.timestamp === null && right.timestamp === null) return 0;
    if (left.timestamp === null) return 1;
    if (right.timestamp === null) return -1;
    return right.timestamp - left.timestamp;
  });

  if (uniqueEvents.length === 0) {
    throw new Error("Đơn đại diện chưa có dữ liệu tracking.");
  }

  return uniqueEvents;
};
