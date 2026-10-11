import { useMemo, useState } from "react";
import {
  Clock3,
  ExternalLink,
  RefreshCw,
  Save,
  Truck,
} from "lucide-react";
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
import { fetchVehicleCheckRows } from "../utils/vehicleCheckApi";
import {
  loadStoredVehicleTravelTimeRules,
  parseVehicleTravelTimeRules,
  saveVehicleTravelTimeRules,
  VEHICLE_TRAVEL_TIME_SHEET_NAME,
  VEHICLE_TRAVEL_TIME_SPREADSHEET_URL,
} from "../utils/vehicleTravelTime";

const numberFormatter = new Intl.NumberFormat("vi-VN");
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const formatUnixTime = (value: number): string =>
  dateTimeFormatter.format(new Date(value * 1_000));

const etaSourceLabel = (source: VehicleEtaSource): string => {
  switch (source) {
    case "actual_arrival":
      return "ATA Pleiku";
    case "pleiku_eta":
      return "ETA Pleiku";
    case "travel_atd":
      return "ATD + thời gian tuyến";
    case "travel_etd":
      return "ETD + thời gian tuyến";
    case "travel_std":
      return "STD + thời gian tuyến";
    case "trip_location":
      return "Trip Location";
    case "pleiku_sta":
      return "STA Pleiku";
    default:
      return "Chưa xác định";
  }
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

const formatRemainingTime = (
  eta: number | null,
  status: VehiclePositionStatus,
): string => {
  if (status === "arrived") return "Đã đến";
  if (eta === null) return "—";

  const diffMinutes = Math.round((eta * 1_000 - Date.now()) / 60_000);
  if (diffMinutes <= 0) return "Đã quá ETA";

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours <= 0) return minutes + " phút";
  if (minutes === 0) return hours + " giờ";
  return hours + " giờ " + minutes + " phút";
};

const routeText = (row: VehicleCheckRow): string =>
  row.stations.map((station) => station.stationName).join(" → ") || "—";

export const CheckXePage = () => {
  const [hours, setHours] = useState(DEFAULT_VEHICLE_CHECK_HOURS);
  const [rows, setRows] = useState<VehicleCheckRow[]>([]);
  const [total, setTotal] = useState(0);
  const [displayWindow, setDisplayWindow] =
    useState<VehicleCheckWindow | null>(null);
  const [queryWindow, setQueryWindow] =
    useState<VehicleCheckWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [travelRules, setTravelRules] = useState(() =>
    loadStoredVehicleTravelTimeRules(),
  );

  const travelRuleResult = useMemo(
    () => parseVehicleTravelTimeRules(travelRules),
    [travelRules],
  );

  const summaryText = useMemo(() => {
    if (!displayWindow) return "Từ thời điểm hiện tại đến +" + hours + " giờ";
    return (
      formatUnixTime(displayWindow.from) +
      " → " +
      formatUnixTime(displayWindow.to)
    );
  }, [displayWindow, hours]);

  const queryWindowText = useMemo(() => {
    if (!queryWindow) return "API luôn quét từ -2 ngày đến +1 ngày";
    return (
      formatUnixTime(queryWindow.from) +
      " → " +
      formatUnixTime(queryWindow.to)
    );
  }, [queryWindow]);

  const handleSaveTravelRules = () => {
    if (travelRuleResult.errors.length > 0) {
      showToast(travelRuleResult.errors[0], "warning");
      return;
    }

    saveVehicleTravelTimeRules(travelRules);
    showToast(
      "Đã lưu " +
        numberFormatter.format(travelRuleResult.entries.length) +
        " thời gian tuyến về Pleiku.",
      "success",
    );
  };

  const handleCheck = async () => {
    if (!Number.isFinite(hours) || hours <= 0) {
      showToast("Số giờ cần kiểm tra phải lớn hơn 0.", "warning");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchVehicleCheckRows(hours);
      setRows(result.rows);
      setTotal(result.total);
      setDisplayWindow(result.displayWindow);
      setQueryWindow(result.queryWindow);
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
      console.error("[Check xe]", error);
      showToast(
        error instanceof Error && error.message
          ? error.message
          : "Không thể tải danh sách xe.",
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
        description="Xác định xe đang ở SOC nào hoặc đang chạy giữa 2 SOC bằng ATA/ATD, sau đó ước tính giờ về Pleiku."
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
              {loading ? "Đang kiểm tra" : "Check xe"}
            </button>
          </div>
        }
      />

      <section className="app-surface p-3 sm:p-4" aria-live="polite">
        <div className="flex min-w-0 items-start gap-3">
          <span className="app-icon-badge shrink-0 bg-info/10 text-info">
            <Clock3 aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">
              Khung thời gian hiển thị — ETA/STA Pleiku
            </p>
            <p className="mt-1 break-safe text-sm font-bold">{summaryText}</p>
            <p className="mt-1 text-xs text-base-content/60">
              {hasChecked
                ? "Có " +
                  numberFormatter.format(rows.length) +
                  " trip phù hợp trong " +
                  numberFormatter.format(total) +
                  " trip API trả về"
                : "Ưu tiên ATA/ETA Pleiku; nếu chưa có sẽ tính từ ATD/ETD/STD của SOC hiện tại + thời gian tuyến."}
            </p>
            <p className="mt-1 text-xs text-base-content/45">
              Khung API nền: {queryWindowText}
            </p>
          </div>
        </div>
      </section>

      <details className="app-surface p-4">
        <summary className="cursor-pointer font-bold">
          Thời gian SOC → Pleiku
          <span className="ml-2 text-xs font-semibold text-base-content/50">
            {travelRuleResult.entries.length} tuyến lưu trên trình duyệt
          </span>
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-base-content/65">
            Mỗi dòng nhập theo dạng SOC | giờ di chuyển. Hỗ trợ 4:30, 4.5,
            4h30 hoặc 270 phút. Cấu hình trên trình duyệt sẽ ưu tiên hơn dữ
            liệu từ Google Sheet.
          </p>
          <textarea
            value={travelRules}
            onChange={(event) => setTravelRules(event.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"BMT SOC | 4:30\nGia Nghia SOC | 6:30\nKon Tum SOC | 1:30"}
            className="textarea textarea-bordered w-full rounded-xl font-mono text-sm"
          />
          {travelRuleResult.errors.length > 0 ? (
            <p className="text-sm font-semibold text-error">
              {travelRuleResult.errors[0]}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={VEHICLE_TRAVEL_TIME_SPREADSHEET_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost min-h-10 justify-start gap-2 px-2 text-sm"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Sheet nguồn · tab {VEHICLE_TRAVEL_TIME_SHEET_NAME}
            </a>
            <button
              type="button"
              onClick={handleSaveTravelRules}
              className="btn btn-outline min-h-10 gap-2 rounded-xl"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Lưu thời gian tuyến
            </button>
          </div>
        </div>
      </details>

      <section aria-labelledby="vehicle-check-heading" className="space-y-3">
        <SectionHeading
          icon={Truck}
          id="vehicle-check-heading"
          title="Danh sách xe về Pleiku"
          description="Vị trí lấy theo event thực tế mới nhất: ATA = đang ở SOC, ATD = đang chạy từ SOC đó đến trạm kế tiếp."
          tone="info"
        />

        <div className="app-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-sm min-w-[1580px]">
              <thead>
                <tr className="bg-base-200/70 text-xs uppercase tracking-wide text-base-content/65">
                  <th>LH Trip Number</th>
                  <th>Vehicle Plate</th>
                  <th>Vị trí hiện tại</th>
                  <th>Event cuối</th>
                  <th>ETA Pleiku</th>
                  <th>Còn lại</th>
                  <th>Nguồn ETA</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Pending Inbound TO</th>
                  <th className="text-right">Pending Inbound Order</th>
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
                      {formatRemainingTime(row.eta, row.positionStatus)}
                    </td>
                    <td className="whitespace-nowrap text-sm text-base-content/70">
                      {etaSourceLabel(row.etaSource)}
                    </td>
                    <td>
                      <span className={positionStatusClass(row.positionStatus)}>
                        {positionStatusLabel(row.positionStatus)}
                      </span>
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {numberFormatter.format(row.pendingInboundTo)}
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {numberFormatter.format(row.pendingInboundOrder)}
                    </td>
                  </tr>
                ))}

                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
                        <Truck
                          className="h-8 w-8 text-base-content/30"
                          aria-hidden="true"
                        />
                        <p className="mt-3 text-sm font-bold">
                          {hasChecked
                            ? "Không có trip trong khung thời gian đã chọn"
                            : "Chưa có dữ liệu Check xe"}
                        </p>
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-base-content/55">
                          {hasChecked
                            ? "Không có trip nào có ETA/STA Pleiku nằm trong số giờ bạn đã nhập."
                            : "Nhập số giờ muốn kiểm tra và nhấn Check xe. Có thể cấu hình thêm thời gian từ từng SOC về Pleiku ở phía trên."}
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
