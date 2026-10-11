export const VEHICLE_CHECK_PATH =
  "/api/admin/transportation/trip/list_v2";
export const VEHICLE_CHECK_PAGE_SIZE = 24;
export const DEFAULT_VEHICLE_CHECK_HOURS = 8;

export interface VehicleCheckWindow {
  from: number;
  to: number;
}

export interface VehicleCheckRow {
  tripNumber: string;
  vehiclePlateNumber: string;
  station: string;
  pendingInboundTo: number;
  pendingInboundOrder: number;
}

export interface VehicleCheckPage {
  rows: VehicleCheckRow[];
  total: number;
  pageNo: number;
}

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readNonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;

const resolveVehiclePlateNumber = (trip: Record<string, unknown>): string => {
  const plateList = Array.isArray(trip.vehicle_plate_number_list)
    ? trip.vehicle_plate_number_list
        .map(readText)
        .filter((value): value is string => Boolean(value))
    : [];

  if (plateList.length > 0) return plateList.join(", ");
  return readText(trip.vehicle_number) || "—";
};

const resolveStationName = (trip: Record<string, unknown>): string => {
  const stations = Array.isArray(trip.trip_station)
    ? trip.trip_station.filter(
        (station): station is Record<string, unknown> =>
          typeof station === "object" && station !== null,
      )
    : [];
  const displaySequence =
    typeof trip.display_station_sequence === "number" &&
    Number.isFinite(trip.display_station_sequence)
      ? trip.display_station_sequence
      : null;

  if (displaySequence !== null) {
    const matchedStation = stations.find(
      (station) => station.sequence_number === displaySequence,
    );
    const stationName = readText(matchedStation?.station_name);
    if (stationName) return stationName;
  }

  const pendingInboundTo = readNonNegativeNumber(trip.to_inbound_quantity);
  if (pendingInboundTo > 0) {
    const matchingStations = stations.filter(
      (station) =>
        station.expect_unload_quantity === pendingInboundTo &&
        Boolean(readText(station.station_name)),
    );
    if (matchingStations.length === 1) {
      return readText(matchingStations[0].station_name);
    }
  }

  return "—";
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
    .map<VehicleCheckRow>((trip) => ({
      tripNumber: readText(trip.trip_number) || "—",
      vehiclePlateNumber: resolveVehiclePlateNumber(trip),
      station: resolveStationName(trip),
      pendingInboundTo: readNonNegativeNumber(trip.to_inbound_quantity),
      pendingInboundOrder: readNonNegativeNumber(trip.order_inbound_quantity),
    }));

  return { rows, total, pageNo };
};
