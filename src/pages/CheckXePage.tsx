import { useMemo, useState } from "react";
import { Clock3, RefreshCw, Truck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import {
  DEFAULT_VEHICLE_CHECK_HOURS,
  getRouteLabel,
  type VehicleCheckRow,
  type VehicleCheckWindow,
} from "../utils/vehicleCheck";
import { fetchVehicleCheckRows } from "../utils/vehicleCheckData";

const numberFormatter = new Intl.NumberFormat("vi-VN");
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const formatUnixTime = (value: number): string =>
  dateTimeFormatter.format(new Date(value * 1_000));

const formatRemaining = (eta: number | null): string => {
  if (eta === null) return "—";
  const minutes = Math.ceil((eta * 1_000 - Date.now()) / 60_000);
  if (minutes <= 0) return "Đã tới mốc ETA";
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) return remain + " phút";
  if (remain === 0) return hours + " giờ";
  return hours + " giờ " + remain + " phút";
};

const statusBadgeClass = (row: VehicleCheckRow): string => {
  if (row.pleikuStationStatus === 80) {
    return "badge badge-success whitespace-nowrap font-bold";
  }
  if (
    row.pleikuStationStatus === 60 ||
    row.pleikuStationStatus === 50
  ) {
    return "badge badge-warning whitespace-nowrap font-bold";
  }
  if (row.pleikuStationStatus === 200) {
    return "badge badge-info whitespace-nowrap font-bold";
  }
  if (row.operationalState === "moving") {
    return "badge badge-info whitespace-nowrap font-bold";
  }
  if (row.operationalState === "holding") {
    return "badge badge-error whitespace-nowrap font-bold";
  }
  return "badge badge-ghost whitespace-nowrap font-bold";
};

const processLabel = (row: VehicleCheckRow): string =>
  row.pleikuStationStatus !== 0
    ? row.pleikuProcessLabel
    : row.operationalState === "moving"
      ? "Đang di chuyển"
      : row.operationalState === "holding"
        ? "SOC đang giữ xe"
        : "Chưa xác định";

const positionLabel = (row: VehicleCheckRow): string => {
  if (row.currentStationName && row.nextStationName) {
    return row.currentStationName + " → " + row.nextStationName;
  }
  if (row.currentStationName) return row.currentStationName;
  return "—";
};

export const CheckXePage = () => {
  const [hours, setHours] = useState(DEFAULT_VEHICLE_CHECK_HOURS);
  const [rows, setRows] = useState<VehicleCheckRow[]>([]);
  const [displayWindow, setDisplayWindow] =
    useState<VehicleCheckWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const etaWindowText = useMemo(() => {
    if (!displayWindow) {
      return "Từ hiện tại đến +" + hours + " giờ";
    }
    return (
      formatUnixTime(displayWindow.from) +
      " → " +
      formatUnixTime(displayWindow.to)
    );
  }, [displayWindow, hours]);

  const handleCheck = async () => {
    if (!Number.isFinite(hours) || hours <= 0) {
      showToast("Số giờ ETA phải lớn hơn 0.", "warning");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchVehicleCheckRows(hours);
      setRows(result.rows);
      setDisplayWindow(result.displayWindow);
      setHasChecked(true);

      showToast(
        result.rows.length > 0
          ? "Có " +
              result.rows.length +
              " xe dự kiến đến Pleiku trong " +
              hours +
              " giờ tới."
          : "Không có xe dự kiến đến Pleiku trong " + hours + " giờ tới.",
        result.rows.length > 0 ? "success" : "info",
      );
    } catch (error) {
      console.error("[Check xe]", error);
      showToast(
        error instanceof Error && error.message
          ? error.message
          : "Không thể tải danh sách trip từ SPX.",
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
        description="Xem các xe dự kiến đến Pleiku trong khoảng thời gian bạn chọn."
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:items-end">
            <label className="form-control w-full sm:w-44">
              <span className="label pb-1">
                <span className="label-text text-xs font-bold">
                  ETA đến Pleiku trong
                </span>
              </span>
              <div className="join w-full">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={hours}
                  disabled={loading}
                  onChange={(event) =>
                    setHours(Number(event.target.value))
                  }
                  className="input input-bordered join-item min-h-11 w-full"
                  aria-label="Số giờ ETA dự kiến đến Pleiku"
                />
                <span className="join-item flex min-h-11 items-center border border-base-300 bg-base-200 px-3 text-sm font-bold">
                  H
                </span>
              </div>
            </label>

            <button
              type="button"
              onClick={handleCheck}
              disabled={loading || !Number.isFinite(hours) || hours <= 0}
              className="btn btn-primary min-h-11 w-full gap-2 rounded-xl sm:w-auto"
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {loading ? "Đang quét trip" : "Check xe"}
            </button>
          </div>
        }
      />

      <section className="app-surface p-3 sm:p-4" aria-live="polite">
        <div className="flex min-w-0 gap-3">
          <span className="app-icon-badge shrink-0 bg-info/10 text-info">
            <Clock3 aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">
              Dự kiến đến Pleiku
            </p>
            <p className="mt-1 text-sm font-bold">{etaWindowText}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="vehicle-check-heading" className="space-y-3">
        <SectionHeading
          icon={Truck}
          id="vehicle-check-heading"
          title="Danh sách xe / trip"
          description="Danh sách xe dự kiến đến Pleiku trong khoảng thời gian đã chọn."
          tone="info"
        />

        <div className="app-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-sm min-w-[1280px]">
              <thead>
                <tr className="bg-base-200/70 text-xs uppercase tracking-wide text-base-content/65">
                  <th>LH Trip</th>
                  <th>Biển số xe</th>
                  <th>Trạng thái</th>
                  <th>Vị trí xe</th>
                  <th>Dự kiến</th>
                  <th>Còn lại</th>
                  <th className="text-right">TO chờ nhận</th>
                  <th className="text-right">Đơn chờ nhận</th>
                  <th>Tuyến SOC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.tripNumber} className="hover align-top">
                    <td className="whitespace-nowrap font-bold text-primary">
                      {row.tripNumber}
                    </td>
                    <td className="whitespace-nowrap font-semibold">
                      {row.vehiclePlateNumber}
                    </td>
                    <td>
                      <span className={statusBadgeClass(row)}>
                        {processLabel(row)}
                      </span>
                    </td>
                    <td className="min-w-60 whitespace-nowrap font-semibold">
                      {positionLabel(row)}
                    </td>
                    <td className="whitespace-nowrap font-black tabular-nums">
                      {row.etaPleiku !== null
                        ? formatUnixTime(row.etaPleiku)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap text-sm font-semibold">
                      {formatRemaining(row.etaPleiku)}
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {numberFormatter.format(row.pendingInboundTo)}
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {numberFormatter.format(row.pendingInboundOrder)}
                    </td>
                    <td className="min-w-[460px] text-sm font-semibold">
                      {getRouteLabel(row)}
                    </td>
                  </tr>
                ))}

                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
                        <Truck
                          className="h-8 w-8 text-base-content/30"
                          aria-hidden="true"
                        />
                        <p className="mt-3 text-sm font-bold">
                          {hasChecked
                            ? "Không có trip phù hợp"
                            : "Chưa quét danh sách trip"}
                        </p>
                        <p className="mt-1 max-w-lg text-xs leading-relaxed text-base-content/55">
                          {hasChecked
                            ? "Không có xe nào nằm trong khoảng thời gian đã chọn."
                            : "Nhấn Check xe để xem danh sách xe dự kiến đến Pleiku."}
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
