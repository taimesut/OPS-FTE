import { useMemo, useState } from "react";
import { ChevronDown, Clock3, RefreshCw, Truck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import {
  DEFAULT_VEHICLE_CHECK_HOURS,
  type VehicleCheckRow,
  type VehicleCheckWindow,
} from "../utils/vehicleCheck";
import { fetchVehicleCheckRows } from "../utils/vehicleCheckApi";

const numberFormatter = new Intl.NumberFormat("vi-VN");
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const formatUnixTime = (value: number): string =>
  dateTimeFormatter.format(new Date(value * 1_000));

export const CheckXePage = () => {
  const [hours, setHours] = useState(DEFAULT_VEHICLE_CHECK_HOURS);
  const [rows, setRows] = useState<VehicleCheckRow[]>([]);
  const [total, setTotal] = useState(0);
  const [windowRange, setWindowRange] = useState<VehicleCheckWindow | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const summaryText = useMemo(() => {
    if (!windowRange) return `Từ thời điểm hiện tại đến +${hours} giờ`;
    return `${formatUnixTime(windowRange.from)} → ${formatUnixTime(
      windowRange.to,
    )}`;
  }, [hours, windowRange]);

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
      setWindowRange(result.window);
      setHasChecked(true);

      showToast(
        result.rows.length > 0
          ? `Tìm thấy ${result.rows.length} trip có Pending Inbound TO và Order lớn hơn 0.`
          : `Không có trip Pending Inbound trong ${hours} giờ tiếp theo.`,
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
        description="Kiểm tra các LH Trip theo khung STA sắp tới"
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
              Khung thời gian STA
            </p>
            <p className="mt-1 break-safe text-sm font-bold">{summaryText}</p>
            <p className="mt-1 text-xs text-base-content/60">
              {hasChecked
                ? `Có ${numberFormatter.format(
                    rows.length,
                  )} trip phù hợp trong ${numberFormatter.format(total)} trip API trả về`
                : "Mặc định kiểm tra 8 giờ tiếp theo. Chỉ hiển thị trip có cả Pending Inbound TO và Pending Inbound Order lớn hơn 0."}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="vehicle-check-heading" className="space-y-3">
        <SectionHeading
          icon={Truck}
          id="vehicle-check-heading"
          title="Danh sách xe"
          description="Có ETA tại station đang highlight = Đang về; không có ETA = Bị giam"
          tone="info"
        />

        <div className="app-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-sm min-w-[1120px]">
              <thead>
                <tr className="bg-base-200/70 text-xs uppercase tracking-wide text-base-content/65">
                  <th>LH Trip Number</th>
                  <th>Vehicle Plate Number</th>
                  <th>Station</th>
                  <th>ETA</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Pending Inbound TO</th>
                  <th className="text-right">Pending Inbound Order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.tripNumber}-${index}`} className="hover">
                    <td className="font-bold text-primary">{row.tripNumber}</td>
                    <td className="font-semibold">{row.vehiclePlateNumber}</td>
                    <td className="min-w-52">
                      {row.stations.length > 0 ? (
                        <div className="flex flex-col items-start py-1">
                          {row.stations.map((station, stationIndex) => (
                            <div
                              key={`${station.sequenceNumber}-${station.stationId}-${stationIndex}`}
                              className="flex flex-col items-start"
                            >
                              <span
                                className={
                                  station.isDisplay
                                    ? "whitespace-nowrap text-sm font-black text-base-content"
                                    : "whitespace-nowrap text-sm font-medium text-base-content/45"
                                }
                              >
                                [{station.stationId}]{station.stationName}
                              </span>
                              {stationIndex < row.stations.length - 1 ? (
                                <ChevronDown
                                  className="my-0.5 h-3.5 w-3.5 text-base-content/35"
                                  strokeWidth={2.5}
                                  aria-hidden="true"
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-base-content/40">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap font-semibold tabular-nums">
                      {row.eta !== null ? formatUnixTime(row.eta) : "—"}
                    </td>
                    <td>
                      <span
                        className={
                          row.movementStatus === "arriving"
                            ? "badge badge-success whitespace-nowrap font-bold"
                            : "badge badge-warning whitespace-nowrap font-bold"
                        }
                      >
                        {row.movementStatus === "arriving"
                          ? "Đang về"
                          : "Bị giam"}
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
                    <td colSpan={7}>
                      <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
                        <Truck
                          className="h-8 w-8 text-base-content/30"
                          aria-hidden="true"
                        />
                        <p className="mt-3 text-sm font-bold">
                          {hasChecked
                            ? "Không có trip Pending Inbound phù hợp"
                            : "Chưa có dữ liệu Check xe"}
                        </p>
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-base-content/55">
                          {hasChecked
                            ? "Không có trip nào có đồng thời Pending Inbound TO và Pending Inbound Order lớn hơn 0 trong khung thời gian đã chọn."
                            : "Nhập số giờ muốn kiểm tra tiếp theo và nhấn Check xe."}
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
