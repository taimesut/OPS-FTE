import {
  createVehicleCheckParams,
  createVehicleCheckWindow,
  parseVehicleCheckResponse,
  parseVehicleLocationResponse,
  VEHICLE_CHECK_PAGE_SIZE,
  VEHICLE_CHECK_PATH,
  VEHICLE_LOCATION_PATH,
  type VehicleCheckRow,
  type VehicleCheckWindow,
  type VehicleLocationInfo,
} from "./vehicleCheck.ts";

const VEHICLE_LOCATION_CONCURRENCY = 5;

export interface VehicleCheckApiDependency {
  get(
    path: string,
    options: {
      params?: ReturnType<typeof createVehicleCheckParams>;
      suppressErrorToast: true;
    },
  ): Promise<{ data: unknown }>;
}

export interface VehicleCheckResult {
  rows: VehicleCheckRow[];
  total: number;
  window: VehicleCheckWindow;
}

const loadApiDependency = async (): Promise<VehicleCheckApiDependency> => {
  const { default: apiClient } = await import("./apiClient.ts");
  return {
    get: (path, options) => apiClient.get(path, options),
  };
};

export const fetchVehicleLocation = async (
  tripId: number,
  dependency?: VehicleCheckApiDependency,
): Promise<VehicleLocationInfo> => {
  const client = dependency ?? (await loadApiDependency());
  const response = await client.get(
    `${VEHICLE_LOCATION_PATH}?trip_id=${encodeURIComponent(String(tripId))}`,
    { suppressErrorToast: true },
  );
  return parseVehicleLocationResponse(response.data);
};

const enrichHeldRowsWithLocation = async (
  rows: VehicleCheckRow[],
  client: VehicleCheckApiDependency,
): Promise<VehicleCheckRow[]> => {
  const nextRows = rows.map((row) => ({ ...row }));
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= nextRows.length) return;

      const row = nextRows[index];
      if (row.movementStatus !== "held" || row.tripId === null) continue;

      try {
        const location = await fetchVehicleLocation(row.tripId, client);
        nextRows[index] = {
          ...row,
          eta: location.eta,
          lastLocationUpdatedAt: location.lastUpdatedAt,
        };
      } catch (error) {
        console.warn(
          `[Check xe] Không thể tải location cho trip ${row.tripNumber}`,
          error,
        );
      }
    }
  };

  const workerCount = Math.min(
    VEHICLE_LOCATION_CONCURRENCY,
    Math.max(1, nextRows.length),
  );
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return nextRows;
};

export const fetchVehicleCheckRows = async (
  hours: number,
  nowMs = Date.now(),
  dependency?: VehicleCheckApiDependency,
): Promise<VehicleCheckResult> => {
  const client = dependency ?? (await loadApiDependency());
  const window = createVehicleCheckWindow(nowMs, hours);
  const uniqueRows = new Map<string, VehicleCheckRow>();
  let total = 0;
  let totalPages = 1;

  for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
    const response = await client.get(VEHICLE_CHECK_PATH, {
      params: createVehicleCheckParams(window, pageNo),
      suppressErrorToast: true,
    });
    const page = parseVehicleCheckResponse(response.data);

    if (pageNo === 1) {
      total = page.total;
      totalPages = Math.max(1, Math.ceil(total / VEHICLE_CHECK_PAGE_SIZE));
    }

    page.rows.forEach((row, rowIndex) => {
      const key =
        row.tripNumber !== "—"
          ? row.tripNumber
          : `missing-${pageNo}-${rowIndex}`;
      uniqueRows.set(key, row);
    });
  }

  const rows = await enrichHeldRowsWithLocation(
    Array.from(uniqueRows.values()),
    client,
  );

  return {
    rows,
    total,
    window,
  };
};
