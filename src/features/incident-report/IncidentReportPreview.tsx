import {
  INCIDENT_REASONS,
  type IncidentItem,
  type TripDetails,
  type TripSummary,
} from "./incidentReport";

interface IncidentReportPreviewProps {
  socName: string;
  trip: TripSummary;
  details: TripDetails | null;
  items: readonly IncidentItem[];
  createdAt: Date;
}

const BLANK_VALUE = "________________";

const display = (value: string) => value || BLANK_VALUE;

const formatTripDate = (seconds: number) =>
  seconds > 0
    ? new Date(seconds * 1000).toLocaleString("vi-VN")
    : BLANK_VALUE;

export function IncidentReportPreview({
  socName,
  trip,
  details,
  items,
  createdAt,
}: IncidentReportPreviewProps) {
  const driver = details?.driverName || trip.driverName;
  const secondDriver = details?.secondDriverName || trip.secondDriverName;
  const vehicle = details?.vehicleNumber || trip.vehicleNumber;
  const vehicleType = details?.vehicleTypeName || trip.vehicleTypeName;
  const agency = details?.agencyName || trip.agencyName;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-md sm:p-6 print:border-none print:p-0 print:shadow-none">
      <header className="border-b-2 border-slate-900 pb-4 text-center">
        <h2 className="text-xl font-black uppercase sm:text-2xl">
          Biên bản sự vụ LH Trip
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Lập lúc {createdAt.toLocaleString("vi-VN")}
        </p>
      </header>

      <dl className="my-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold">SOC</dt>
          <dd>{display(socName)}</dd>
        </div>
        <div>
          <dt className="font-bold">LH Trip</dt>
          <dd className="font-mono">
            {display(details?.tripNumber || trip.tripNumber)}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Tên chuyến</dt>
          <dd>{display(details?.tripName || trip.tripName)}</dd>
        </div>
        <div>
          <dt className="font-bold">Ngày chạy</dt>
          <dd>{formatTripDate(details?.tripDate || trip.tripDate)}</dd>
        </div>
        <div>
          <dt className="font-bold">Biển số / loại xe</dt>
          <dd>{display([vehicle, vehicleType].filter(Boolean).join(" · "))}</dd>
        </div>
        <div>
          <dt className="font-bold">Tài xế</dt>
          <dd>{display([driver, secondDriver].filter(Boolean).join(" / "))}</dd>
        </div>
        <div>
          <dt className="font-bold">Nhà xe</dt>
          <dd>{display(agency)}</dd>
        </div>
        <div>
          <dt className="font-bold">Seal</dt>
          <dd>{display(details?.sealCodes.join(", ") || "")}</dd>
        </div>
        <div>
          <dt className="font-bold">Tổng kiện dự kiến</dt>
          <dd>{details?.expectedQuantity ?? BLANK_VALUE}</dd>
        </div>
        <div>
          <dt className="font-bold">Ghi chú chuyến</dt>
          <dd>{display(details?.remark || "")}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] border-collapse text-xs print:min-w-0 print:text-[8px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-400 p-2">STT</th>
              <th className="border border-slate-400 p-2 text-left">SPX/TO</th>
              {INCIDENT_REASONS.map((reason) => (
                <th key={reason} className="border border-slate-400 p-2">
                  {reason}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="border border-slate-300 p-2 text-center">
                  {index + 1}
                </td>
                <td className="border border-slate-300 p-2 font-mono font-bold">
                  {item.code}
                </td>
                {INCIDENT_REASONS.map((reason) => (
                  <td
                    key={reason}
                    className="border border-slate-300 p-2 text-center font-bold"
                  >
                    {item.reasons.includes(reason) ? "✓" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-8 grid grid-cols-2 gap-6 border-t border-slate-300 pt-6 text-center text-sm">
        <div>
          <strong>Người lập biên bản</strong>
          <p className="text-slate-500">(Ký và ghi rõ họ tên)</p>
          <div className="h-20" />
        </div>
        <div>
          <strong>Xác nhận kho / tài xế</strong>
          <p className="text-slate-500">(Ký và ghi rõ họ tên)</p>
          <div className="h-20" />
        </div>
      </footer>
    </article>
  );
}
