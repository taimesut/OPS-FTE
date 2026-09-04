import { EMBEDDED_STATIONS_1 } from "../data/embeddedStationData1";
import { EMBEDDED_STATIONS_2 } from "../data/embeddedStationData2";
import { EMBEDDED_STATIONS_3 } from "../data/embeddedStationData3";

export interface StationCatalogSoc {
  stationName: string;
  stationCode: string;
  id: string;
  numberPrefix: string;
}

export interface StationCatalogHub {
  stationName: string;
  stationCode: string;
  id: string;
}

export interface StationCatalogRunner {
  withSuccessHandler(
    handler: (value: unknown) => void,
  ): StationCatalogRunner;
  withFailureHandler(
    handler: (error: unknown) => void,
  ): StationCatalogRunner;
  getStationCatalog(): void;
  getStationHubs(socId: string): void;
}

type EmbeddedStation = {
  readonly stationName: string;
  readonly stationCode: string;
  readonly id: string;
  readonly numberPrefix: string;
  readonly hubs: readonly (readonly [string, string, string])[];
};

const EMBEDDED_STATIONS: readonly EmbeddedStation[] = [
  ...EMBEDDED_STATIONS_1,
  ...EMBEDDED_STATIONS_2,
  ...EMBEDDED_STATIONS_3,
];

const normalizeKey = (value: string): string =>
  value.toLocaleLowerCase("vi-VN");

const toRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return value as Record<string, unknown>;
};

const readRequiredString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  if (typeof record[key] !== "string" || !record[key].trim()) {
    throw new Error(
      `${label} đang thiếu ${
        key === "stationName" ? "tên" : key === "stationCode" ? "mã" : "ID"
      }.`,
    );
  }
  return record[key].trim();
};

const assertUnique = (
  seen: Set<string>,
  value: string,
  field: string,
  label: string,
): void => {
  if (seen.has(value)) {
    throw new Error(`${label} bị trùng ${field}.`);
  }
  seen.add(value);
};

export const normalizeStationCatalog = (
  value: unknown,
): StationCatalogSoc[] => {
  if (!Array.isArray(value)) {
    throw new Error("Danh mục LIST SOC không hợp lệ.");
  }
  if (!value.length) {
    throw new Error("Danh mục LIST SOC không có SOC nào.");
  }

  const names = new Set<string>();
  const codes = new Set<string>();
  const ids = new Set<string>();

  return value.map((item, index) => {
    const label = `SOC tại vị trí ${index + 1}`;
    const record = toRecord(item, label);
    const stationName = readRequiredString(record, "stationName", label);
    const stationCode = readRequiredString(record, "stationCode", label);
    const id = readRequiredString(record, "id", label);
    const numberPrefix =
      typeof record.numberPrefix === "string" ? record.numberPrefix.trim() : "";

    assertUnique(
      names,
      normalizeKey(stationName),
      "station_name",
      "Danh mục LIST SOC",
    );
    assertUnique(
      codes,
      normalizeKey(stationCode),
      "station_code",
      "Danh mục LIST SOC",
    );
    assertUnique(ids, id, "ID", "Danh mục LIST SOC");

    return { stationName, stationCode, id, numberPrefix };
  });
};

export const normalizeStationHubs = (
  value: unknown,
): StationCatalogHub[] => {
  if (!Array.isArray(value)) {
    throw new Error("Danh sách Hub nội tỉnh không hợp lệ.");
  }

  return value.map((item, index) => {
    const label = `Hub tại vị trí ${index + 1}`;
    const record = toRecord(item, label);
    const stationName = readRequiredString(record, "stationName", label);
    const stationCode = readRequiredString(record, "stationCode", label);
    const id = readRequiredString(record, "id", label);

    return { stationName, stationCode, id };
  });
};

const LOCAL_CATALOG: StationCatalogSoc[] = EMBEDDED_STATIONS.map(
  ({ stationName, stationCode, id, numberPrefix }) => ({
    stationName,
    stationCode,
    id,
    numberPrefix,
  }),
);

export const loadStationCatalog = (): Promise<StationCatalogSoc[]> =>
  Promise.resolve(LOCAL_CATALOG.map((item) => ({ ...item })));

export const loadStationHubs = (
  socId: string,
): Promise<StationCatalogHub[]> => {
  const normalizedSocId = socId.trim();
  if (!normalizedSocId) {
    return Promise.reject(new Error("Hãy chọn SOC trước khi tải Hub."));
  }

  const station = EMBEDDED_STATIONS.find(({ id }) => id === normalizedSocId);
  if (!station) {
    return Promise.reject(
      new Error("Không tìm thấy SOC trong dữ liệu được đóng gói cùng ứng dụng."),
    );
  }

  return Promise.resolve(
    station.hubs.map(([stationName, stationCode, id]) => ({
      stationName,
      stationCode,
      id,
    })),
  );
};
