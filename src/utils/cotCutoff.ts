export interface CotCutoffPreferences {
  enabled: boolean;
  localDateTime: string;
}

export interface CotWindow {
  cotTimestamp: number;
  currentStationReceivedTime: string;
}

const STORAGE_VERSION = 1;
const DEFAULT_PREFERENCES: CotCutoffPreferences = {
  enabled: false,
  localDateTime: "",
};
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, "0");

export const formatLocalDateTimeInput = (date = new Date()): string => {
  if (Number.isNaN(date.getTime())) throw new Error("Thời gian COT không hợp lệ.");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const parseCotLocalDateTime = (value: string): Date => {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) throw new Error("Thời gian COT không hợp lệ.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error("Thời gian COT không hợp lệ.");
  }
  return date;
};

export const isValidCotLocalDateTime = (value: string): boolean => {
  try {
    parseCotLocalDateTime(value);
    return true;
  } catch {
    return false;
  }
};

const subtractOneCalendarMonth = (date: Date): Date => {
  const result = new Date(date.getTime());
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - 1);
  const lastTargetDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, lastTargetDay));
  return result;
};

export const createCotWindow = (localDateTime: string): CotWindow => {
  const cot = parseCotLocalDateTime(localDateTime);
  const from = subtractOneCalendarMonth(cot);
  const cotTimestamp = Math.floor(cot.getTime() / 1000);
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  return {
    cotTimestamp,
    currentStationReceivedTime: `${fromTimestamp},${cotTimestamp}`,
  };
};

export const parseCotCutoffPreferences = (
  raw: string | null,
): CotCutoffPreferences => {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      value.version !== STORAGE_VERSION ||
      typeof value.enabled !== "boolean" ||
      typeof value.localDateTime !== "string"
    ) {
      return { ...DEFAULT_PREFERENCES };
    }
    if (value.localDateTime && !isValidCotLocalDateTime(value.localDateTime)) {
      return { ...DEFAULT_PREFERENCES };
    }
    if (value.enabled && !value.localDateTime) {
      return { ...DEFAULT_PREFERENCES };
    }
    return { enabled: value.enabled, localDateTime: value.localDateTime };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const serializeCotCutoffPreferences = (
  preferences: CotCutoffPreferences,
): string => JSON.stringify({ version: STORAGE_VERSION, ...preferences });
