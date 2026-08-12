import type {
  HubOverviewRow,
  HubOverviewStatus,
  OverviewTotals,
} from "../utils/internalHubOverview";

interface InternalHubOverviewTableProps {
  rows: readonly HubOverviewRow[];
  totals: OverviewTotals;
  selectedHubName: string | null;
  onSelectHub: (name: string) => void;
}

const numberFormatter = new Intl.NumberFormat("vi-VN");
const updatedAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

const STATUS_PRESENTATION: Record<
  HubOverviewStatus,
  { label: string; className: string }
> = {
  idle: { label: "Chưa kiểm tra", className: "badge-neutral" },
  loading: { label: "Đang tải", className: "badge-info" },
  success: { label: "Hoàn tất", className: "badge-success" },
  error: { label: "Có lỗi", className: "badge-error" },
};

const formatMetric = (value: number, available: boolean): string =>
  available ? numberFormatter.format(value) : "—";

const formatUpdatedAt = (value: number | null): string => {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : updatedAtFormatter.format(date);
};

const StatusBadge = ({ status }: { status: HubOverviewStatus }) => {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <span
      className={`badge badge-sm min-h-6 whitespace-nowrap font-bold ${presentation.className}`}
      role="status"
    >
      {presentation.label}
    </span>
  );
};

const BranchMessages = ({ row }: { row: HubOverviewRow }) => {
  const messages = [
    row.loose.error
      ? {
          key: "loose-error",
          role: "alert" as const,
          className: "text-error",
          text: `Hàng xá lẻ: ${row.loose.stale ? "đang hiển thị kết quả cũ — " : ""}${row.loose.error}`,
        }
      : row.loose.stale
        ? {
            key: "loose-stale",
            role: "status" as const,
            className: "text-warning",
            text: "Hàng xá lẻ: đang giữ kết quả cũ trong lúc cập nhật.",
          }
        : null,
    row.packed.error
      ? {
          key: "packed-error",
          role: "alert" as const,
          className: "text-error",
          text: `Hàng đóng bao: ${row.packed.stale ? "đang hiển thị kết quả cũ — " : ""}${row.packed.error}`,
        }
      : row.packed.stale
        ? {
            key: "packed-stale",
            role: "status" as const,
            className: "text-warning",
            text: "Hàng đóng bao: đang giữ kết quả cũ trong lúc cập nhật.",
          }
        : null,
  ].filter((message) => message !== null);

  return messages.length > 0 ? (
    <div className="mt-1.5 space-y-1">
      {messages.map((message) => (
        <p
          key={message.key}
          role={message.role}
          className={`break-safe text-xs font-semibold leading-relaxed ${message.className}`}
        >
          {message.text}
        </p>
      ))}
    </div>
  ) : null;
};

const DetailButton = ({
  row,
  selected,
  onSelect,
}: {
  row: HubOverviewRow;
  selected: boolean;
  onSelect: (name: string) => void;
}) => (
  <button
    type="button"
    className="btn btn-sm min-h-11 min-w-0 rounded-xl btn-outline disabled:opacity-45"
    disabled={!row.packed.hasData}
    aria-expanded={selected}
    aria-controls="overview-hub-detail"
    aria-label={
      row.packed.hasData
        ? `${selected ? "Đóng" : "Xem"} chi tiết TO của ${row.name}`
        : `Chưa có dữ liệu TO của ${row.name}`
    }
    onClick={() => onSelect(row.name)}
  >
    {selected ? "Đóng chi tiết" : "Xem chi tiết"}
  </button>
);

const MobileMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-lg bg-base-200/45 px-2 py-2.5 text-center">
    <dt className="break-safe text-[11px] font-bold uppercase tracking-wide text-base-content/55">
      {label}
    </dt>
    <dd className="mt-1 break-safe text-base font-black tabular-nums text-base-content">
      {value}
    </dd>
  </div>
);

export function InternalHubOverviewTable({
  rows,
  totals,
  selectedHubName,
  onSelectHub,
}: InternalHubOverviewTableProps) {
  const looseTotalsAvailable = rows.some((row) => row.loose.data !== null);
  const packedTotalsAvailable = rows.some((row) => row.packed.hasData);

  return (
    <div className="min-w-0 max-w-full">
      <div className="space-y-3 md:hidden">
        {rows.map((row) => {
          const looseAvailable = row.loose.data !== null;
          const selected = selectedHubName === row.name;

          return (
            <article
              key={row.id || row.name}
              className="app-surface min-w-0 overflow-hidden"
              aria-label={`Tổng quan ${row.name}`}
            >
              <header className="min-w-0 border-b border-base-200 p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-safe text-base font-black tracking-tight">
                      {row.name}
                    </h3>
                    <p className="mt-1 break-safe text-xs text-base-content/60">
                      Cập nhật: {formatUpdatedAt(row.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <BranchMessages row={row} />
              </header>

              <div className="space-y-4 p-4">
                <section aria-label={`Hàng xá lẻ của ${row.name}`}>
                  <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-base-content/65">
                    Hàng xá lẻ
                  </h4>
                  <dl className="grid min-w-0 grid-cols-3 gap-2">
                    <MobileMetric
                      label="Tổng"
                      value={formatMetric(row.loose.data?.total ?? 0, looseAvailable)}
                    />
                    <MobileMetric
                      label="DG"
                      value={formatMetric(row.loose.data?.dgCount ?? 0, looseAvailable)}
                    />
                    <MobileMetric
                      label="GTC"
                      value={formatMetric(row.loose.data?.highValueCount ?? 0, looseAvailable)}
                    />
                  </dl>
                </section>

                <section aria-label={`Hàng đã đóng bao của ${row.name}`}>
                  <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-base-content/65">
                    Hàng đã đóng bao
                  </h4>
                  <dl className="grid min-w-0 grid-cols-4 gap-2">
                    <MobileMetric
                      label="TO"
                      value={formatMetric(row.packed.orders.length, row.packed.hasData)}
                    />
                    <MobileMetric
                      label="Kiện"
                      value={formatMetric(row.packed.metrics.totalQuantity, row.packed.hasData)}
                    />
                    <MobileMetric
                      label="DG"
                      value={formatMetric(row.packed.metrics.dgBagCount, row.packed.hasData)}
                    />
                    <MobileMetric
                      label="GTC"
                      value={formatMetric(row.packed.metrics.gtcBagCount, row.packed.hasData)}
                    />
                  </dl>
                </section>

                <DetailButton
                  row={row}
                  selected={selected}
                  onSelect={onSelectHub}
                />
              </div>
            </article>
          );
        })}

        <footer className="app-surface min-w-0 overflow-hidden p-4" aria-label="Tổng cộng">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3 className="font-black">Tổng cộng</h3>
            <span className="badge badge-neutral min-h-7 font-bold">
              Hoàn tất {totals.completedHubs}/{totals.totalHubs} Hub
            </span>
          </div>
          <dl className="mt-3 grid min-w-0 grid-cols-3 gap-2">
            <MobileMetric
              label="Xá lẻ"
              value={formatMetric(totals.looseTotal, looseTotalsAvailable)}
            />
            <MobileMetric
              label="DG xá lẻ"
              value={formatMetric(totals.looseDg, looseTotalsAvailable)}
            />
            <MobileMetric
              label="GTC xá lẻ"
              value={formatMetric(totals.looseGtc, looseTotalsAvailable)}
            />
          </dl>
          <dl className="mt-2 grid min-w-0 grid-cols-4 gap-2">
            <MobileMetric
              label="TO"
              value={formatMetric(totals.packedTo, packedTotalsAvailable)}
            />
            <MobileMetric
              label="Kiện"
              value={formatMetric(totals.packedQuantity, packedTotalsAvailable)}
            />
            <MobileMetric
              label="Bao DG"
              value={formatMetric(totals.packedDg, packedTotalsAvailable)}
            />
            <MobileMetric
              label="Bao GTC"
              value={formatMetric(totals.packedGtc, packedTotalsAvailable)}
            />
          </dl>
        </footer>
      </div>

      <div className="app-surface hidden max-w-full overflow-hidden md:block">
        <div className="max-w-full overflow-x-auto">
          <table className="table table-sm min-w-[64rem] tabular-nums">
            <thead className="border-b border-base-200 bg-base-200/50 text-base-content">
              <tr>
                <th scope="col" rowSpan={2}>Hub</th>
                <th scope="colgroup" colSpan={3} className="text-center">Hàng xá lẻ</th>
                <th scope="colgroup" colSpan={4} className="text-center">Hàng đã đóng bao</th>
                <th scope="col" rowSpan={2}>Trạng thái</th>
                <th scope="col" rowSpan={2}>Cập nhật</th>
                <th scope="col" rowSpan={2}>Chi tiết</th>
              </tr>
              <tr>
                <th scope="col" className="text-right">Tổng</th>
                <th scope="col" className="text-right">DG</th>
                <th scope="col" className="text-right">GTC</th>
                <th scope="col" className="text-right">TO</th>
                <th scope="col" className="text-right">Kiện</th>
                <th scope="col" className="text-right">DG</th>
                <th scope="col" className="text-right">GTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-200">
              {rows.map((row) => {
                const looseAvailable = row.loose.data !== null;
                const selected = selectedHubName === row.name;

                return (
                  <tr key={row.id || row.name} className="align-top hover:bg-base-200/35">
                    <th scope="row" className="max-w-64 whitespace-normal">
                      <span className="break-safe font-bold">{row.name}</span>
                      <BranchMessages row={row} />
                    </th>
                    <td className="text-right">{formatMetric(row.loose.data?.total ?? 0, looseAvailable)}</td>
                    <td className="text-right">{formatMetric(row.loose.data?.dgCount ?? 0, looseAvailable)}</td>
                    <td className="text-right">{formatMetric(row.loose.data?.highValueCount ?? 0, looseAvailable)}</td>
                    <td className="text-right">{formatMetric(row.packed.orders.length, row.packed.hasData)}</td>
                    <td className="text-right">{formatMetric(row.packed.metrics.totalQuantity, row.packed.hasData)}</td>
                    <td className="text-right">{formatMetric(row.packed.metrics.dgBagCount, row.packed.hasData)}</td>
                    <td className="text-right">{formatMetric(row.packed.metrics.gtcBagCount, row.packed.hasData)}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="whitespace-nowrap text-xs text-base-content/70">{formatUpdatedAt(row.updatedAt)}</td>
                    <td>
                      <DetailButton row={row} selected={selected} onSelect={onSelectHub} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-base-300 bg-base-200/55 font-bold text-base-content">
              <tr>
                <th scope="row" className="whitespace-normal">
                  <span className="block">Tổng cộng</span>
                  <span className="block text-xs font-semibold text-base-content/65">
                    Hoàn tất {totals.completedHubs}/{totals.totalHubs} Hub
                  </span>
                </th>
                <td className="text-right">{formatMetric(totals.looseTotal, looseTotalsAvailable)}</td>
                <td className="text-right">{formatMetric(totals.looseDg, looseTotalsAvailable)}</td>
                <td className="text-right">{formatMetric(totals.looseGtc, looseTotalsAvailable)}</td>
                <td className="text-right">{formatMetric(totals.packedTo, packedTotalsAvailable)}</td>
                <td className="text-right">{formatMetric(totals.packedQuantity, packedTotalsAvailable)}</td>
                <td className="text-right">{formatMetric(totals.packedDg, packedTotalsAvailable)}</td>
                <td className="text-right">{formatMetric(totals.packedGtc, packedTotalsAvailable)}</td>
                <td>—</td>
                <td>{formatUpdatedAt(totals.latestUpdatedAt)}</td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
