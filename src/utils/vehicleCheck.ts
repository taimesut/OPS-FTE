import { normalizeVehicleStationName } from "./vehicleTravelTime.ts";

export const VEHICLE_CHECK_PATH =
  "/api/admin/transportation/trip/list_v2";
export const VEHICLE_CHECK_TARGET_STATION_CODE = "44SOCGL";
export const VEHICLE_CHECK_TARGET_STATION_NAME = "Pleiku SOC";
export const VEHICLE_CHECK_PAGE_SIZE = 50;
export const DEFAULT_VEHICLE_CHECK_HOURS = 8;
export const VEHICLE_CHECK_QUERY_DAY_SECONDS = 24 * 60 * 60;

export interface VehicleCheckWindow {
  from: number;
  to: number;
}

export interface VehicleCheckStation {
  sequenceNumber: number;
  stationId: number | null;
  stationCode: string;
  stationName: string;
  tripStationStatus: number;
  eta: number | null;
  etd: number | null;
  ata: number | null;
  atd: number | null;
  sta: number | null;
  std: number | null;
}

export type PleikuProcessStatus =
  | "unseal"
  | "arrival"
  | "pending"
  | "unloaded"
  | "other"
  | "not_arrived";

export type VehicleOperationalState =
  | "pleiku"
  | "moving"
  | "holding"
  | "unknown";

export interface VehicleCheckRow {
  tripId: number | null;
  tripNumber: string;
  tripName: string;
  vehiclePlateNumber: string;
  vehicleTypeName: string;
  agencyName: string;
  driverId: number;
  pendingInboundTo: number;
  pendingInboundOrder: number;
  stations: VehicleCheckStation[];
  pleikuStationIndex: number;
  pleikuStationStatus: number;
  pleikuProcessStatus: PleikuProcessStatus;
  pleikuProcessLabel: string;
  etaPleiku: number | null;
  operationalState: VehicleOperationalState;
  currentPositionLabel: string;
  currentStationName: string;
  nextStationName: string;
  referenceStationIndex: number | null;
}

export interface VehicleCheckPage {
  rows: VehicleCheckRow[];
  total: number;
  pageNo: number;
}

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const readPositiveInteger = (value: unknown): number | null => {
  const numeric = readNumber(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

const readTimestamp = (value: unknown): number | null => {
  const numeric = readNumber(value);
  if (numeric <= 0) return null;
  return numeric > 10_000_000_000
    ? Math.floor(numeric / 1_000)
    : Math.floor(numeric);
};

const resolvePlate = (trip: Record<string, unknown>): string => {
  if (Array.isArray(trip.vehicle_plate_number_list)) {
    const values = trip.vehicle_plate_number_list
      .map(readText)
      .filter(Boolean);
    if (values.length > 0) return values.join(", ");
  }
  return readText(trip.vehicle_number) || "—";
};

const parseStations = (trip: Record<string, unknown>): VehicleCheckStation[] => {
  if (!Array.isArray(trip.trip_station)) return [];

  return trip.trip_station
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((station, index) => ({
      sequenceNumber:
        readNumber(station.sequence_number) > 0
          ? readNumber(station.sequence_number)
          : index + 1,
      stationId: readPositiveInteger(station.station),
      stationCode: readText(station.station_code),
      stationName: readText(station.station_name) || "—",
      tripStationStatus: readNumber(station.trip_station_status),
      eta: readTimestamp(station.eta),
      etd: readTimestamp(station.etd),
      ata: readTimestamp(station.ata),
      atd: readTimestamp(station.atd),
      sta: readTimestamp(station.sta),
      std: readTimestamp(station.std),
    }))
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
};

export const mapPleikuStationStatus = (
  status: number,
): { process: PleikuProcessStatus; label: string } => {
  switch (status) {
    case 60:
      return { process: "unseal", label: "Unseal" };
    case 50:
      return { process: "arrival", label: "Arrival" };
    case 200:
      return { process: "pending", label: "Pending" };
    case 80:
      return { process: "unloaded", label: "Unloaded" };
    case 0:
      return { process: "not_arrived", label: "Chưa đến Pleiku" };
    default:
      return { process: "other", label: "Status " + status };
  }
};

interface OperationalResolution {
  state: VehicleOperationalState;
  label: string;
  currentStationName: string;
  nextStationName: string;
  referenceStationIndex: number | null;
}

export const resolveOperationalState = (
  stations: VehicleCheckStation[],
  pleikuIndex: number,
): OperationalResolution => {
  const pleiku = stations[pleikuIndex];
  if (!pleiku) {
    return {
      state: "unknown",
      label: "Không tìm thấy Pleiku SOC",
      currentStationName: "",
      nextStationName: "",
      referenceStationIndex: null,
    };
  }

  if (pleiku.tripStationStatus !== 0) {
    const mapped = mapPleikuStationStatus(pleiku.tripStationStatus);
    return {
      state: "pleiku",
      label: VEHICLE_CHECK_TARGET_STATION_NAME + " · " + mapped.label,
      currentStationName: VEHICLE_CHECK_TARGET_STATION_NAME,
      nextStationName:
        stations[pleikuIndex + 1]?.stationName || "",
      referenceStationIndex: pleikuIndex,
    };
  }

  for (let index = pleikuIndex - 1; index >= 0; index -= 1) {
    const station = stations[index];
    const status = station.tripStationStatus;

    if (status === 0) continue;

    if (status === 40) {
      const next = stations[index + 1];
      return {
        state: "moving",
        label:
          "Đang di chuyển " +
          station.stationName +
          " → " +
          (next?.stationName || VEHICLE_CHECK_TARGET_STATION_NAME),
        currentStationName: station.stationName,
        nextStationName:
          next?.stationName || VEHICLE_CHECK_TARGET_STATION_NAME,
        referenceStationIndex: index,
      };
    }

    return {
      state: "holding",
      label: station.stationName + " đang giữ xe",
      currentStationName: station.stationName,
      nextStationName: stations[index + 1]?.stationName || "",
      referenceStationIndex: index,
    };
  }

  return {
    state: "unknown",
    label: "Chưa xác định vị trí xe",
    currentStationName: "",
    nextStationName: "",
    referenceStationIndex: null,
  };
};

const getConfiguredMinutes = (
  stationName: string,
  routeMinutes: Record<string, number>,
): number | null => {
  const key = normalizeVehicleStationName(stationName);
  for (const [name, minutes] of Object.entries(routeMinutes)) {
    if (
      normalizeVehicleStationName(name) === key &&
      Number.isFinite(minutes) &&
      minutes > 0
    ) {
      return Math.round(minutes);
    }
  }
  return null;
};

export const resolvePleikuEta = (
  stations: VehicleCheckStation[],
  pleikuIndex: number,
  operational: OperationalResolution,
  routeMinutes: Record<string, number> = {},
): number | null => {
  const pleiku = stations[pleikuIndex];
  if (!pleiku) return null;

  // ETA trực tiếp của Pleiku luôn là nguồn ưu tiên khi xe chưa xử lý tại Pleiku.
  if (pleiku.tripStationStatus === 0 && pleiku.eta !== null) {
    return pleiku.eta;
  }

  if (
    pleiku.tripStationStatus !== 0 ||
    operational.referenceStationIndex === null
  ) {
    return null;
  }

  const station = stations[operational.referenceStationIndex];
  const travelMinutes = getConfiguredMinutes(
    station.stationName,
    routeMinutes,
  );
  if (travelMinutes === null) return null;

  let baseTime: number | null = null;
  if (operational.state === "moving") {
    baseTime = station.atd ?? station.etd ?? station.std;
  } else if (operational.state === "holding") {
    baseTime = station.etd ?? station.std;
  }

  return baseTime === null ? null : baseTime + travelMinutes * 60;
};

export const createVehicleCheckQueryWindow = (
  nowMs: number,
): VehicleCheckWindow => {
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    throw new Error("Thời gian hiện tại không hợp lệ.");
  }
  const nowSeconds = Math.floor(nowMs / 1_000);
  return {
    from: nowSeconds - VEHICLE_CHECK_QUERY_DAY_SECONDS,
    to: nowSeconds + VEHICLE_CHECK_QUERY_DAY_SECONDS,
  };
};

export const createVehicleCheckDisplayWindow = (
  nowMs: number,
  hours: number,
): VehicleCheckWindow => {
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    throw new Error("Thời gian hiện tại không hợp lệ.");
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Số giờ ETA phải lớn hơn 0.");
  }
  const from = Math.floor(nowMs / 1_000);
  return {
    from,
    to: from + Math.floor(hours * 60 * 60),
  };
};

export const createVehicleCheckParams = (
  window: VehicleCheckWindow,
  pageNo: number,
) => {
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    throw new Error("Trang dữ liệu không hợp lệ.");
  }

  return {
    station_type: "2,3,7,12,14,16,18",
    trip_station_status: "60,50,200,80",
    pageno: pageNo,
    count: VEHICLE_CHECK_PAGE_SIZE,
    query_type: 1,
    tab_type: 2,
    sta: String(window.from) + "," + String(window.to),
  };
};

export const isVehicleCheckRowVisible = (
  row: VehicleCheckRow,
  displayWindow: VehicleCheckWindow,
): boolean =>
  row.etaPleiku !== null &&
  row.etaPleiku >= displayWindow.from &&
  row.etaPleiku <= displayWindow.to;

export const parseVehicleCheckResponse = (
  payload: unknown,
  routeMinutes: Record<string, number> = {},
): VehicleCheckPage => {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Phản hồi Check xe không hợp lệ.");
  }

  const root = payload as {
    retcode?: unknown;
    message?: unknown;
    data?: unknown;
  };
  if (root.retcode !== 0) {
    throw new Error(
      readText(root.message) || "Không thể tải danh sách trip từ SPX.",
    );
  }
  if (typeof root.data !== "object" || root.data === null) {
    throw new Error("Phản hồi Check xe thiếu data.");
  }

  const data = root.data as {
    list?: unknown;
    total?: unknown;
    pageno?: unknown;
  };
  if (!Array.isArray(data.list)) {
    throw new Error("Phản hồi Check xe thiếu data.list.");
  }

  const rows = data.list
    .filter(
      (trip): trip is Record<string, unknown> =>
        typeof trip === "object" && trip !== null,
    )
    .filter(
      (trip) =>
        readNumber(trip.to_inbound_quantity) > 0 &&
        readNumber(trip.driver) !== 0,
    )
    .map((trip): VehicleCheckRow | null => {
      const stations = parseStations(trip);
      const pleikuStationIndex = stations.findIndex(
        (station) =>
          station.stationCode.toUpperCase() ===
          VEHICLE_CHECK_TARGET_STATION_CODE,
      );
      if (pleikuStationIndex < 0) return null;

      const pleiku = stations[pleikuStationIndex];
      const mapped = mapPleikuStationStatus(
        pleiku.tripStationStatus,
      );
      const operational = resolveOperationalState(
        stations,
        pleikuStationIndex,
      );
      const etaPleiku = resolvePleikuEta(
        stations,
        pleikuStationIndex,
        operational,
        routeMinutes,
      );

      return {
        tripId: readPositiveInteger(trip.id),
        tripNumber: readText(trip.trip_number) || "—",
        tripName: readText(trip.trip_name),
        vehiclePlateNumber: resolvePlate(trip),
        vehicleTypeName: readText(trip.vehicle_type_name) || "—",
        agencyName: readText(trip.agency_name) || "—",
        driverId: readNumber(trip.driver),
        pendingInboundTo: readNumber(trip.to_inbound_quantity),
        pendingInboundOrder: readNumber(trip.order_inbound_quantity),
        stations,
        pleikuStationIndex,
        pleikuStationStatus: pleiku.tripStationStatus,
        pleikuProcessStatus: mapped.process,
        pleikuProcessLabel: mapped.label,
        etaPleiku,
        operationalState: operational.state,
        currentPositionLabel: operational.label,
        currentStationName: operational.currentStationName,
        nextStationName: operational.nextStationName,
        referenceStationIndex: operational.referenceStationIndex,
      };
    })
    .filter((row): row is VehicleCheckRow => row !== null);

  return {
    rows,
    total: readNumber(data.total),
    pageNo:
      readNumber(data.pageno) > 0
        ? Math.floor(readNumber(data.pageno))
        : 1,
  };
};

export const getRouteLabel = (row: VehicleCheckRow): string =>
  row.stations.map((station) => station.stationName).join(" → ");

export const getStationStatusLabel = (
  status: number,
): string => {
  if (status === 0) return "0";
  if (status === 40) return "40 · Moving";
  if (status === 50) return "50 · Arrival";
  if (status === 60) return "60 · Unseal";
  if (status === 80) return "80 · Unloaded";
  if (status === 200) return "200 · Pending";
  return String(status);
};
