export interface CreateTimeRangeInput {
  fromLocalDateTime: string;
  toLocalDateTime: string;
}

export interface CreateTimeRange extends CreateTimeRangeInput {
  fromTimestamp: number;
  toTimestamp: number;
  ctime: string;
}

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DEFAULT_RANGE_MONTHS = 6;

const pad = (value: number): string => String(value).padStart(2, "0");

const subtractCalendarMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  const day = result.getDate();

  // Move to the first day before changing month so dates such as August 31
  // do not overflow into the following month.
  result.setDate(1);
  result.setMonth(result.getMonth() - months);

  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));

  return result;
};

export const formatCreateTimeLocalDateTime = (date = new Date()): string => {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Create time không hợp lệ.");
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const parseCreateTimeLocalDateTime = (value: string): Date => {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error("Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc.");
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
  ].map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error("Create time không hợp lệ.");
  }

  return date;
};

export const createDefaultCreateTimeRangeInput = (
  now = new Date(),
): CreateTimeRangeInput => {
  if (Number.isNaN(now.getTime())) {
    throw new Error("Create time không hợp lệ.");
  }

  const from = subtractCalendarMonths(now, DEFAULT_RANGE_MONTHS);

  return {
    fromLocalDateTime: formatCreateTimeLocalDateTime(from),
    toLocalDateTime: formatCreateTimeLocalDateTime(now),
  };
};

export const createDefaultCreateTimeRange = (
  now = new Date(),
): CreateTimeRange => {
  if (Number.isNaN(now.getTime())) {
    throw new Error("Create time không hợp lệ.");
  }

  const from = subtractCalendarMonths(now, DEFAULT_RANGE_MONTHS);
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  const toTimestamp = Math.floor(now.getTime() / 1000);

  return {
    fromLocalDateTime: formatCreateTimeLocalDateTime(from),
    toLocalDateTime: formatCreateTimeLocalDateTime(now),
    fromTimestamp,
    toTimestamp,
    ctime: `${fromTimestamp},${toTimestamp}`,
  };
};

export const createCreateTimeRange = (
  fromLocalDateTime: string,
  toLocalDateTime: string,
): CreateTimeRange => {
  const from = parseCreateTimeLocalDateTime(fromLocalDateTime);
  const toMinuteStart = parseCreateTimeLocalDateTime(toLocalDateTime);
  const toMinuteEnd = new Date(toMinuteStart.getTime() + 59_000);

  const fromTimestamp = Math.floor(from.getTime() / 1000);
  const toTimestamp = Math.floor(toMinuteEnd.getTime() / 1000);

  if (fromTimestamp > toTimestamp) {
    throw new Error(
      "Create time bắt đầu phải nhỏ hơn hoặc bằng thời gian kết thúc.",
    );
  }

  return {
    fromLocalDateTime,
    toLocalDateTime,
    fromTimestamp,
    toTimestamp,
    ctime: `${fromTimestamp},${toTimestamp}`,
  };
};
