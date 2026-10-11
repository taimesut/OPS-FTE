export const VEHICLE_TRAVEL_TIME_SPREADSHEET_ID =
  "1KtjQsrdSR0mvyxrL_sKo3ScOP-ELQ873iuUdLjMajWM";
export const VEHICLE_TRAVEL_TIME_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/" +
  VEHICLE_TRAVEL_TIME_SPREADSHEET_ID +
  "/edit";
export const VEHICLE_TRAVEL_TIME_SHEET_NAME = "CHECK XE";
export const VEHICLE_TRAVEL_TIME_STORAGE_KEY =
  "ops-fte.vehicle-travel-time-rules";

export type VehicleTravelTimeMap = Record<string, number>;

export interface VehicleTravelTimeEntry {
  stationName: string;
  minutes: number;
}

export interface VehicleTravelTimeParseResult {
  entries: VehicleTravelTimeEntry[];
  map: VehicleTravelTimeMap;
  errors: string[];
}

export interface VehicleTravelTimeRunner {
  withSuccessHandler(
    handler: (value: unknown) => void,
  ): VehicleTravelTimeRunner;
  withFailureHandler(handler: () => void): VehicleTravelTimeRunner;
  getVehicleTravelTimes(): void;
}

type GoogleAppsScriptGlobal = typeof globalThis & {
  google?: { script?: { run?: VehicleTravelTimeRunner } };
};

export const normalizeVehicleStationName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");

const readPositiveNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const parsed = Number(normalized);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }
  return null;
};

const parseDurationMinutes = (value: string): number | null => {
  const text = value.trim().toLocaleLowerCase("vi-VN");
  if (!text) return null;

  const clockMatch = text.match(/^(\d{1,3}):(\d{1,2})$/);
  if (clockMatch) {
    const hours = Number(clockMatch[1]);
    const minutes = Number(clockMatch[2]);
    if (minutes >= 0 && minutes < 60) return hours * 60 + minutes;
  }

  const hourMinuteMatch = text.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:h|giờ)(?:\s*(\d{1,2})\s*(?:m|phút)?)?$/,
  );
  if (hourMinuteMatch) {
    const hours = Number(hourMinuteMatch[1].replace(",", "."));
    const minutes = hourMinuteMatch[2] ? Number(hourMinuteMatch[2]) : 0;
    if (Number.isFinite(hours) && hours >= 0 && minutes >= 0 && minutes < 60) {
      return Math.round(hours * 60 + minutes);
    }
  }

  const minuteMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|phút)$/);
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1].replace(",", "."));
    return Number.isFinite(minutes) && minutes > 0
      ? Math.round(minutes)
      : null;
  }

  const plainHours = readPositiveNumber(text);
  return plainHours === null ? null : Math.round(plainHours * 60);
};

export const parseVehicleTravelTimeRules = (
  value: string,
): VehicleTravelTimeParseResult => {
  const entries: VehicleTravelTimeEntry[] = [];
  const map: VehicleTravelTimeMap = {};
  const errors: string[] = [];

  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const parts = line.split(/\s*(?:\||\t)\s*/);
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        errors.push(
          "Dòng " +
            (index + 1) +
            " phải có dạng SOC | 4:30 hoặc SOC | 4.5.",
        );
        return;
      }

      const stationName = parts[0].trim();
      const minutes = parseDurationMinutes(parts.slice(1).join("|"));
      if (minutes === null || minutes <= 0) {
        errors.push(
          "Dòng " +
            (index + 1) +
            " có thời gian không hợp lệ: " +
            parts.slice(1).join("|").trim(),
        );
        return;
      }

      const key = normalizeVehicleStationName(stationName);
      if (map[key] !== undefined) {
        errors.push("Dòng " + (index + 1) + " bị trùng SOC " + stationName + ".");
        return;
      }

      map[key] = minutes;
      entries.push({ stationName, minutes });
    });

  return { entries, map, errors };
};

const normalizeSheetTravelTimes = (value: unknown): VehicleTravelTimeMap => {
  const map: VehicleTravelTimeMap = {};

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item !== "object" || item === null) return;
      const record = item as Record<string, unknown>;
      const stationName =
        typeof record.stationName === "string"
          ? record.stationName.trim()
          : typeof record.station_name === "string"
            ? record.station_name.trim()
            : "";
      const minutes = readPositiveNumber(record.minutes);
      if (!stationName || minutes === null) return;
      map[normalizeVehicleStationName(stationName)] = Math.round(minutes);
    });
    return map;
  }

  if (typeof value === "object" && value !== null) {
    Object.entries(value as Record<string, unknown>).forEach(
      ([stationName, rawMinutes]) => {
        const minutes = readPositiveNumber(rawMinutes);
        if (!stationName.trim() || minutes === null) return;
        map[normalizeVehicleStationName(stationName)] = Math.round(minutes);
      },
    );
  }

  return map;
};

const getDefaultRunner = (): VehicleTravelTimeRunner | null =>
  (globalThis as GoogleAppsScriptGlobal).google?.script?.run ?? null;

const getSafeStorage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export const loadStoredVehicleTravelTimeRules = (): string =>
  getSafeStorage()?.getItem(VEHICLE_TRAVEL_TIME_STORAGE_KEY) ?? "";

export const saveVehicleTravelTimeRules = (value: string): void => {
  const storage = getSafeStorage();
  if (!storage) return;
  storage.setItem(VEHICLE_TRAVEL_TIME_STORAGE_KEY, value);
};

const loadSheetVehicleTravelTimes = (
  runner: VehicleTravelTimeRunner | null,
): Promise<VehicleTravelTimeMap> => {
  if (!runner) return Promise.resolve({});

  return new Promise((resolve) => {
    try {
      runner
        .withSuccessHandler((value) => resolve(normalizeSheetTravelTimes(value)))
        .withFailureHandler(() => resolve({}))
        .getVehicleTravelTimes();
    } catch {
      resolve({});
    }
  });
};

export const loadVehicleTravelTimes = async (
  runner: VehicleTravelTimeRunner | null = getDefaultRunner(),
): Promise<VehicleTravelTimeMap> => {
  const sheetMap = await loadSheetVehicleTravelTimes(runner);
  const localResult = parseVehicleTravelTimeRules(
    loadStoredVehicleTravelTimeRules(),
  );

  return {
    ...sheetMap,
    ...localResult.map,
  };
};

export const getVehicleTravelMinutes = (
  stationName: string,
  map: VehicleTravelTimeMap,
): number | null => {
  const minutes = map[normalizeVehicleStationName(stationName)];
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
    ? minutes
    : null;
};
