import {
  createVehicleCheckParams,
  createVehicleCheckWindow,
  parseVehicleCheckResponse,
  VEHICLE_CHECK_PAGE_SIZE,
  VEHICLE_CHECK_PATH,
  type VehicleCheckRow,
  type VehicleCheckWindow,
} from "./vehicleCheck.ts";

export interface VehicleCheckApiDependency {
  get(
    path: string,
    options: {
      params: ReturnType<typeof createVehicleCheckParams>;
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

    if (page.rows.length === 0) break;
  }

  return {
    rows: Array.from(uniqueRows.values()),
    total,
    window,
  };
};
