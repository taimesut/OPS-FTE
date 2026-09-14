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

const normalizeTimestamp = (value: unknown): number | null => {
  let parsed: number | null = null;

  if (typeof value === "number" && Number.isFinite(value)) {
    parsed = value;
  } else if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) parsed = numeric;
  }

  if (parsed === null) return null;
  return parsed > 1_000_000_000_000 ? Math.floor(parsed / 1000) : parsed;
};

const parseTimestamp = (record: UnknownRecord): number | null => {
  const candidates = [
    record.timestamp,
    record.track_time,
    record.track_time_ms,
    record.create_time,
    record.ctime,
    record.time,
  ];

  for (const value of candidates) {
    const timestamp = normalizeTimestamp(value);
    if (timestamp !== null) return timestamp;
  }

  return null;
};

const parseStringList = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

export interface TransferOrderTrackingEvent {
  status: string;
  timestamp: number | null;
  title: string;
  description: string;
  location: string;
  stationId: string;
  operator: string;
  tags: string[];
  eventCode: string;
  photoUrls: string[];
  source: "tracking" | "event";
}

export interface TransferOrderTrackingResult {
  toNumber: string;
  shipmentId: string;
  events: TransferOrderTrackingEvent[];
}

const DISPLAY_NAME_KEYS = [
  "status_name",
  "status_text",
  "tracking_status",
  "display_name",
  "event_name",
  "event_title",
  "title",
] as const;

const DESCRIPTION_KEYS = [
  "description",
  "content",
  "remark",
  "reason",
  "event_description",
  "on_hold_reason",
] as const;

const LOCATION_KEYS = [
  "station_name",
  "current_station_name",
  "location_name",
  "location",
  "hub_name",
  "site_name",
] as const;

const wrapperOnlyStatuses = new Set(["-1", "-2"]);

const collectTrackingEvents = (
  value: unknown,
  events: TransferOrderTrackingEvent[],
  source: "tracking" | "event" = "tracking",
): void => {
  const record = asRecord(value);
  if (!record) return;

  const rawStatus = firstText(record, ["status", "status_code", "code"]);
  const eventCode = firstText(record, ["event_code"]);
  const timestamp = parseTimestamp(record);
  const message = firstText(record, ["message"]);
  const displayName = firstText(record, DISPLAY_NAME_KEYS);
  const rawDescription = firstText(record, DESCRIPTION_KEYS);
  const location = firstText(record, LOCATION_KEYS);
  const stationId = firstText(record, ["station_id"]);
  const operator = firstText(record, ["operator", "biz_staff_name"]);
  const tags = parseStringList(record.tags);
  const photoUrls = parseStringList(record.photo_url);

  const status = wrapperOnlyStatuses.has(rawStatus) ? "" : rawStatus;
  const title =
    message ||
    displayName ||
    rawDescription ||
    (status ? `Trạng thái ${status}` : eventCode || "Cập nhật hành trình");

  const secondaryParts = [displayName, rawDescription].filter(
    (part, index, parts) => part && part !== title && parts.indexOf(part) === index,
  );
  const description = secondaryParts.join(" · ");

  // SPX dùng status -1/-2 làm record trung gian chỉ để chứa event_children.
  // Không render record rỗng đó, nhưng vẫn render event_children bên dưới.
  const hasSemanticOwnEvent = Boolean(
    status ||
      message ||
      displayName ||
      rawDescription ||
      location ||
      operator ||
      eventCode ||
      tags.length ||
      photoUrls.length,
  );

  if (hasSemanticOwnEvent) {
    events.push({
      status,
      timestamp,
      title,
      description,
      location,
      stationId,
      operator,
      tags,
      eventCode,
      photoUrls,
      source,
    });
  }

  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) collectTrackingEvents(child, events, "tracking");
  }

  const eventChildren = record.event_children;
  if (Array.isArray(eventChildren)) {
    for (const child of eventChildren) collectTrackingEvents(child, events, "event");
  }
};

const eventIdentity = (event: TransferOrderTrackingEvent): string =>
  [
    event.status,
    event.eventCode,
    event.timestamp ?? "",
    event.title,
    event.description,
    event.location,
    event.stationId,
    event.operator,
    event.tags.join(","),
    event.photoUrls.join(","),
  ].join("|");

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

  const seen = new Set<string>();
  const uniqueEvents = events.filter((event) => {
    const key = eventIdentity(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
