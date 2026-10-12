import apiClient from "./apiClient.ts";
import { getConfigs } from "./config.ts";
import {
  createVehicleCheckDisplayWindow,
  createVehicleCheckParams,
  createVehicleCheckQueryWindow,
  isVehicleCheckRowVisible,
  parseVehicleCheckResponse,
  VEHICLE_CHECK_PAGE_SIZE,
  VEHICLE_CHECK_PATH,
  type VehicleCheckRow,
  type VehicleCheckWindow,
} from "./vehicleCheck.ts";

export interface VehicleCheckResult {
  rows: VehicleCheckRow[];
  apiTotal: number;
  candidateCount: number;
  calculatedEtaCount: number;
  displayedCount: number;
  queryWindow: VehicleCheckWindow;
  displayWindow: VehicleCheckWindow;
  pagesFetched: number;
}

export interface VehicleCheckApiDependency {
  get(
    path: string,
    options: {
      params: ReturnType<typeof createVehicleCheckParams>;
      suppressErrorToast: true;
    },
  ): Promise<{ data: unknown }>;
}

const resolveConfiguredRouteMinutes = (): Record<string, number> => {
  const config = getConfigs();
  if (
    config.soc.trim().toLocaleLowerCase("vi-VN") !==
      "pleiku soc" ||
    !config.soc_id
  ) {
    return {};
  }
  return { ...(config.soc_eta_minutes?.[config.soc_id] || {}) };
};

const sortRows = (
  first: VehicleCheckRow,
  second: VehicleCheckRow,
): number => {
  const firstProcessing = first.pleikuStationStatus !== 0;
  const secondProcessing = second.pleikuStationStatus !== 0;
  if (firstProcessing !== secondProcessing) {
    return firstProcessing ? -1 : 1;
  }

  const firstEta = first.etaPleiku ?? Number.MAX_SAFE_INTEGER;
  const secondEta = second.etaPleiku ?? Number.MAX_SAFE_INTEGER;
  return (
    firstEta - secondEta ||
    first.tripNumber.localeCompare(second.tripNumber)
  );
};

export const fetchVehicleCheckRows = async (
  hours: number,
  nowMs = Date.now(),
  dependency: VehicleCheckApiDependency = apiClient,
): Promise<VehicleCheckResult> => {
  const queryWindow = createVehicleCheckQueryWindow(nowMs);
  const displayWindow = createVehicleCheckDisplayWindow(
    nowMs,
    hours,
  );
  const routeMinutes = resolveConfiguredRouteMinutes();
  const uniqueRows = new Map<string, VehicleCheckRow>();

  let apiTotal = 0;
  let totalPages = 1;
  let pagesFetched = 0;

  for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
    const response = await dependency.get(VEHICLE_CHECK_PATH, {
      params: createVehicleCheckParams(queryWindow, pageNo),
      suppressErrorToast: true,
    });
    const page = parseVehicleCheckResponse(
      response.data,
      routeMinutes,
    );
    pagesFetched += 1;

    if (pageNo === 1) {
      apiTotal = page.total;
      totalPages = Math.max(
        1,
        Math.ceil(apiTotal / VEHICLE_CHECK_PAGE_SIZE),
      );
    }

    page.rows.forEach((row, index) => {
      const key =
        row.tripNumber !== "—"
          ? row.tripNumber
          : "missing-" + pageNo + "-" + index;
      uniqueRows.set(key, row);
    });
  }

  const candidates = Array.from(uniqueRows.values());
  const calculatedEtaCount = candidates.filter(
    (row) => row.etaPleiku !== null,
  ).length;
  const rows = candidates
    .filter((row) =>
      isVehicleCheckRowVisible(row, displayWindow),
    )
    .sort(sortRows);

  return {
    rows,
    apiTotal,
    candidateCount: candidates.length,
    calculatedEtaCount,
    displayedCount: rows.length,
    queryWindow,
    displayWindow,
    pagesFetched,
  };
};
