import {
  getVehicleTravelMinutes,
  normalizeVehicleStationName,
  type VehicleTravelTimeMap,
} from "./vehicleTravelTime.ts";

export const VEHICLE_CHECK_PATH =
  "/api/admin/transportation/trip/list_v2";
export const VEHICLE_LOCATION_PATH =
  "/api/admin/transportation/trip/location";
export const VEHICLE_CHECK_PAGE_SIZE = 50;
export const DEFAULT_VEHICLE_CHECK_HOURS = 8;
export const VEHICLE_CHECK_TARGET_STATION_ID = "1030";
export const VEHICLE_CHECK_TARGET_STATION_NAME = "Pleiku SOC";
export const VEHICLE_CHECK_QUERY_PAST_SECONDS = 2 * 24 * 60 * 60;
export const VEHICLE_CHECK_QUERY_FUTURE_SECONDS = 1 * 24 * 60 * 60;

export interface VehicleCheckWindow {
  from: number;
  to: number;
}

export interface VehicleCheckStation {
  sequenceNumber: number;
  stationId: string;
  stationName: string;
  nextStationName: string;
  isTarget: boolean;
  sta: number | null;
  std: number | null;
  eta: number | null;
  etd: number | null;
  ata: number | null;
  atd: number | null;
}

export type VehicleMovementStatus = "arriving" | "held";

export type VehiclePositionStatus =
  | "scheduled"
  | "at_station"
  | "in_transit"
  | "arrived"
  | "departed_target";

export type VehicleEtaSource =
  | "actual_arrival"
  | "pleiku_eta"
  | "travel_atd"
  | "travel_etd"
  | "travel_std"
  | "trip_location"
  | "pleiku_sta"
  | null;

export interface VehicleCheckRow {
  tripId: number | null;
  tripNumber: string;
  vehiclePlateNumber: string;
  stations: VehicleCheckStation[];
  pendingInboundTo: number;
  pendingInboundOrder: number;
  eta: number | null;
  etaSource: VehicleEtaSource;
  targetSta: number | null;
  movementStatus: VehicleMovementStatus;
  lastLocationUpdatedAt: number | null;
  positionStatus: VehiclePositionStatus;
  currentStationName: string;
  nextStationName: string;
  currentPositionLabel: string;
  currentSequenceNumber: number | null;
  lastEventAt: number | null;
  lastEventType: "ata" | "atd" | null;
  actualArrivalAt: number | null;
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

const readPositiveInteger = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value > 0
    ? value
    : null;

const readTimestamp = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value > 10_000_000_000 ? Math.floor(value / 1_000) : value;
    }

    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;

    if (/^\d+(?:\.\d+)?$/.test(text)) {
      const numeric = Number(text);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 10_000_000_000
          ? Math.floor(numeric / 1_000)
          : numeric;
      }
    }

    const isoLike = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(text)
      ? text.replace(" ", "T") + "+07:00"
      : text;
    const parsedMs = Date.parse(isoLike);
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return Math.floor(parsedMs / 1_000);
    }
  }

  return null;
};

const readStationId = (station: Record<string, unknown>): string => {
  if (
    typeof station.station === "number" &&
    Number.isFinite(station.station)
  ) {
    return String(station.station);
  }
  return readText(station.station_code) || readText(station.station_id) || "—";
};

const isTargetStationName = (value: string): boolean =>
  normalizeVehicleStationName(value) ===
  normalizeVehicleStationName(VEHICLE_CHECK_TARGET_STATION_NAME);

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

  const stations = trip.trip_station
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
      const stationName = readText(station.station_name) || "—";

      return {
        sequenceNumber,
        stationId,
        stationName,
        nextStationName: readText(station.next_station_name),
        isTarget:
          stationId === VEHICLE_CHECK_TARGET_STATION_ID ||
          isTargetStationName(stationName),
        sta: readTimestamp(station.sta, station.trip_sta),
        std: readTimestamp(station.std, station.trip_std),
        eta: readTimestamp(station.eta, station.trip_eta),
        etd: readTimestamp(station.etd, station.trip_etd),
        ata: readTimestamp(station.ata, station.trip_ata),
        atd: readTimestamp(station.atd, station.trip_atd),
      };
    })
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  return stations.map((station, index) => ({
    ...station,
    nextStationName:
      station.nextStationName || stations[index + 1]?.stationName || "",
  }));
};

interface VehiclePositionInfo {
  status: VehiclePositionStatus;
  currentStationName: string;
  nextStationName: string;
  label: string;
  sequenceNumber: number | null;
  lastEventAt: number | null;
  lastEventType: "ata" | "atd" | null;
}

const resolveVehiclePosition = (
  stations: VehicleCheckStation[],
): VehiclePositionInfo => {
  const events: Array<{
    timestamp: number;
    type: "ata" | "atd";
    station: VehicleCheckStation;
  }> = [];

  stations.forEach((station) => {
    if (station.ata !== null) {
      events.push({ timestamp: station.ata, type: "ata", station });
    }
    if (station.atd !== null) {
      events.push({ timestamp: station.atd, type: "atd", station });
    }
  });

  events.sort((first, second) => {
    if (first.timestamp !== second.timestamp) {
      return first.timestamp - second.timestamp;
    }
    if (first.station.sequenceNumber !== second.station.sequenceNumber) {
      return first.station.sequenceNumber - second.station.sequenceNumber;
    }
    return first.type === second.type ? 0 : first.type === "ata" ? -1 : 1;
  });

  const latest = events[events.length - 1];
  if (!latest) {
    return {
      status: "scheduled",
      currentStationName: "",
      nextStationName: "",
      label: "Chưa có ATA/ATD",
      sequenceNumber: null,
      lastEventAt: null,
      lastEventType: null,
    };
  }

  const station = latest.station;
  if (latest.type === "ata") {
    if (station.isTarget) {
      return {
        status: "arrived",
        currentStationName: station.stationName,
        nextStationName: station.nextStationName,
        label: "Đã đến " + VEHICLE_CHECK_TARGET_STATION_NAME,
        sequenceNumber: station.sequenceNumber,
        lastEventAt: latest.timestamp,
        lastEventType: latest.type,
      };
    }

    return {
      status: "at_station",
      currentStationName: station.stationName,
      nextStationName: station.nextStationName,
      label: "Đang ở " + station.stationName,
      sequenceNumber: station.sequenceNumber,
      lastEventAt: latest.timestamp,
      lastEventType: latest.type,
    };
  }

  if (station.isTarget) {
    return {
      status: "departed_target",
      currentStationName: station.stationName,
      nextStationName: station.nextStationName,
      label: "Đã rời " + VEHICLE_CHECK_TARGET_STATION_NAME,
      sequenceNumber: station.sequenceNumber,
      lastEventAt: latest.timestamp,
      lastEventType: latest.type,
    };
  }

  if (station.nextStationName) {
    return {
      status: "in_transit",
      currentStationName: station.stationName,
      nextStationName: station.nextStationName,
      label: station.stationName + " → " + station.nextStationName,
      sequenceNumber: station.sequenceNumber,
      lastEventAt: latest.timestamp,
      lastEventType: latest.type,
    };
  }

  return {
    status: "scheduled",
    currentStationName: station.stationName,
    nextStationName: "",
    label: "Đã rời " + station.stationName,
    sequenceNumber: station.sequenceNumber,
    lastEventAt: latest.timestamp,
    lastEventType: latest.type,
  };
};

const hasPleikuInRoute = (stations: VehicleCheckStation[]): boolean =>
  stations.some(
    (station) =>
      station.isTarget || isTargetStationName(station.nextStationName),
  );

export const createVehicleCheckQueryWindow = (
  nowMs: number,
): VehicleCheckWindow => {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("Thời gian hiện tại không hợp lệ.");
  }

  const nowSeconds = Math.floor(nowMs / 1_000);
  return {
    from: nowSeconds - VEHICLE_CHECK_QUERY_PAST_SECONDS,
    to: nowSeconds + VEHICLE_CHECK_QUERY_FUTURE_SECONDS,
  };
};

export const createVehicleCheckDisplayWindow = (
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
  return {
    from,
    to: from + Math.floor(hours * 60 * 60),
  };
};

export const isVehicleCheckRowInDisplayWindow = (
  row: VehicleCheckRow,
  window: VehicleCheckWindow,
): boolean => {
  const arrivalReference = row.eta ?? row.targetSta;
  return (
    arrivalReference !== null &&
    arrivalReference >= window.from &&
    arrivalReference <= window.to
  );
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
    sta: String(window.from) + "," + String(window.to),
  };
};

export const resolveVehicleCheckEta = (
  row: VehicleCheckRow,
  travelTimes: VehicleTravelTimeMap = {},
  locationEta: number | null = null,
): VehicleCheckRow => {
  const targetStation = row.stations.find((station) => station.isTarget);
  const actualArrivalAt = targetStation?.ata ?? null;
  const targetEta = targetStation?.eta ?? null;
  const targetSta = targetStation?.sta ?? row.targetSta;
  const latestActual = row.lastEventAt;

  if (actualArrivalAt !== null) {
    return {
      ...row,
      eta: actualArrivalAt,
      etaSource: "actual_arrival",
      actualArrivalAt,
    };
  }

  if (
    targetEta !== null &&
    (latestActual === null || targetEta >= latestActual)
  ) {
    return {
      ...row,
      eta: targetEta,
      etaSource: "pleiku_eta",
    };
  }

  const currentStation =
    row.currentSequenceNumber === null
      ? null
      : row.stations.find(
          (station) => station.sequenceNumber === row.currentSequenceNumber,
        ) ?? null;
  const travelMinutes = currentStation
    ? getVehicleTravelMinutes(currentStation.stationName, travelTimes)
    : null;

  if (currentStation && travelMinutes !== null) {
    const travelSeconds = travelMinutes * 60;

    if (
      row.positionStatus === "in_transit" &&
      row.lastEventType === "atd" &&
      row.lastEventAt !== null
    ) {
      return {
        ...row,
        eta: row.lastEventAt + travelSeconds,
        etaSource: "travel_atd",
      };
    }

    if (row.positionStatus === "at_station") {
      if (currentStation.etd !== null) {
        return {
          ...row,
          eta: currentStation.etd + travelSeconds,
          etaSource: "travel_etd",
        };
      }
      if (currentStation.std !== null) {
        return {
          ...row,
          eta: currentStation.std + travelSeconds,
          etaSource: "travel_std",
        };
      }
    }
  }

  if (
    locationEta !== null &&
    (latestActual === null || locationEta >= latestActual)
  ) {
    return {
      ...row,
      eta: locationEta,
      etaSource: "trip_location",
    };
  }

  if (targetEta !== null) {
    return {
      ...row,
      eta: targetEta,
      etaSource: "pleiku_eta",
    };
  }

  if (targetSta !== null) {
    return {
      ...row,
      eta: targetSta,
      etaSource: "pleiku_sta",
    };
  }

  return {
    ...row,
    eta: null,
    etaSource: null,
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
      const position = resolveVehiclePosition(stations);

      return {
        tripId: readPositiveInteger(trip.id),
        tripNumber: readText(trip.trip_number) || "—",
        vehiclePlateNumber: resolveVehiclePlateNumber(trip),
        stations,
        pendingInboundTo: readNonNegativeNumber(trip.to_inbound_quantity),
        pendingInboundOrder: readNonNegativeNumber(trip.order_inbound_quantity),
        eta: targetEta,
        etaSource: targetEta !== null ? "pleiku_eta" : null,
        targetSta: targetStation?.sta ?? null,
        movementStatus: targetEta !== null ? "arriving" : "held",
        lastLocationUpdatedAt: null,
        positionStatus: position.status,
        currentStationName: position.currentStationName,
        nextStationName: position.nextStationName,
        currentPositionLabel: position.label,
        currentSequenceNumber: position.sequenceNumber,
        lastEventAt: position.lastEventAt,
        lastEventType: position.lastEventType,
        actualArrivalAt: targetStation?.ata ?? null,
      };
    })
    .filter(
      (row) =>
        row.pendingInboundTo > 0 &&
        row.pendingInboundOrder > 0 &&
        hasPleikuInRoute(row.stations),
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
  const eta = readTimestamp(data.eta);
  const locationList = Array.isArray(data.location_list)
    ? data.location_list.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];

  const lastUpdatedAt = locationList.reduce<number | null>((latest, item) => {
    const uploadTime = readTimestamp(item.upload_time);
    if (uploadTime === null) return latest;
    return latest === null ? uploadTime : Math.max(latest, uploadTime);
  }, null);

  return { eta, lastUpdatedAt };
};
