export const INCIDENT_REASONS = [
  "Rách",
  "Bung seal",
  "Không TO",
  "Thiếu",
  "Bể vỡ",
  "Dư",
  "Khác",
] as const;

export type IncidentReason = (typeof INCIDENT_REASONS)[number];
export type IncidentSource = "auto" | "manual";

export interface TripSummary {
  id: number;
  tripNumber: string;
  tripName: string;
  tripDate: number;
  tripStatus: number;
  driverName: string;
  secondDriverName: string;
  vehicleNumber: string;
  vehicleTypeName: string;
  agencyName: string;
  displayStationSequence: number;
}

export interface TripDetails {
  id: number;
  tripNumber: string;
  tripName: string;
  tripDate: number;
  tripTypeName: string;
  driverName: string;
  secondDriverName: string;
  vehicleNumber: string;
  vehicleTypeName: string;
  agencyName: string;
  sealCodes: string[];
  remark: string;
  operator: string;
  expectedQuantity: number | null;
}

export interface IncidentItem {
  id: string;
  code: string;
  reasons: IncidentReason[];
  sources: IncidentSource[];
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const responseData = (payload: unknown, label: string): JsonRecord => {
  if (!isRecord(payload) || payload.retcode !== 0) {
    const message = isRecord(payload) ? text(payload.message) : "";
    throw new Error(message || `${label}: response không hợp lệ.`);
  }
  if (!isRecord(payload.data)) {
    throw new Error(`${label}: thiếu data.`);
  }
  return payload.data;
};

export const normalizeSearchTerm = (raw: string): string =>
  raw.trim().toUpperCase();

export const createTripSearchPath = (raw: string): string => {
  const value = normalizeSearchTerm(raw);
  if (!value) {
    throw new Error("Vui lòng nhập LH Trip hoặc biển số xe.");
  }

  const query = new URLSearchParams({ station_type: "2" });
  query.set(value.startsWith("LT") ? "trip_number" : "plate_number", value);
  query.set("pageno", "1");
  query.set("count", "24");
  query.set("query_type", "1");
  query.set("tab_type", "1");
  return `/api/admin/transportation/trip/list_v2?${query.toString()}`;
};

const parseTripSummary = (value: unknown): TripSummary => {
  if (!isRecord(value)) {
    throw new Error("Trip item không hợp lệ.");
  }

  const id = finiteNumber(value.id);
  const sequence = finiteNumber(value.display_station_sequence);
  if (id === null || !Number.isInteger(id) || id <= 0) {
    throw new Error("Trip id không hợp lệ.");
  }
  if (sequence === null || !Number.isInteger(sequence) || sequence < 0) {
    throw new Error("Trip display sequence không hợp lệ.");
  }

  return {
    id,
    tripNumber: text(value.trip_number),
    tripName: text(value.trip_name),
    tripDate: finiteNumber(value.trip_date) ?? 0,
    tripStatus: finiteNumber(value.trip_status) ?? 0,
    driverName: text(value.driver_name),
    secondDriverName: text(value.second_driver_name),
    vehicleNumber: text(value.vehicle_number),
    vehicleTypeName: text(value.vehicle_type_name),
    agencyName: text(value.agency_name),
    displayStationSequence: sequence,
  };
};

export const parseTripSearchResponse = (payload: unknown): TripSummary[] => {
  const data = responseData(payload, "Tìm chuyến");
  if (!Array.isArray(data.list)) {
    throw new Error("Tìm chuyến: list không hợp lệ.");
  }
  return data.list.map(parseTripSummary);
};

export const createTripDetailPath = (tripId: number): string => {
  if (!Number.isInteger(tripId) || tripId <= 0) {
    throw new Error("Trip id không hợp lệ.");
  }
  const query = new URLSearchParams({
    trip_id: String(tripId),
    new_process_switch: "false",
  });
  return `/api/admin/transportation/trip/detail_v2?${query.toString()}`;
};

export const parseTripDetailResponse = (payload: unknown): TripDetails => {
  const data = responseData(payload, "Chi tiết chuyến");
  const id = finiteNumber(data.id);
  if (id === null || !Number.isInteger(id) || id <= 0) {
    throw new Error("Chi tiết chuyến: id không hợp lệ.");
  }

  const sealCodes = [
    text(data.seal_code),
    ...(Array.isArray(data.seal_code_list)
      ? data.seal_code_list.map(text)
      : []),
  ].filter(
    (value, index, values) =>
      Boolean(value) && values.indexOf(value) === index,
  );
  const expected = finiteNumber(data.remark_loading_quantity);

  return {
    id,
    tripNumber: text(data.trip_number),
    tripName: text(data.trip_name),
    tripDate: finiteNumber(data.trip_date) ?? 0,
    tripTypeName: text(data.trip_type_name),
    driverName: text(data.driver_name),
    secondDriverName: text(data.second_driver_name),
    vehicleNumber: text(data.vehicle_number),
    vehicleTypeName: text(data.vehicle_type_name),
    agencyName: text(data.agency_name),
    sealCodes,
    remark: text(data.remark),
    operator: text(data.operator),
    expectedQuantity: expected !== null && expected >= 0 ? expected : null,
  };
};

export type LoadingKind = "pending" | "inbound";

export interface LoadingPage {
  pageNo: number;
  count: number;
  total: number;
  codes: string[];
  invalidCount: number;
  rawItemCount: number;
}

export const extractLoadingCode = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  const code = text(value.scan_number) || text(value.to_number);
  return code ? code.toUpperCase() : null;
};

export const createLoadingPath = (
  kind: LoadingKind,
  tripId: number,
  sequence: number,
  pageNo: number,
): string => {
  if (!Number.isInteger(tripId) || tripId <= 0) {
    throw new Error("Trip id không hợp lệ.");
  }
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("Display sequence không hợp lệ.");
  }
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    throw new Error("Số trang không hợp lệ.");
  }

  const query = new URLSearchParams({
    trip_id: String(tripId),
    pageno: String(pageNo),
    count: "24",
  });
  if (kind === "pending") {
    query.set("unloaded_sequence_number", String(sequence));
    query.set("actual_unloaded_sequence_number", "0");
    query.set("type", "pending");
  } else {
    query.set("actual_unloaded_sequence_number", String(sequence));
    query.set("type", "inbound");
    query.set("unload_list_type", "2");
  }
  return `/api/admin/transportation/trip/loading/list?${query.toString()}`;
};

export const parseLoadingPage = (payload: unknown): LoadingPage => {
  const data = responseData(payload, "Danh sách kiện");
  const pageNo = finiteNumber(data.pageno);
  const count = finiteNumber(data.count);
  const total = finiteNumber(data.total);
  if (pageNo === null || !Number.isInteger(pageNo) || pageNo < 1) {
    throw new Error("Danh sách kiện: pageno không hợp lệ.");
  }
  if (count === null || !Number.isInteger(count) || count < 1) {
    throw new Error("Danh sách kiện: count không hợp lệ.");
  }
  if (total === null || !Number.isInteger(total) || total < 0) {
    throw new Error("Danh sách kiện: total không hợp lệ.");
  }
  if (!Array.isArray(data.list)) {
    throw new Error("Danh sách kiện: list không hợp lệ.");
  }

  const codes: string[] = [];
  let invalidCount = 0;
  for (const item of data.list) {
    const code = extractLoadingCode(item);
    if (code) codes.push(code);
    else invalidCount += 1;
  }

  return {
    pageNo,
    count,
    total,
    codes,
    invalidCount,
    rawItemCount: data.list.length,
  };
};
