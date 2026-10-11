import { useMemo, useState } from "react";
import { Clock3, ExternalLink, RefreshCw, Truck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import {
  DEFAULT_VEHICLE_CHECK_HOURS,
  type VehicleCheckRow,
  type VehicleCheckWindow,
  type VehicleEtaSource,
  type VehiclePositionStatus,
} from "../utils/vehicleCheck";
import { fetchVehicleCheckRows } from "../utils/vehicleCheckData";
import {
  VEHICLE_CHECK_SPREADSHEET_URL,
  VEHICLE_TRAVEL_TIME_SHEET_NAME,
} from "../utils/vehicleCheckSheet";
import type { VehicleTravelTimeSource } from "../utils/vehicleTravelTime";

const numberFormatter = new Intl.NumberFormat("vi-VN");
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const formatUnixTime = (value: number): string =>
  dateTimeFormatter.format(new Date(value * 1_000));

const formatDuration = (minutes: number | null): string => {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (!hours) return remainMinutes + " phút";
  if (!remainMinutes) return hours + " giờ";
  return hours + " giờ " + remainMinutes + " phút";
};

const etaSourceLabel = (
  source: VehicleEtaSource,
  travelSource: VehicleTravelTimeSource | null,
): string => {
  if (source === "actual_arrival") return "ATA Pleiku";
  if (source === "pleiku_eta") return "trip_eta Pleiku";
  if (source === "pleiku_sta") return "trip_sta Pleiku";

  const travelLabel =
    travelSource === "sheet_config"
      ? "cấu hình Sheet"
      : travelSource === "sheet_history"
        ? "lịch sử ATA/ATD"
        : travelSource === "sheet_schedule"
          ? "lịch chạy trên Sheet"
          : "thời gian Sheet";

  if (source === "travel_atd") return "ATD + " + travelLabel;
  if (source === "travel_etd") return "ETD + " + travelLabel;
  if (source === "travel_std") return "STD + " + travelLabel;
  return "Chưa xác định";
};

const positionStatusLabel = (status: VehiclePositionStatus): string => {
  switch (status) {
    case "arrived":
      return "Đã đến Pleiku";
    case "departed_target":
      return "Đã rời Pleiku";
    case "in_transit":
      return "Đang chạy";
    case "at_station":
      return "Đang ở SOC";
    default:
      return "Chưa có ATA/ATD";
  }
};

const positionStatusClass = (status: VehiclePositionStatus): string => {
  switch (status) {
    case "arrived":
      return "badge badge-success whitespace-nowrap font-bold";
    case "in_transit":
      return "badge badge-info whitespace-nowrap font-bold";
    case "at_station":
      return "badge badge-warning whitespace-nowrap font-bold";
    case "departed_target":
      return "badge badge-neutral whitespace-nowrap font-bold";
    default:
      return "badge badge-ghost whitespace-nowrap font-bold";
  }
};

const formatRemainingTime = (eta: number | null): string => {
  if (eta === null) return "—";
  const diffMinutes = Math.round((eta * 1_000 - Date.now()) / 60_000);
  if (diffMinutes <= 0) return "Đã quá ETA";
  return formatDuration(diffMinutes);
};

const routeText = (row: VehicleCheckRow): string =>
  row.stations.map((station) => station.stationName).join(" → ") || "—";

export const CheckXePage = () => {
  const [hours, setHours] = useState(DEFAULT_VEHICLE_CHECK_HOURS);
  const [rows, setRows] = useState<VehicleCheckRow[]>([]);
  const [displayWindow, setDisplayWindow] =
    useState<VehicleCheckWindow | null>(null);
  const [sourceSheetName, setSourceSheetName] = useState("");
  const [sourceRowCount, setSourceRowCount] = useState(0);
  const [latestSheetUpdatedAt, setLatestSheetUpdatedAt] =
    useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const summaryText = useMemo(() => {
    if (!displayWindow) return "Từ thời điểm hiện tại đến +" + hours + " giờ";
    return (
      formatUnixTime(displayWindow.from) +
      " → " +
      formatUnixTime(displayWindow.to)
    );
  }, [displayWindow, hours]);

  const handleCheck = async () => {
    if (!Number.isFinite(hours) || hours <= 0) {
      showToast("Số giờ cần kiểm tra phải lớn hơn 0.", "warning");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchVehicleCheckRows(hours);
      setRows(result.rows);
      setDisplayWindow(result.displayWindow);
      setSourceSheetName(result.sourceSheetName);
      setSourceRowCount(result.sourceRowCount);
      setLatestSheetUpdatedAt(result.latestSheetUpdatedAt);
      setHasChecked(true);

      showToast(
        result.rows.length > 0
          ? "Tìm thấy " +
              result.rows.length +
              " trip dự kiến về Pleiku trong " +
              hours +
              " giờ tiếp theo."
          : "Không có trip phù hợp trong " + hours + " giờ tiếp theo.",
        result.rows.length > 0 ? "success" : "info",
      );
    } catch (error) {
      console.error("[Check xe · Google Sheet]", error);
      showToast(
        error instanceof Error && error.message
          ? error.message
          : "Không thể đọc dữ liệu Check xe từ Google Sheet.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={Truck}
        tone="info"
        title="Check xe"
        description="Đọc trực tiếp dữ liệu vận hành trên Google Sheet, không gọi API SPX. ATA/ATD được dùng để xác định xe đang ở đâu và ETA về Pleiku."
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:items-end">
            <label className="form-control w-full sm:w-44">
              <span className="label pb-1">
                <span className="label-text text-xs font-bold">
                  Số giờ cần check tiếp
                </span>
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={hours}
                disabled={loading}
                onChange={(event) => setHours(Number(event.target.value))}
                className="input input-bordered min-h-11 w-full rounded-xl"
                aria-label="Số giờ cần check tiếp"
              />
            </label>

            <button
              type="button"
              onClick={handleCheck}
              disabled={loading || !Number.isFinite(hours) || hours <= 0}
              className="btn btn-primary min-h-11 w-full gap-2 rounded-xl shadow-xs sm:w-auto"
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {loading ? "Đang đọc Sheet" : "Check xe"}
            </button>
          </div>
        }
      />

      <section className="app-surface p-3 sm:p-4" aria-live="polite">
        <div className="flex min-w-0 items-start gap-3">
          <span className="app-icon-badge shrink-0 bg-info/10 text-info">
            <Clock3 aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">
              Khung ETA Pleiku
            </p>
            <p className="mt-1 break-safe text-sm font-bold">{summaryText}</p>
            <p className="mt-1 text-xs text-base-content/60">
              {hasChecked
                ? "Đã đọc " +
                  numberFormatter.format(sourceRowCount) +
                  " dòng từ " +
                  (sourceSheetName || "gid=0") +
                  ". Có " +
                  numberFormatter.format(rows.length) +
                  " trip nằm trong khung đã chọn."
                : "Nguồn duy nhất: Google Sheet gid=0. Check xe không gọi API SPX."}
            </p>
            {latestSheetUpdatedAt !== null ? (
              <p className="mt-1 text-xs text-base-content/45">
                time_update mới nhất trên Sheet:{" "}
                {formatUnixTime(latestSheetUpdatedAt)}
              </p>
            ) : null}
          </div>
          <a
            href={VEHICLE_CHECK_SPREADSHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm shrink-0 gap-1.5"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Mở Sheet
          </a>
        </div>
      </section>

      <section aria-labelledby="vehicle-check-heading" className="space-y-3">
        <SectionHeading
          icon={Truck}
          id="vehicle-check-heading"
          title="Danh sách xe về Pleiku"
          description={
            "ATA mới nhất = đang ở SOC; ATD mới nhất = đang chạy từ SOC đó sang điểm kế tiếp. " +
            "ETA ưu tiên trip_eta Pleiku; nếu thiếu sẽ dùng thời gian trên tab " +
            VEHICLE_TRAVEL_TIME_SHEET_NAME +
            " hoặc thời gian học từ lịch sử trên chính Sheet."
          }
          tone="info"
        />

        <div className="app-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-sm min-w-[1660px]">
              <thead>
                <tr className="bg-base-200/70 text-xs uppercase tracking-wide text-base-content/65">
                  <th>LH Trip Number</th>
                  <th>Biển số</th>
                  <th>Vị trí hiện tại</th>
                  <th>Event cuối</th>
                  <th>ETA Pleiku</th>
                  <th>Còn lại</th>
                  <th>Nguồn ETA</th>
                  <th>SL vận chuyển</th>
                  <th>TO dỡ Pleiku</th>
                  <th>Loại xe</th>
                  <th>Nhà xe</th>
                  <th>Cập nhật Sheet</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.tripNumber + "-" + index} className="hover">
                    <td className="font-bold text-primary">{row.tripNumber}</td>
                    <td className="font-semibold">{row.vehiclePlateNumber}</td>
                    <td className="min-w-72">
                      <p className="font-bold">{row.currentPositionLabel}</p>
                      <p
                        className="mt-1 max-w-80 text-xs leading-relaxed text-base-content/45"
                        title={routeText(row)}
                      >
                        {routeText(row)}
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-sm tabular-nums">
                      {row.lastEventAt !== null
                        ? (row.lastEventType === "atd" ? "ATD " : "ATA ") +
                          formatUnixTime(row.lastEventAt)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap font-black tabular-nums">
                      {row.eta !== null ? formatUnixTime(row.eta) : "—"}
                    </td>
                    <td className="whitespace-nowrap text-sm font-semibold">
                      {formatRemainingTime(row.eta)}
                    </td>
                    <td className="min-w-44 text-sm text-base-content/70">
                      <span>
                        {etaSourceLabel(row.etaSource, row.travelTimeSource)}
                      </span>
                      {row.travelTimeMinutes !== null ? (
                        <span className="mt-0.5 block text-xs text-base-content/45">
                          {formatDuration(row.travelTimeMinutes)}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {numberFormatter.format(row.transportQuantity)}
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {row.targetUnloadTransportOrder === null
                        ? "—"
                        : numberFormatter.format(
                            row.targetUnloadTransportOrder,
                          )}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {row.vehicleTypeName}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {row.agencyName}
                    </td>
                    <td className="whitespace-nowrap text-sm tabular-nums text-base-content/60">
                      {row.sheetUpdatedAt !== null
                        ? formatUnixTime(row.sheetUpdatedAt)
                        : "—"}
                    </td>
                    <td>
                      <span className={positionStatusClass(row.positionStatus)}>
                        {positionStatusLabel(row.positionStatus)}
                      </span>
                    </td>
                  </tr>
                ))}

                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={13}>
                      <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
                        <Truck
                          className="h-8 w-8 text-base-content/30"
                          aria-hidden="true"
                        />
                        <p className="mt-3 text-sm font-bold">
                          {hasChecked
                            ? "Không có trip trong khung thời gian đã chọn"
                            : "Chưa đọc dữ liệu từ Sheet"}
                        </p>
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-base-content/55">
                          {hasChecked
                            ? "Các trip trên Sheet không có ETA Pleiku nằm trong số giờ bạn đã nhập."
                            : "Nhấn Check xe để đọc trực tiếp dữ liệu gid=0 của Google Sheet."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
