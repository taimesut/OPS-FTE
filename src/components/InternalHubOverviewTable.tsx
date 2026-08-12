import { Fragment } from "react";
import type {
  HubOverviewRow,
  HubOverviewStatus,
  OverviewTotals,
} from "../utils/internalHubOverview";
import { RefreshCw } from "lucide-react";

interface InternalHubOverviewTableProps {
  rows: readonly HubOverviewRow[];
  totals: OverviewTotals;
  selectedHubName: string | null;
  onSelectHub: (name: string) => void;
  onRefreshHub: (hub: HubOverviewRow) => void;
  hubCooldownRemaining: Readonly<Record<string, number>>;
  hubRunning: Readonly<Record<string, boolean>>;
  allRunning: boolean;
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

const formatTransferOrderCount = (value: number, available: boolean): string =>
  available ? `${formatMetric(value, true)} TO` : "—";

const formatUpdatedAt = (value: number | null): string => {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : updatedAtFormatter.format(date);
};

const hubKey = (row: HubOverviewRow): string => row.id.trim() || row.name;

const formatCountdown = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `00:${String(seconds).padStart(2, "0")}`;
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
  compact = false,
}: {
  row: HubOverviewRow;
  selected: boolean;
  onSelect: (name: string) => void;
  compact?: boolean;
}) => (
  <button
    type="button"
    className={`btn btn-sm min-h-11 min-w-0 rounded-xl btn-outline disabled:opacity-45 ${compact ? "mt-1 px-2 text-xs" : ""}`}
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
    {selected ? (compact ? "Đóng" : "Đóng chi tiết") : compact ? "Chi tiết" : "Xem chi tiết"}
  </button>
);

const HubRefreshButton = ({
  row,
  remaining,
  running,
  allRunning,
  onRefresh,
}: {
  row: HubOverviewRow;
  remaining: number;
  running: boolean;
  allRunning: boolean;
  onRefresh: (hub: HubOverviewRow) => void;
}) => {
  const locked = allRunning || running || remaining > 0;
  const statusText = running
    ? "Đang tải"
    : remaining > 0
      ? `Làm mới sau ${formatCountdown(remaining)}`
      : "Làm mới";

  return (
    <div className="flex min-w-11 flex-col items-center gap-0.5">
      <button
        type="button"
        className="btn btn-square btn-sm min-h-11 min-w-11 rounded-xl btn-ghost"
        disabled={locked}
        aria-label={`Làm mới dữ liệu của ${row.name}`}
        aria-busy={running}
        onClick={() => onRefresh(row)}
      >
        {running ? (
          <span className="loading loading-spinner loading-sm" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <span className="break-safe text-center text-[10px] font-semibold leading-tight text-base-content/60">
        {statusText}
      </span>
    </div>
  );
};

const hasBranchMessages = (row: HubOverviewRow): boolean =>
  row.loose.error !== null ||
  row.loose.stale ||
  row.packed.error !== null ||
  row.packed.stale;

export function InternalHubOverviewTable({
  rows,
  totals,
  selectedHubName,
  onSelectHub,
  onRefreshHub,
  hubCooldownRemaining,
  hubRunning,
  allRunning,
}: InternalHubOverviewTableProps) {
  const looseTotalsAvailable = rows.some((row) => row.loose.data !== null);
  const packedTotalsAvailable = rows.some((row) => row.packed.hasData);

  return (
    <div className="min-w-0 max-w-full">
      <div className="app-surface max-w-full overflow-hidden md:hidden">
        <div className="max-w-full overflow-x-auto">
          <table
            className="table table-xs w-full min-w-[22rem] table-fixed tabular-nums"
            aria-label="Tổng quan theo Hub trên mobile"
          >
            <colgroup>
              <col className="w-[29%]" />
              <col className="w-[21%]" />
              <col className="w-[21%]" />
              <col className="w-[12%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead className="border-b border-base-200 bg-base-200/50 text-base-content">
              <tr>
                <th scope="col" className="break-safe px-1.5 py-2 text-left">Hub / trạng thái</th>
                <th scope="col" className="break-safe px-1.5 py-2 text-right">Xá lẻ</th>
                <th scope="col" className="break-safe px-1.5 py-2 text-right">Đóng bao</th>
                <th scope="col" className="break-safe px-1.5 py-2 text-right">Kiện</th>
                <th scope="col" className="break-safe px-1.5 py-2 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-200">
              {rows.map((row) => {
                const looseAvailable = row.loose.data !== null;
                const selected = selectedHubName === row.name;
                const key = hubKey(row);
                const messages = hasBranchMessages(row);

                return (
                  <Fragment key={key}>
                    <tr className="align-top hover:bg-base-200/35">
                      <th scope="row" className="min-w-0 px-1.5 py-2 text-left font-normal">
                        <span className="block break-safe font-bold">{row.name}</span>
                        <span className="mt-1 block"><StatusBadge status={row.status} /></span>
                        <span className="mt-1 block break-safe text-[11px] text-base-content/60">
                          {formatUpdatedAt(row.updatedAt)}
                        </span>
                        <DetailButton
                          compact
                          row={row}
                          selected={selected}
                          onSelect={onSelectHub}
                        />
                      </th>
                      <td className="min-w-0 px-1.5 py-2 text-right align-top">
                        <strong className="block break-safe font-black">
                          {formatMetric(row.loose.data?.total ?? 0, looseAvailable)}
                        </strong>
                        <span className="mt-1 block break-safe text-[11px] leading-tight text-base-content/60">
                          DG {formatMetric(row.loose.data?.dgCount ?? 0, looseAvailable)} · GTC {formatMetric(row.loose.data?.highValueCount ?? 0, looseAvailable)}
                        </span>
                      </td>
                      <td className="min-w-0 px-1.5 py-2 text-right align-top">
                        <strong className="block break-safe font-black">
                          {formatTransferOrderCount(
                            row.packed.orders.length,
                            row.packed.hasData,
                          )}
                        </strong>
                        <span className="mt-1 block break-safe text-[11px] leading-tight text-base-content/60">
                          DG {formatMetric(row.packed.metrics.dgBagCount, row.packed.hasData)} · GTC {formatMetric(row.packed.metrics.gtcBagCount, row.packed.hasData)}
                        </span>
                      </td>
                      <td className="px-1.5 py-2 text-right align-top font-black">
                        {formatMetric(row.packed.metrics.totalQuantity, row.packed.hasData)}
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <HubRefreshButton
                          row={row}
                          remaining={hubCooldownRemaining[key] ?? 0}
                          running={hubRunning[key] ?? false}
                          allRunning={allRunning}
                          onRefresh={onRefreshHub}
                        />
                      </td>
                    </tr>
                    {messages ? (
                      <tr key={`${key}:messages`}>
                        <td colSpan={5} className="px-1.5 py-1.5">
                          <BranchMessages row={row} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="border-t border-base-300 bg-base-200/55 font-bold text-base-content">
              <tr>
                <th scope="row" className="break-safe px-1.5 py-2 text-left">
                  <span className="block">Tổng cộng</span>
                  <span className="block text-[11px] font-semibold text-base-content/65">
                    Hoàn tất {totals.completedHubs}/{totals.totalHubs} Hub
                  </span>
                </th>
                <td className="px-1.5 py-2 text-right align-top">
                  <strong className="block">{formatMetric(totals.looseTotal, looseTotalsAvailable)}</strong>
                  <span className="block break-safe text-[11px] font-semibold leading-tight text-base-content/60">
                    DG {formatMetric(totals.looseDg, looseTotalsAvailable)} · GTC {formatMetric(totals.looseGtc, looseTotalsAvailable)}
                  </span>
                </td>
                <td className="px-1.5 py-2 text-right align-top">
                  <strong className="block">
                    {formatTransferOrderCount(totals.packedTo, packedTotalsAvailable)}
                  </strong>
                  <span className="block break-safe text-[11px] font-semibold leading-tight text-base-content/60">
                    DG {formatMetric(totals.packedDg, packedTotalsAvailable)} · GTC {formatMetric(totals.packedGtc, packedTotalsAvailable)}
                  </span>
                </td>
                <td className="px-1.5 py-2 text-right align-top">
                  {formatMetric(totals.packedQuantity, packedTotalsAvailable)}
                </td>
                <td className="px-1.5 py-2 text-center align-top">—</td>
              </tr>
              <tr>
                <td colSpan={5} className="px-1.5 pb-2 text-right text-[11px] font-semibold text-base-content/60">
                  Cập nhật: {formatUpdatedAt(totals.latestUpdatedAt)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
                const key = hubKey(row);

                return (
                  <tr key={key} className="align-top hover:bg-base-200/35">
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
                      <div className="flex min-w-[10rem] flex-wrap items-center gap-2">
                        <HubRefreshButton
                          row={row}
                          remaining={hubCooldownRemaining[key] ?? 0}
                          running={hubRunning[key] ?? false}
                          allRunning={allRunning}
                          onRefresh={onRefreshHub}
                        />
                        <DetailButton
                          row={row}
                          selected={selected}
                          onSelect={onSelectHub}
                        />
                      </div>
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
