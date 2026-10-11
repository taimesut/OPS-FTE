import {
  parseVehicleTravelTimeMinutes,
  type VehicleTravelTimeEntry,
} from "./vehicleTravelTime.ts";

export const VEHICLE_CHECK_SPREADSHEET_ID =
  "1KtjQsrdSR0mvyxrL_sKo3ScOP-ELQ873iuUdLjMajWM";
export const VEHICLE_CHECK_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/" +
  VEHICLE_CHECK_SPREADSHEET_ID +
  "/edit?gid=0#gid=0";
export const VEHICLE_CHECK_SOURCE_SHEET_ID = 0;
export const VEHICLE_TRAVEL_TIME_SHEET_NAME = "CHECK XE";

export interface VehicleCheckSheetTable {
  headers: string[];
  rows: string[][];
  sheetName: string;
  sourceRowCount: number;
}

export interface VehicleCheckSheetBundle {
  table: VehicleCheckSheetTable;
  travelTimes: VehicleTravelTimeEntry[];
}

interface GasRunner {
  withSuccessHandler(handler: (value: unknown) => void): GasRunner;
  withFailureHandler(handler: (error: unknown) => void): GasRunner;
  getVehicleCheckSheetBundle(): void;
}

interface GmResponse {
  status: number;
  responseText: string;
  finalUrl?: string;
}

type GmXmlHttpRequest = (details: {
  method: "GET";
  url: string;
  anonymous?: boolean;
  onload: (response: GmResponse) => void;
  onerror: () => void;
  ontimeout?: () => void;
  timeout?: number;
}) => void;

type RuntimeGlobal = typeof globalThis & {
  google?: { script?: { run?: GasRunner } };
  GM_xmlhttpRequest?: GmXmlHttpRequest;
};

const getGasRunner = (): GasRunner | null =>
  (globalThis as RuntimeGlobal).google?.script?.run ?? null;

const getGmRequest = (): GmXmlHttpRequest | null => {
  const request = (globalThis as RuntimeGlobal).GM_xmlhttpRequest;
  return typeof request === "function" ? request : null;
};

const normalizeCell = (value: unknown): string =>
  value == null ? "" : String(value).trim();

const normalizeGasBundle = (value: unknown): VehicleCheckSheetBundle => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Dữ liệu Sheet Check xe không hợp lệ.");
  }

  const root = value as Record<string, unknown>;
  const tableValue =
    typeof root.table === "object" && root.table !== null
      ? (root.table as Record<string, unknown>)
      : null;
  if (!tableValue) {
    throw new Error("Dữ liệu Sheet Check xe thiếu bảng nguồn.");
  }

  const headers = Array.isArray(tableValue.headers)
    ? tableValue.headers.map(normalizeCell)
    : [];
  const rows = Array.isArray(tableValue.rows)
    ? tableValue.rows
        .filter(Array.isArray)
        .map((row) => (row as unknown[]).map(normalizeCell))
    : [];

  if (!headers.length) {
    throw new Error("Sheet Check xe chưa có hàng tiêu đề.");
  }

  const travelTimes = Array.isArray(root.travelTimes)
    ? root.travelTimes
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null,
        )
        .map((item) => ({
          stationName: normalizeCell(
            item.stationName ?? item.station_name ?? item.soc,
          ),
          minutes: Number(item.minutes),
        }))
        .filter(
          (item) =>
            item.stationName &&
            Number.isFinite(item.minutes) &&
            item.minutes > 0,
        )
    : [];

  return {
    table: {
      headers,
      rows,
      sheetName: normalizeCell(tableValue.sheetName) || "gid=0",
      sourceRowCount:
        typeof tableValue.sourceRowCount === "number" &&
        Number.isFinite(tableValue.sourceRowCount)
          ? tableValue.sourceRowCount
          : rows.length,
    },
    travelTimes,
  };
};

const loadViaGas = (runner: GasRunner): Promise<VehicleCheckSheetBundle> =>
  new Promise((resolve, reject) => {
    try {
      runner
        .withSuccessHandler((value) => {
          try {
            resolve(normalizeGasBundle(value));
          } catch (error) {
            reject(error);
          }
        })
        .withFailureHandler((error) => {
          reject(
            error instanceof Error
              ? error
              : new Error("Không thể đọc Sheet Check xe."),
          );
        })
        .getVehicleCheckSheetBundle();
    } catch (error) {
      reject(error);
    }
  });

const requestText = async (url: string): Promise<string> => {
  const gmRequest = getGmRequest();
  if (gmRequest) {
    return new Promise((resolve, reject) => {
      gmRequest({
        method: "GET",
        url,
        anonymous: false,
        timeout: 30_000,
        onload: (response) => {
          if (response.status >= 200 && response.status < 400) {
            resolve(response.responseText);
            return;
          }
          reject(
            new Error(
              "Không đọc được Google Sheet. HTTP " + response.status + ".",
            ),
          );
        },
        onerror: () =>
          reject(new Error("Không thể kết nối tới Google Sheet.")),
        ontimeout: () =>
          reject(new Error("Google Sheet phản hồi quá lâu.")),
      });
    });
  }

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(
      "Không đọc được Google Sheet. HTTP " + response.status + ".",
    );
  }
  return response.text();
};

export const parseCsvTable = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
};

const assertLooksLikeCsv = (text: string): void => {
  const prefix = text.trimStart().slice(0, 120).toLocaleLowerCase("en-US");
  if (prefix.startsWith("<!doctype") || prefix.startsWith("<html")) {
    throw new Error(
      "Google Sheet yêu cầu đăng nhập hoặc tài khoản hiện tại không có quyền.",
    );
  }
};

const loadMainTableDirect = async (): Promise<VehicleCheckSheetTable> => {
  const url =
    "https://docs.google.com/spreadsheets/d/" +
    VEHICLE_CHECK_SPREADSHEET_ID +
    "/gviz/tq?tqx=out:csv&gid=" +
    VEHICLE_CHECK_SOURCE_SHEET_ID;
  const text = await requestText(url);
  assertLooksLikeCsv(text);
  const matrix = parseCsvTable(text);

  if (!matrix.length || !matrix[0]?.length) {
    throw new Error("Sheet gid=0 chưa có dữ liệu.");
  }

  const headers = matrix[0].map(normalizeCell);
  const rows = matrix
    .slice(1)
    .map((row) => row.map(normalizeCell))
    .filter((row) => row.some(Boolean));

  return {
    headers,
    rows,
    sheetName: "gid=0",
    sourceRowCount: rows.length,
  };
};

const loadTravelTimesDirect = async (): Promise<VehicleTravelTimeEntry[]> => {
  const url =
    "https://docs.google.com/spreadsheets/d/" +
    VEHICLE_CHECK_SPREADSHEET_ID +
    "/gviz/tq?tqx=out:csv&sheet=" +
    encodeURIComponent(VEHICLE_TRAVEL_TIME_SHEET_NAME);

  try {
    const text = await requestText(url);
    assertLooksLikeCsv(text);
    const matrix = parseCsvTable(text).filter((row) => row.some(Boolean));
    if (!matrix.length) return [];

    const normalizedHeader = matrix[0].map((value) =>
      normalizeCell(value).toLocaleLowerCase("vi-VN"),
    );
    const stationHeaderIndex = normalizedHeader.findIndex((value) =>
      ["soc", "station", "station_name", "tên soc", "ten soc"].includes(value),
    );
    const timeHeaderIndex = normalizedHeader.findIndex((value) =>
      [
        "minutes",
        "minute",
        "thời gian",
        "thoi gian",
        "thời gian về pleiku",
        "thoi gian ve pleiku",
      ].includes(value),
    );

    const hasHeader = stationHeaderIndex >= 0 && timeHeaderIndex >= 0;
    const stationIndex = hasHeader ? stationHeaderIndex : 0;
    const timeIndex = hasHeader ? timeHeaderIndex : 1;
    const rows = hasHeader ? matrix.slice(1) : matrix;

    return rows
      .map((row) => {
        const stationName = normalizeCell(row[stationIndex]);
        const minutes = parseVehicleTravelTimeMinutes(row[timeIndex]);
        return stationName && minutes
          ? { stationName, minutes }
          : null;
      })
      .filter((item): item is VehicleTravelTimeEntry => item !== null);
  } catch {
    return [];
  }
};

export const loadVehicleCheckSheetBundle =
  async (): Promise<VehicleCheckSheetBundle> => {
    const runner = getGasRunner();
    if (runner) {
      return loadViaGas(runner);
    }

    const [table, travelTimes] = await Promise.all([
      loadMainTableDirect(),
      loadTravelTimesDirect(),
    ]);
    return { table, travelTimes };
  };
