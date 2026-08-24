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

type GoogleAppsScriptGlobal = typeof globalThis & {
  google?: { script?: { run?: StationCatalogRunner } };
};

const getDefaultRunner = (): StationCatalogRunner | null =>
  (globalThis as GoogleAppsScriptGlobal).google?.script?.run ?? null;

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
    throw new Error(`${label} đang thiếu ${key === "stationName" ? "tên" : key === "stationCode" ? "mã" : "ID"}.`);
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
      typeof record.numberPrefix === "string"
        ? record.numberPrefix.trim()
        : "";

    assertUnique(names, normalizeKey(stationName), "station_name", "Danh mục LIST SOC");
    assertUnique(codes, normalizeKey(stationCode), "station_code", "Danh mục LIST SOC");
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

  const names = new Set<string>();
  const codes = new Set<string>();
  const ids = new Set<string>();

  return value.map((item, index) => {
    const label = `Hub tại vị trí ${index + 1}`;
    const record = toRecord(item, label);
    const stationName = readRequiredString(record, "stationName", label);
    const stationCode = readRequiredString(record, "stationCode", label);
    const id = readRequiredString(record, "id", label);

    assertUnique(names, normalizeKey(stationName), "tên", "Danh sách Hub");
    assertUnique(codes, normalizeKey(stationCode), "mã", "Danh sách Hub");
    assertUnique(ids, id, "ID", "Danh sách Hub");

    return { stationName, stationCode, id };
  });
};

const toStationCatalogError = (error: unknown): Error => {
  if (error instanceof Error && error.message.trim()) return error;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message).trim();
    if (message) return new Error(message);
  }

  return new Error("Không thể tải dữ liệu từ LIST SOC.");
};

const runCatalogCall = <T>(
  runner: StationCatalogRunner | null,
  invoke: (activeRunner: StationCatalogRunner) => void,
  normalize: (value: unknown) => T,
): Promise<T> => {
  if (!runner) {
    return Promise.reject(
      new Error("Không tìm thấy Google Apps Script để tải LIST SOC."),
    );
  }

  return new Promise((resolve, reject) => {
    try {
      const activeRunner = runner
        .withSuccessHandler((value) => {
          try {
            resolve(normalize(value));
          } catch (error) {
            reject(toStationCatalogError(error));
          }
        })
        .withFailureHandler((error) => {
          reject(toStationCatalogError(error));
        });
      invoke(activeRunner);
    } catch (error) {
      reject(toStationCatalogError(error));
    }
  });
};

export const loadStationCatalog = (
  runner: StationCatalogRunner | null = getDefaultRunner(),
): Promise<StationCatalogSoc[]> =>
  runCatalogCall(
    runner,
    (activeRunner) => activeRunner.getStationCatalog(),
    normalizeStationCatalog,
  );

export const loadStationHubs = (
  socId: string,
  runner: StationCatalogRunner | null = getDefaultRunner(),
): Promise<StationCatalogHub[]> => {
  const normalizedSocId = socId.trim();
  if (!normalizedSocId) {
    return Promise.reject(new Error("Hãy chọn SOC trước khi tải Hub."));
  }

  return runCatalogCall(
    runner,
    (activeRunner) => activeRunner.getStationHubs(normalizedSocId),
    normalizeStationHubs,
  );
};
