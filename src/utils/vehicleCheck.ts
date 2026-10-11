import {
  buildConfiguredVehicleTravelTimeLookup,
  getVehicleTravelMinutes,
  mergeVehicleTravelTimeLookups,
  normalizeVehicleStationName,
  type VehicleTravelTimeLookup,
  type VehicleTravelTimeSource,
} from "./vehicleTravelTime.ts";
import type { VehicleCheckSheetTable } from "./vehicleCheckSheet.ts";
import type { VehicleTravelTimeEntry } from "./vehicleTravelTime.ts";

export const DEFAULT_VEHICLE_CHECK_HOURS = 8;
export const VEHICLE_CHECK_TARGET_STATION_NAME = "Pleiku SOC";
export const VEHICLE_CHECK_OVERDUE_GRACE_SECONDS = 2 * 60 * 60;

export interface VehicleCheckWindow {
  from: number;
  to: number;
}

export interface VehicleCheckStation {
  sequenceNumber: number;
  stationName: string;
  nextStationName: string;
  sta: number | null;
  std: number | null;
  eta: number | null;
  etd: number | null;
  ata: number | null;
  atd: number | null;
  transportQuantity: number;
  loadTotalTransportOrder: number;
  unloadTotalTransportOrder: number;
  loadTotalOrder: number;
  unloadTotalOrder: number;
  vehicleNumber: string;
  vehicleTypeName: string;
  agencyName: string;
  tripStatus: string;
  timeUpdate: number | null;
}

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
  | "pleiku_sta"
  | null;

export interface VehicleCheckRow {
  tripNumber: string;
  tripName: string;
  vehiclePlateNumber: string;
  vehicleTypeName: string;
  agencyName: string;
  stations: VehicleCheckStation[];
  eta: number | null;
  etaSource: VehicleEtaSource;
  targetSta: number | null;
  positionStatus: VehiclePositionStatus;
  currentStationName: string;
  nextStationName: string;
  currentPositionLabel: string;
  currentSequenceNumber: number | null;
  lastEventAt: number | null;
  lastEventType: "ata" | "atd" | null;
  actualArrivalAt: number | null;
  transportQuantity: number;
  targetUnloadTransportOrder: number | null;
  sheetUpdatedAt: number | null;
  travelTimeMinutes: number | null;
  travelTimeSource: VehicleTravelTimeSource | null;
}

interface ParsedSheetRecord extends VehicleCheckStation {
  tripNumber: string;
  tripName: string;
}

interface VehiclePositionInfo {
  status: VehiclePositionStatus;
  currentStationName: string;
  nextStationName: string;
  label: string;
  sequenceNumber: number | null;
  lastEventAt: number | null;
  lastEventType: "ata" | "atd" | null;
}

const normalizeHeader = (value: string): string =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, "_");

const readText = (value: unknown): string =>
  value == null ? "" : String(value).trim();

const readInteger = (value: unknown): number => {
  const text = readText(value);
  if (!text) return 0;
  const normalized = text.replace(/[^\d-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readSequence = (value: unknown, fallback: number): number => {
  const parsed = readInteger(value);
  return parsed > 0 ? parsed : fallback;
};

export const parseVehicleCheckTimestamp = (value: unknown): number | null => {
  const text = readText(value);
  if (!text) return null;

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 10_000_000_000
        ? Math.floor(numeric / 1_000)
        : Math.floor(numeric);
    }
  }

  const isoLike = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(text)
    ? text.replace(" ", "T") + "+07:00"
    : text;
  const parsedMs = Date.parse(isoLike);
  return Number.isFinite(parsedMs) && parsedMs > 0
    ? Math.floor(parsedMs / 1_000)
    : null;
};

const isPleiku = (value: string): boolean =>
  normalizeVehicleStationName(value) ===
  normalizeVehicleStationName(VEHICLE_CHECK_TARGET_STATION_NAME);

const createHeaderIndex = (headers: string[]): Record<string, number> => {
  const index: Record<string, number> = {};
  headers.forEach((header, columnIndex) => {
    const key = normalizeHeader(header);
    if (key && index[key] === undefined) index[key] = columnIndex;
  });
  return index;
};

const getCell = (
  row: string[],
  index: Record<string, number>,
  key: string,
): string => {
  const columnIndex = index[key];
  return columnIndex === undefined ? "" : readText(row[columnIndex]);
};

const assertRequiredHeaders = (index: Record<string, number>): void => {
  const required = [
    "trip_number",
    "sequence_number",
    "station_name",
    "trip_sta",
    "trip_std",
    "trip_eta",
    "trip_etd",
    "trip_ata",
    "trip_atd",
    "vehicle_number",
    "time_update",
  ];
  const missing = required.filter((key) => index[key] === undefined);
  if (missing.length) {
    throw new Error(
      "Sheet Check xe thiếu cột: " + missing.join(", ") + ".",
    );
  }
};

const parseSheetRecords = (
  table: VehicleCheckSheetTable,
): ParsedSheetRecord[] => {
  const index = createHeaderIndex(table.headers);
  assertRequiredHeaders(index);

  return table.rows
    .map((row, rowIndex): ParsedSheetRecord | null => {
      const tripNumber = getCell(row, index, "trip_number");
      const stationName = getCell(row, index, "station_name");
      if (!tripNumber || !stationName) return null;

      return {
        tripNumber,
        tripName: getCell(row, index, "trip_name"),
        sequenceNumber: readSequence(
          getCell(row, index, "sequence_number"),
          rowIndex + 1,
        ),
        stationName,
        nextStationName: getCell(row, index, "next_station_name"),
        sta: parseVehicleCheckTimestamp(getCell(row, index, "trip_sta")),
        std: parseVehicleCheckTimestamp(getCell(row, index, "trip_std")),
        eta: parseVehicleCheckTimestamp(getCell(row, index, "trip_eta")),
        etd: parseVehicleCheckTimestamp(getCell(row, index, "trip_etd")),
        ata: parseVehicleCheckTimestamp(getCell(row, index, "trip_ata")),
        atd: parseVehicleCheckTimestamp(getCell(row, index, "trip_atd")),
        transportQuantity: readInteger(
          getCell(row, index, "transport_quantity"),
        ),
        loadTotalTransportOrder: readInteger(
          getCell(row, index, "load_total_transport_order"),
        ),
        unloadTotalTransportOrder: readInteger(
          getCell(row, index, "unload_total_transport_order"),
        ),
        loadTotalOrder: readInteger(getCell(row, index, "load_total_order")),
        unloadTotalOrder: readInteger(
          getCell(row, index, "unload_total_order"),
        ),
        vehicleNumber: getCell(row, index, "vehicle_number"),
        vehicleTypeName: getCell(row, index, "vehicle_type_name"),
        agencyName: getCell(row, index, "agency_name"),
        tripStatus: getCell(row, index, "trip_status"),
        timeUpdate: parseVehicleCheckTimestamp(
          getCell(row, index, "time_update"),
        ),
      };
    })
    .filter((row): row is ParsedSheetRecord => row !== null);
};

const groupRecordsByTrip = (
  records: ParsedSheetRecord[],
): Map<string, ParsedSheetRecord[]> => {
  const groups = new Map<string, ParsedSheetRecord[]>();
  records.forEach((record) => {
    const group = groups.get(record.tripNumber) ?? [];
    group.push(record);
    groups.set(record.tripNumber, group);
  });
  groups.forEach((group) =>
    group.sort((first, second) => first.sequenceNumber - second.sequenceNumber),
  );
  return groups;
};

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
    if (isPleiku(station.stationName)) {
      return {
        status: "arrived",
        currentStationName: station.stationName,
        nextStationName: station.nextStationName,
        label: "Đã đến Pleiku SOC",
        sequenceNumber: station.sequenceNumber,
        lastEventAt: latest.timestamp,
        lastEventType: "ata",
      };
    }
    return {
      status: "at_station",
      currentStationName: station.stationName,
      nextStationName: station.nextStationName,
      label: "Đang ở " + station.stationName,
      sequenceNumber: station.sequenceNumber,
      lastEventAt: latest.timestamp,
      lastEventType: "ata",
    };
  }

  if (isPleiku(station.stationName)) {
    return {
      status: "departed_target",
      currentStationName: station.stationName,
      nextStationName: station.nextStationName,
      label: "Đã rời Pleiku SOC",
      sequenceNumber: station.sequenceNumber,
      lastEventAt: latest.timestamp,
      lastEventType: "atd",
    };
  }

  return {
    status: "in_transit",
    currentStationName: station.stationName,
    nextStationName: station.nextStationName,
    label: station.nextStationName
      ? station.stationName + " → " + station.nextStationName
      : "Đã rời " + station.stationName,
    sequenceNumber: station.sequenceNumber,
    lastEventAt: latest.timestamp,
    lastEventType: "atd",
  };
};

const resolveTargetStation = (
  stations: VehicleCheckStation[],
  position: VehiclePositionInfo,
): VehicleCheckStation | null => {
  const fromSequence = position.sequenceNumber ?? Number.NEGATIVE_INFINITY;
  return (
    stations.find(
      (station) =>
        isPleiku(station.stationName) &&
        station.sequenceNumber >= fromSequence &&
        station.ata === null &&
        station.atd === null,
    ) ?? null
  );
};

const hasFutureInboundLegToPleiku = (
  stations: VehicleCheckStation[],
  position: VehiclePositionInfo,
): boolean => {
  const fromSequence = position.sequenceNumber ?? Number.NEGATIVE_INFINITY;

  return stations.some((station) => {
    if (
      station.sequenceNumber < fromSequence ||
      !isPleiku(station.nextStationName)
    ) {
      return false;
    }

    // Nếu đây chính là sequence hiện tại và Pleiku đã có actual event
    // ở một row riêng thì trip đã tới/đã xử lý, không còn inbound.
    const pleikuStop = stations.find(
      (candidate) =>
        isPleiku(candidate.stationName) &&
        candidate.sequenceNumber >= station.sequenceNumber,
    );
    if (
      pleikuStop &&
      (pleikuStop.ata !== null || pleikuStop.atd !== null)
    ) {
      return false;
    }

    return true;
  });
};

const isTripStillHeadingToPleiku = (
  stations: VehicleCheckStation[],
  position: VehiclePositionInfo,
  targetStation: VehicleCheckStation | null,
): boolean => {
  if (
    position.status === "arrived" ||
    position.status === "departed_target"
  ) {
    return false;
  }

  if (targetStation) return true;
  return hasFutureInboundLegToPleiku(stations, position);
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
};

const deriveVehicleTravelTimesFromHistory = (
  groups: Map<string, ParsedSheetRecord[]>,
): VehicleTravelTimeLookup => {
  const actualSamples = new Map<string, number[]>();
  const scheduleSamples = new Map<string, number[]>();

  groups.forEach((records) => {
    const target = records.find(
      (record) => isPleiku(record.stationName) && record.ata !== null,
    );
    const scheduledTarget = records.find(
      (record) => isPleiku(record.stationName) && record.sta !== null,
    );

    records.forEach((record) => {
      if (isPleiku(record.stationName)) return;
      const key = normalizeVehicleStationName(record.stationName);

      if (
        target?.ata !== null &&
        target?.ata !== undefined &&
        record.atd !== null &&
        target.ata > record.atd
      ) {
        const minutes = Math.round((target.ata - record.atd) / 60);
        if (minutes >= 10 && minutes <= 72 * 60) {
          const samples = actualSamples.get(key) ?? [];
          samples.push(minutes);
          actualSamples.set(key, samples);
        }
      }

      if (
        scheduledTarget?.sta !== null &&
        scheduledTarget?.sta !== undefined &&
        record.std !== null &&
        scheduledTarget.sta > record.std
      ) {
        const minutes = Math.round((scheduledTarget.sta - record.std) / 60);
        if (minutes >= 10 && minutes <= 72 * 60) {
          const samples = scheduleSamples.get(key) ?? [];
          samples.push(minutes);
          scheduleSamples.set(key, samples);
        }
      }
    });
  });

  const map: Record<string, number> = {};
  const sources: VehicleTravelTimeLookup["sources"] = {};

  scheduleSamples.forEach((values, key) => {
    const value = median(values);
    if (value !== null) {
      map[key] = value;
      sources[key] = "sheet_schedule";
    }
  });
  actualSamples.forEach((values, key) => {
    const value = median(values);
    if (value !== null) {
      map[key] = value;
      sources[key] = "sheet_history";
    }
  });

  return { map, sources };
};

const getStationAtPosition = (
  stations: VehicleCheckStation[],
  sequenceNumber: number | null,
): VehicleCheckStation | null =>
  sequenceNumber === null
    ? null
    : stations.find(
        (station) => station.sequenceNumber === sequenceNumber,
      ) ?? null;

const resolveEta = (
  row: VehicleCheckRow,
  targetStation: VehicleCheckStation | null,
  lookup: VehicleTravelTimeLookup,
): VehicleCheckRow => {
  if (targetStation?.ata !== null && targetStation?.ata !== undefined) {
    return {
      ...row,
      eta: targetStation.ata,
      etaSource: "actual_arrival",
      actualArrivalAt: targetStation.ata,
    };
  }

  if (
    targetStation?.eta !== null &&
    targetStation?.eta !== undefined &&
    (row.lastEventAt === null || targetStation.eta >= row.lastEventAt)
  ) {
    return {
      ...row,
      eta: targetStation.eta,
      etaSource: "pleiku_eta",
    };
  }

  const currentStation = getStationAtPosition(
    row.stations,
    row.currentSequenceNumber,
  );
  const travel = currentStation
    ? getVehicleTravelMinutes(currentStation.stationName, lookup)
    : null;

  if (currentStation && travel) {
    const travelSeconds = travel.minutes * 60;

    if (
      row.positionStatus === "in_transit" &&
      row.lastEventType === "atd" &&
      row.lastEventAt !== null
    ) {
      return {
        ...row,
        eta: row.lastEventAt + travelSeconds,
        etaSource: "travel_atd",
        travelTimeMinutes: travel.minutes,
        travelTimeSource: travel.source,
      };
    }

    if (row.positionStatus === "at_station") {
      if (currentStation.etd !== null) {
        return {
          ...row,
          eta: currentStation.etd + travelSeconds,
          etaSource: "travel_etd",
          travelTimeMinutes: travel.minutes,
          travelTimeSource: travel.source,
        };
      }
      if (currentStation.std !== null) {
        return {
          ...row,
          eta: currentStation.std + travelSeconds,
          etaSource: "travel_std",
          travelTimeMinutes: travel.minutes,
          travelTimeSource: travel.source,
        };
      }
    }
  }

  if (
    targetStation?.sta !== null &&
    targetStation?.sta !== undefined &&
    (row.lastEventAt === null || targetStation.sta >= row.lastEventAt)
  ) {
    return {
      ...row,
      eta: targetStation.sta,
      etaSource: "pleiku_sta",
    };
  }

  return row;
};

const latestNonEmpty = (
  stations: VehicleCheckStation[],
  selector: (station: VehicleCheckStation) => string,
): string => {
  for (let index = stations.length - 1; index >= 0; index -= 1) {
    const value = selector(stations[index]).trim();
    if (value) return value;
  }
  return "—";
};

const latestTimeUpdate = (stations: VehicleCheckStation[]): number | null =>
  stations.reduce<number | null>((latest, station) => {
    if (station.timeUpdate === null) return latest;
    return latest === null
      ? station.timeUpdate
      : Math.max(latest, station.timeUpdate);
  }, null);

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
  if (
    row.positionStatus === "arrived" ||
    row.positionStatus === "departed_target" ||
    row.eta === null
  ) {
    return false;
  }

  const earliestAllowedEta =
    window.from - VEHICLE_CHECK_OVERDUE_GRACE_SECONDS;

  // Chỉ giữ xe còn hợp lý để đang inbound:
  // - ETA trong tương lai đến +N giờ; hoặc
  // - ETA mới trễ tối đa 2 giờ để tránh mất xe do delay nhẹ.
  // Trip cũ đã quá ETA nhiều giờ sẽ bị loại, tránh giữ xe đã xử lý/rời Pleiku.
  return row.eta >= earliestAllowedEta && row.eta <= window.to;
};

export interface BuildVehicleCheckRowsResult {
  rows: VehicleCheckRow[];
  latestSheetUpdatedAt: number | null;
}

export const buildVehicleCheckRowsFromSheet = (
  table: VehicleCheckSheetTable,
  configuredTravelTimes: VehicleTravelTimeEntry[] = [],
  appConfiguredTravelTimes: VehicleTravelTimeEntry[] = [],
): BuildVehicleCheckRowsResult => {
  const records = parseSheetRecords(table);
  const groups = groupRecordsByTrip(records);
  const learnedLookup = deriveVehicleTravelTimesFromHistory(groups);
  const configuredLookup =
    buildConfiguredVehicleTravelTimeLookup(
      configuredTravelTimes,
      "sheet_config",
    );
  const appConfiguredLookup =
    buildConfiguredVehicleTravelTimeLookup(
      appConfiguredTravelTimes,
      "app_config",
    );
  const travelLookup = mergeVehicleTravelTimeLookups(
    mergeVehicleTravelTimeLookups(learnedLookup, configuredLookup),
    appConfiguredLookup,
  );

  const rows: VehicleCheckRow[] = [];

  groups.forEach((tripRecords) => {
    const stations: VehicleCheckStation[] = tripRecords.map(
      ({ tripNumber: _tripNumber, tripName: _tripName, ...station }) =>
        station,
    );
    const position = resolveVehiclePosition(stations);
    const targetStation = resolveTargetStation(stations, position);

    if (!isTripStillHeadingToPleiku(stations, position, targetStation)) {
      return;
    }

    const currentStation = getStationAtPosition(
      stations,
      position.sequenceNumber,
    );
    const metricStation = currentStation ?? stations[0];

    let row: VehicleCheckRow = {
      tripNumber: tripRecords[0].tripNumber,
      tripName: tripRecords[0].tripName,
      vehiclePlateNumber: latestNonEmpty(
        stations,
        (station) => station.vehicleNumber,
      ),
      vehicleTypeName: latestNonEmpty(
        stations,
        (station) => station.vehicleTypeName,
      ),
      agencyName: latestNonEmpty(stations, (station) => station.agencyName),
      stations,
      eta: null,
      etaSource: null,
      targetSta: targetStation?.sta ?? null,
      positionStatus: position.status,
      currentStationName: position.currentStationName,
      nextStationName: position.nextStationName,
      currentPositionLabel: position.label,
      currentSequenceNumber: position.sequenceNumber,
      lastEventAt: position.lastEventAt,
      lastEventType: position.lastEventType,
      actualArrivalAt: targetStation?.ata ?? null,
      transportQuantity: metricStation?.transportQuantity ?? 0,
      targetUnloadTransportOrder:
        targetStation?.unloadTotalTransportOrder ?? null,
      sheetUpdatedAt: latestTimeUpdate(stations),
      travelTimeMinutes: null,
      travelTimeSource: null,
    };

    row = resolveEta(row, targetStation, travelLookup);
    rows.push(row);
  });

  const latestSheetUpdatedAt = records.reduce<number | null>(
    (latest, record) => {
      if (record.timeUpdate === null) return latest;
      return latest === null
        ? record.timeUpdate
        : Math.max(latest, record.timeUpdate);
    },
    null,
  );

  return { rows, latestSheetUpdatedAt };
};
