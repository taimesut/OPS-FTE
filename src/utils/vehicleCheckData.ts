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

  return {
    rows: built.rows
      .filter((row) => isVehicleCheckRowInDisplayWindow(row, displayWindow))
      .sort(sortVehicleRows),
    displayWindow,
    sourceSheetName: bundle.table.sheetName,
    sourceRowCount: bundle.table.sourceRowCount,
    latestSheetUpdatedAt: built.latestSheetUpdatedAt,
  };
};
