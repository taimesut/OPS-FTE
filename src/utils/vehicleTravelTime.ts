export type VehicleTravelTimeMap = Record<string, number>;

export type VehicleTravelTimeSource =
  | "app_config"
  | "sheet_config"
  | "sheet_history"
  | "sheet_schedule";

export interface VehicleTravelTimeEntry {
  stationName: string;
  minutes: number;
}

export interface VehicleTravelTimeLookup {
  map: VehicleTravelTimeMap;
  sources: Record<string, VehicleTravelTimeSource>;
}

export const normalizeVehicleStationName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");

export const parseVehicleTravelTimeMinutes = (
  value: unknown,
): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value !== "string") return null;

  const text = value.trim().toLocaleLowerCase("vi-VN").replace(",", ".");
  if (!text) return null;

  const clockMatch = text.match(/^(\d{1,3}):(\d{1,2})$/);
  if (clockMatch) {
    const hours = Number(clockMatch[1]);
    const minutes = Number(clockMatch[2]);
    return minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
  }

  const hourMinuteMatch = text.match(
    /^(\d+(?:\.\d+)?)\s*(?:h|giờ)(?:\s*(\d{1,2})\s*(?:m|phút)?)?$/,
  );
  if (hourMinuteMatch) {
    const hours = Number(hourMinuteMatch[1]);
    const minutes = hourMinuteMatch[2] ? Number(hourMinuteMatch[2]) : 0;
    if (Number.isFinite(hours) && hours >= 0 && minutes >= 0 && minutes < 60) {
      return Math.round(hours * 60 + minutes);
    }
    return null;
  }

  const minuteMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|phút)$/);
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1]);
    return Number.isFinite(minutes) && minutes > 0
      ? Math.round(minutes)
      : null;
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const hours = Number(text);
    return Number.isFinite(hours) && hours > 0
      ? Math.round(hours * 60)
      : null;
  }

  return null;
};

export const buildConfiguredVehicleTravelTimeLookup = (
  entries: VehicleTravelTimeEntry[],
  source: VehicleTravelTimeSource = "sheet_config",
): VehicleTravelTimeLookup => {
  const map: VehicleTravelTimeMap = {};
  const sources: Record<string, VehicleTravelTimeSource> = {};

  entries.forEach((entry) => {
    if (!entry.stationName.trim()) return;
    if (!Number.isFinite(entry.minutes) || entry.minutes <= 0) return;
    const key = normalizeVehicleStationName(entry.stationName);
    map[key] = Math.round(entry.minutes);
    sources[key] = source;
  });

  return { map, sources };
};

export const mergeVehicleTravelTimeLookups = (
  fallback: VehicleTravelTimeLookup,
  preferred: VehicleTravelTimeLookup,
): VehicleTravelTimeLookup => ({
  map: { ...fallback.map, ...preferred.map },
  sources: { ...fallback.sources, ...preferred.sources },
});

export const getVehicleTravelMinutes = (
  stationName: string,
  lookup: VehicleTravelTimeLookup,
): { minutes: number; source: VehicleTravelTimeSource } | null => {
  const key = normalizeVehicleStationName(stationName);
  const minutes = lookup.map[key];
  const source = lookup.sources[key];

  if (
    typeof minutes !== "number" ||
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    !source
  ) {
    return null;
  }

  return { minutes, source };
};
