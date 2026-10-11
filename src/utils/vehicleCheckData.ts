import {
  buildVehicleCheckRowsFromSheet,
  createVehicleCheckDisplayWindow,
  isVehicleCheckRowInDisplayWindow,
  type VehicleCheckRow,
  type VehicleCheckWindow,
} from "./vehicleCheck.ts";
import { loadVehicleCheckSheetBundle } from "./vehicleCheckSheet.ts";

export interface VehicleCheckResult {
  rows: VehicleCheckRow[];
  displayWindow: VehicleCheckWindow;
  sourceSheetName: string;
  sourceRowCount: number;
  latestSheetUpdatedAt: number | null;
  eligibleTripCount: number;
  excludedByWindowCount: number;
  unknownEtaActiveCount: number;
}

const sortVehicleRows = (
  first: VehicleCheckRow,
  second: VehicleCheckRow,
): number => {
  const firstEta = first.eta ?? Number.MAX_SAFE_INTEGER;
  const secondEta = second.eta ?? Number.MAX_SAFE_INTEGER;
  return firstEta - secondEta || first.tripNumber.localeCompare(second.tripNumber);
};

export const fetchVehicleCheckRows = async (
  hours: number,
  nowMs = Date.now(),
): Promise<VehicleCheckResult> => {
  const displayWindow = createVehicleCheckDisplayWindow(nowMs, hours);
  const bundle = await loadVehicleCheckSheetBundle();
  const built = buildVehicleCheckRowsFromSheet(
    bundle.table,
    bundle.travelTimes,
  );

  const eligibleRows = built.rows.filter(
    (row) =>
      row.positionStatus !== "arrived" &&
      row.positionStatus !== "departed_target",
  );
  const rows = eligibleRows
    .filter((row) => isVehicleCheckRowInDisplayWindow(row, displayWindow))
    .sort(sortVehicleRows);

  return {
    rows,
    displayWindow,
    sourceSheetName: bundle.table.sheetName,
    sourceRowCount: bundle.table.sourceRowCount,
    latestSheetUpdatedAt: built.latestSheetUpdatedAt,
    eligibleTripCount: eligibleRows.length,
    excludedByWindowCount: Math.max(0, eligibleRows.length - rows.length),
    unknownEtaActiveCount: eligibleRows.filter(
      (row) =>
        row.eta === null &&
        (row.positionStatus === "in_transit" ||
          row.positionStatus === "at_station"),
    ).length,
  };
};
