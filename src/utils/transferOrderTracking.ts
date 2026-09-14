import { getTrackingStatusName } from "./trackingStatusMap.ts";

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
  statusName: string;
  timestamp: number | null;
  title: string;
  description: string;
  location: string;
  stationId: string;
  operator: string;
  workstation: string;
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

export type TrackingFlow =
  | "Khởi tạo"
  | "Inbound"
  | "Đóng bao"
  | "Linehaul"
  | "Phân loại"
  | "Pickup"
  | "Delivery"
  | "Return"
  | "Exception"
  | "Event hệ thống"
  | "Khác";

export interface TransferOrderTrackingFlowGroup {
  flow: TrackingFlow;
  events: TransferOrderTrackingEvent[];
}

export interface TransferOrderTrackingStationGroup {
  stationKey: string;
  stationName: string;
  stationId: string;
  flows: TransferOrderTrackingFlowGroup[];
  firstTimestamp: number | null;
  lastTimestamp: number | null;
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

const WORKSTATION_KEYS = [
  "workstation",
  "workstation_name",
  "work_station",
  "work_station_name",
] as const;

const wrapperOnlyStatuses = new Set(["-1", "-2"]);

interface InheritedTrackingContext {
  location: string;
  stationId: string;
}

const collectTrackingEvents = (
  value: unknown,
  events: TransferOrderTrackingEvent[],
  source: "tracking" | "event" = "tracking",
  inherited: InheritedTrackingContext = { location: "", stationId: "" },
): void => {
  const record = asRecord(value);
  if (!record) return;

  const rawStatus = firstText(record, ["status", "status_code", "code"]);
  const eventCode = firstText(record, ["event_code"]);
  const timestamp = parseTimestamp(record);
  const message = firstText(record, ["message"]);
  const displayName = firstText(record, DISPLAY_NAME_KEYS);
  const rawDescription = firstText(record, DESCRIPTION_KEYS);
  const ownLocation = firstText(record, LOCATION_KEYS);
  const ownStationId = firstText(record, ["station_id"]);
  const location = ownLocation || inherited.location;
  const stationId = ownStationId || inherited.stationId;
  const operator = firstText(record, ["operator", "biz_staff_name"]);
  const workstation = firstText(record, WORKSTATION_KEYS);
  const tags = parseStringList(record.tags);
  const photoUrls = parseStringList(record.photo_url);

  const status = wrapperOnlyStatuses.has(rawStatus) ? "" : rawStatus;
  const mappedStatusName = status ? getTrackingStatusName(status) : "";
  const statusName = displayName || mappedStatusName;
  const title =
    message ||
    rawDescription ||
    statusName ||
    (status ? `Trạng thái ${status}` : eventCode || "Cập nhật hành trình");

  const secondaryParts = [rawDescription].filter(
    (part, index, parts) => part && part !== title && parts.indexOf(part) === index,
  );
  const description = secondaryParts.join(" · ");

  const hasSemanticOwnEvent = Boolean(
    status ||
      message ||
      displayName ||
      rawDescription ||
      operator ||
      workstation ||
      eventCode ||
      tags.length ||
      photoUrls.length,
  );

  if (hasSemanticOwnEvent) {
    events.push({
      status,
      statusName,
      timestamp,
      title,
      description,
      location,
      stationId,
      operator,
      workstation,
      tags,
      eventCode,
      photoUrls,
      source,
    });
  }

  const childContext = { location, stationId };

  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      collectTrackingEvents(child, events, "tracking", childContext);
    }
  }

  const eventChildren = record.event_children;
  if (Array.isArray(eventChildren)) {
    for (const child of eventChildren) {
      collectTrackingEvents(child, events, "event", childContext);
    }
  }
};

const eventIdentity = (event: TransferOrderTrackingEvent): string =>
  [
    event.status,
    event.statusName,
    event.eventCode,
    event.timestamp ?? "",
    event.title,
    event.description,
    event.location,
    event.stationId,
    event.operator,
    event.workstation,
    event.tags.join(","),
    event.photoUrls.join(","),
  ].join("|");

const inferStationFromMessage = (event: TransferOrderTrackingEvent): string => {
  const text = `${event.title} ${event.description}`;
  const match = /(?:arrived|unloading|unloaded)\s+at\s+\[([^\]]+)\]/i.exec(text);
  return match?.[1]?.trim() ?? "";
};

export const getTrackingFlow = (
  event: TransferOrderTrackingEvent,
): TrackingFlow => {
  if (event.source === "event") return "Event hệ thống";

  const name = event.statusName || "";
  if (name === "Created" || name.endsWith("_Created")) return "Khởi tạo";
  if (/Return/i.test(name)) return "Return";
  if (/Exception|Onhold|On_Hold|Holding|Damaged|Lost|Missing|Intercept/i.test(name)) {
    return "Exception";
  }
  if (/Deliver/i.test(name)) return "Delivery";
  if (/Pickup|Collection/i.test(name)) return "Pickup";
  if (/LH(?:Packing|Packed|Transporting|Transported|Arrived|Unloading|Unloaded)/i.test(name)) {
    return "Linehaul";
  }
  if (/PendingReceive|Received|Manifest_Received|Inbound/i.test(name)) return "Inbound";
  if (/Packing|Packed|Container_Pack|Cache_Pack|Handover_Pack/i.test(name)) {
    return "Đóng bao";
  }
  if (/Sorting|Sorted|Staging|Stage_Out|Weighing/i.test(name)) return "Phân loại";
  return "Khác";
};

const timestampOr = (event: TransferOrderTrackingEvent, fallback: number): number =>
  event.timestamp ?? fallback;

export const groupTransferOrderTrackingByStationAndFlow = (
  events: TransferOrderTrackingEvent[],
): TransferOrderTrackingStationGroup[] => {
  const chronological = [...events].sort((left, right) => {
    const leftTime = timestampOr(left, Number.MAX_SAFE_INTEGER);
    const rightTime = timestampOr(right, Number.MAX_SAFE_INTEGER);
    return leftTime - rightTime;
  });

  const groups: TransferOrderTrackingStationGroup[] = [];
  let currentStationName = "";
  let currentStationId = "";
  let currentGroup: TransferOrderTrackingStationGroup | null = null;

  const openStationGroup = (
    stationName: string,
    stationId: string,
    timestamp: number | null,
  ): TransferOrderTrackingStationGroup => {
    const normalizedName = stationName || (stationId ? `Station ID ${stationId}` : "Khởi tạo");
    const group: TransferOrderTrackingStationGroup = {
      stationKey: `${normalizedName}|${stationId}|${groups.length}`,
      stationName: normalizedName,
      stationId,
      flows: [],
      firstTimestamp: timestamp,
      lastTimestamp: timestamp,
    };
    groups.push(group);
    return group;
  };

  for (const event of chronological) {
    const inferredStation = inferStationFromMessage(event);
    const explicitStationName = event.location || inferredStation;
    const explicitStationId = event.stationId;

    if (explicitStationName || explicitStationId) {
      const stationChanged =
        !currentGroup ||
        (explicitStationName && explicitStationName !== currentStationName) ||
        (explicitStationId && currentStationId && explicitStationId !== currentStationId);

      if (stationChanged) {
        currentStationName = explicitStationName || currentStationName;
        currentStationId = explicitStationId || "";
        currentGroup = openStationGroup(
          currentStationName,
          currentStationId,
          event.timestamp,
        );
      } else {
        currentStationName = explicitStationName || currentStationName;
        currentStationId = explicitStationId || currentStationId;
      }
    }

    if (!currentGroup) {
      currentGroup = openStationGroup("", "", event.timestamp);
    }

    const flow = getTrackingFlow(event);
    let flowGroup = currentGroup.flows[currentGroup.flows.length - 1];
    if (!flowGroup || flowGroup.flow !== flow) {
      flowGroup = { flow, events: [] };
      currentGroup.flows.push(flowGroup);
    }
    flowGroup.events.push(event);

    if (
      currentGroup.firstTimestamp === null ||
      (event.timestamp !== null && event.timestamp < currentGroup.firstTimestamp)
    ) {
      currentGroup.firstTimestamp = event.timestamp;
    }
    if (
      currentGroup.lastTimestamp === null ||
      (event.timestamp !== null && event.timestamp > currentGroup.lastTimestamp)
    ) {
      currentGroup.lastTimestamp = event.timestamp;
    }
  }

  return groups;
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
