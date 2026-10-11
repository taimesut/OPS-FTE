export const VEHICLE_CHECK_PATH =
  "/api/admin/transportation/trip/list_v2";
export const VEHICLE_LOCATION_PATH =
  "/api/admin/transportation/trip/location";
export const VEHICLE_CHECK_PAGE_SIZE = 50;
export const DEFAULT_VEHICLE_CHECK_HOURS = 8;
export const VEHICLE_CHECK_TARGET_STATION_ID = "1030";

export interface VehicleCheckWindow {
  from: number;
  to: number;
}

export interface VehicleCheckStation {
  sequenceNumber: number;
  stationId: string;
  stationName: string;
  isTarget: boolean;
  eta: number | null;
}

export type VehicleMovementStatus = "arriving" | "held";

export interface VehicleCheckRow {
  tripId: number | null;
  tripNumber: string;
  vehiclePlateNumber: string;
  stations: VehicleCheckStation[];
  pendingInboundTo: number;
  pendingInboundOrder: number;
  eta: number | null;
  movementStatus: VehicleMovementStatus;
  lastLocationUpdatedAt: number | null;
}

export interface VehicleCheckPage {
  rows: VehicleCheckRow[];
  total: number;
  pageNo: number;
}

export interface VehicleLocationInfo {
  eta: number | null;
  lastUpdatedAt: number | null;
}

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readNonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;

const readPositiveNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

const readPositiveInteger = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value > 0
    ? value
    : null;

const readStationId = (station: Record<string, unknown>): string => {
  if (
    typeof station.station === "number" &&
    Number.isFinite(station.station)
  ) {
    return String(station.station);
  }
  return readText(station.station_code) || "—";
};

const resolveVehiclePlateNumber = (trip: Record<string, unknown>): string => {
  const plateList = Array.isArray(trip.vehicle_plate_number_list)
    ? trip.vehicle_plate_number_list
        .map(readText)
        .filter((value): value is string => Boolean(value))
    : [];

  if (plateList.length > 0) return plateList.join(", ");
  return readText(trip.vehicle_number) || "—";
};

const resolveStationRoute = (
  trip: Record<string, unknown>,
): VehicleCheckStation[] => {
  if (!Array.isArray(trip.trip_station)) return [];

  return trip.trip_station
    .filter(
      (station): station is Record<string, unknown> =>
        typeof station === "object" && station !== null,
    )
    .map((station, index): VehicleCheckStation => {
      const sequenceNumber =
        typeof station.sequence_number === "number" &&
        Number.isFinite(station.sequence_number)
          ? station.sequence_number
          : index + 1;
      const stationId = readStationId(station);

      return {
        sequenceNumber,
        stationId,
        stationName: readText(station.station_name) || "—",
        isTarget: stationId === VEHICLE_CHECK_TARGET_STATION_ID,
        eta: readPositiveNumber(station.eta),
      };
    })
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
};

export const createVehicleCheckWindow = (
  nowMs: number,
  hours: number,
): VehicleCheckWindow => {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("Thời gian hiện tại không hợp lệ.");
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Số giờ cần kiểm tra phải lớn hơn 0.");
  }

  const from = Math.floor(nowMs / 1_000);
  const durationSeconds = Math.floor(hours * 60 * 60);
  return {
    from,
    to: from + durationSeconds,
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
    trip_station_status: 200,
    pageno: pageNo,
    count: VEHICLE_CHECK_PAGE_SIZE,
    query_type: 1,
    tab_type: 2,
    sta: `${window.from},${window.to}`,
  };
};

export const parseVehicleCheckResponse = (payload: unknown): VehicleCheckPage => {
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
      readText(root.message) || "Không thể tải danh sách xe từ SPX.",
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

  const total = readNonNegativeNumber(data.total);
  const pageNo =
    typeof data.pageno === "number" &&
    Number.isInteger(data.pageno) &&
    data.pageno > 0
      ? data.pageno
      : 1;

  const rows = data.list
    .filter(
      (trip): trip is Record<string, unknown> =>
        typeof trip === "object" && trip !== null,
    )
    .map<VehicleCheckRow>((trip) => {
      const stations = resolveStationRoute(trip);
      const targetStation = stations.find((station) => station.isTarget);
      const targetEta = targetStation?.eta ?? null;

      return {
        tripId: readPositiveInteger(trip.id),
        tripNumber: readText(trip.trip_number) || "—",
        vehiclePlateNumber: resolveVehiclePlateNumber(trip),
        stations,
        pendingInboundTo: readNonNegativeNumber(trip.to_inbound_quantity),
        pendingInboundOrder: readNonNegativeNumber(trip.order_inbound_quantity),
        eta: targetEta,
        movementStatus: targetEta !== null ? "arriving" : "held",
        lastLocationUpdatedAt: null,
      };
    })
    .filter(
      (row) => row.pendingInboundTo > 0 && row.pendingInboundOrder > 0,
    );

  return { rows, total, pageNo };
};

export const parseVehicleLocationResponse = (
  payload: unknown,
): VehicleLocationInfo => {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Phản hồi vị trí xe không hợp lệ.");
  }

  const root = payload as {
    retcode?: unknown;
    message?: unknown;
    data?: unknown;
  };
  if (root.retcode !== 0) {
    throw new Error(
      readText(root.message) || "Không thể tải vị trí xe từ SPX.",
    );
  }
  if (typeof root.data !== "object" || root.data === null) {
    throw new Error("Phản hồi vị trí xe thiếu data.");
  }

  const data = root.data as {
    eta?: unknown;
    location_list?: unknown;
  };
  const eta = readPositiveNumber(data.eta);
  const locationList = Array.isArray(data.location_list)
    ? data.location_list.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];

  const lastUpdatedAt = locationList.reduce<number | null>((latest, item) => {
    const uploadTime = readPositiveNumber(item.upload_time);
    if (uploadTime === null) return latest;
    return latest === null ? uploadTime : Math.max(latest, uploadTime);
  }, null);

  return { eta, lastUpdatedAt };
};
