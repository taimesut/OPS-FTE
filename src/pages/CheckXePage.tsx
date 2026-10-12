import { useMemo, useState } from "react";
import { Clock3, RefreshCw, Route, Truck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import {
  DEFAULT_VEHICLE_CHECK_HOURS,
  getRouteLabel,
  getStationStatusLabel,
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

export const CheckXePage = () => {
  const [hours, setHours] = useState(DEFAULT_VEHICLE_CHECK_HOURS);
  const [rows, setRows] = useState<VehicleCheckRow[]>([]);
  const [apiTotal, setApiTotal] = useState(0);
  const [candidateCount, setCandidateCount] = useState(0);
  const [calculatedEtaCount, setCalculatedEtaCount] = useState(0);
  const [pagesFetched, setPagesFetched] = useState(0);
  const [queryWindow, setQueryWindow] =
    useState<VehicleCheckWindow | null>(null);
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

  const apiWindowText = useMemo(() => {
    if (!queryWindow) {
      return "API quét từ hiện tại -1 ngày đến +1 ngày";
    }
    return (
      formatUnixTime(queryWindow.from) +
      " → " +
      formatUnixTime(queryWindow.to)
    );
  }, [queryWindow]);

  const handleCheck = async () => {
    if (!Number.isFinite(hours) || hours <= 0) {
      showToast("Số giờ ETA phải lớn hơn 0.", "warning");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchVehicleCheckRows(hours);
      setRows(result.rows);
      setApiTotal(result.apiTotal);
      setCandidateCount(result.candidateCount);
      setCalculatedEtaCount(result.calculatedEtaCount);
      setPagesFetched(result.pagesFetched);
      setQueryWindow(result.queryWindow);
      setDisplayWindow(result.displayWindow);
      setHasChecked(true);

      showToast(
        result.rows.length > 0
          ? "Có " +
              result.rows.length +
              " xe dự kiến đến Pleiku trong " +
              hours +
              " giờ tới."
          : result.candidateCount > 0
            ? "Đã có " +
              result.candidateCount +
              " xe hợp lệ nhưng không có ETA nào nằm trong " +
              hours +
              " giờ tới."
            : "Không có xe thỏa Pending Inbound TO > 0 và driver != 0.",
        result.rows.length > 0 ? "success" : "info",
      );
    } catch (error) {
      console.error("[Check xe · list_v2]", error);
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
        description="Lấy trip từ list_v2, giữ xe có Pending Inbound TO > 0 và driver != 0, tính ETA Pleiku cho toàn bộ rồi mới lọc theo số giờ đã nhập."
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
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 gap-3">
            <span className="app-icon-badge shrink-0 bg-info/10 text-info">
              <Clock3 aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">
                ETA Pleiku
              </p>
              <p className="mt-1 text-sm font-bold">{etaWindowText}</p>
              <p className="mt-1 text-xs text-base-content/55">
                Chỉ hiện xe có ETA Pleiku nằm từ thời điểm hiện tại đến hết khung giờ này.
              </p>
            </div>
          </div>

          <div className="flex min-w-0 gap-3">
            <span className="app-icon-badge shrink-0 bg-primary/10 text-primary">
              <Route aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">
                Khung quét FMS
              </p>
              <p className="mt-1 text-sm font-bold">{apiWindowText}</p>
              <p className="mt-1 text-xs text-base-content/55">
                {hasChecked
                  ? numberFormatter.format(apiTotal) +
                    " trip API · " +
                    numberFormatter.format(candidateCount) +
                    " xe hợp lệ (Inbound > 0 + driver != 0 + 44SOCGL) · " +
                    numberFormatter.format(calculatedEtaCount) +
                    " xe tính được ETA · " +
                    numberFormatter.format(rows.length) +
                    " xe nằm trong " +
                    hours +
                    "H · " +
                    pagesFetched +
                    " trang"
                  : "trip_station_status=60,50,200,80 · count=50 · quét đủ các trang"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="vehicle-check-heading" className="space-y-3">
        <SectionHeading
          icon={Truck}
          id="vehicle-check-heading"
          title="Danh sách xe / trip"
          description="Trạng thái trip_station chỉ dùng để xác định xe đang ở đâu và làm cơ sở tính ETA. Danh sách cuối cùng luôn được lọc bằng ETA Pleiku trong N giờ tới."
          tone="info"
        />

        <div className="app-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-sm min-w-[1600px]">
              <thead>
                <tr className="bg-base-200/70 text-xs uppercase tracking-wide text-base-content/65">
                  <th>LH Trip</th>
                  <th>Biển số</th>
                  <th>Trạng thái</th>
                  <th>Vị trí xe</th>
                  <th>ETA Pleiku</th>
                  <th>Còn lại</th>
                  <th className="text-right">Pending Inbound TO</th>
                  <th className="text-right">Pending Inbound Order</th>
                  <th>Tuyến SOC</th>
                  <th>Loại xe</th>
                  <th>Nhà xe</th>
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
                      <p className="mt-1 text-xs text-base-content/45">
                        Pleiku status: {row.pleikuStationStatus}
                      </p>
                    </td>
                    <td className="min-w-64 font-semibold">
                      {row.currentPositionLabel}
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
                    <td className="min-w-[420px]">
                      <p className="text-sm font-semibold">
                        {getRouteLabel(row)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.stations.map((station) => (
                          <span
                            key={
                              row.tripNumber +
                              "-" +
                              station.sequenceNumber
                            }
                            className={
                              "badge badge-sm " +
                              (station.stationCode === "44SOCGL"
                                ? "badge-primary"
                                : "badge-ghost")
                            }
                            title={
                              station.stationCode +
                              " · status " +
                              station.tripStationStatus
                            }
                          >
                            {station.stationName} ·{" "}
                            {getStationStatusLabel(
                              station.tripStationStatus,
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {row.vehicleTypeName}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {row.agencyName}
                    </td>
                  </tr>
                ))}

                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={11}>
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
                            ? "Ứng viên phải có Pending Inbound TO > 0, driver != 0 và station_code 44SOCGL. Sau khi tính ETA Pleiku, chỉ xe có ETA nằm trong số giờ đã nhập mới được hiện."
                            : "Nhấn Check xe để quét list_v2 từ hiện tại -1 ngày đến +1 ngày."}
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
