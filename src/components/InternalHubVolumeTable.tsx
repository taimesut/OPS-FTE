import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import type {
  HubVolumeRow,
  HubVolumeStatus,
} from "../utils/internalHubVolume";

interface InternalHubVolumeTableProps {
  rows: readonly HubVolumeRow[];
}

const numberFormatter = new Intl.NumberFormat("vi-VN");

const STATUS_META: Record<
  HubVolumeStatus,
  {
    label: string;
    className: string;
    icon: typeof Clock3;
  }
> = {
  idle: {
    label: "Chưa kiểm tra",
    className: "badge-ghost",
    icon: Clock3,
  },
  loading: {
    label: "Đang kiểm tra",
    className: "badge-info",
    icon: Loader2,
  },
  success: {
    label: "Thành công",
    className: "badge-success",
    icon: CheckCircle2,
  },
  error: {
    label: "Lỗi",
    className: "badge-error",
    icon: AlertTriangle,
  },
};

const StatusBadge = ({ status }: { status: HubVolumeStatus }) => {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`badge gap-1.5 whitespace-nowrap font-bold ${meta.className}`}>
      <Icon
        className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
};

export const InternalHubVolumeTable = ({
  rows,
}: InternalHubVolumeTableProps) => (
  <div className="app-surface overflow-hidden">
    <div className="overflow-x-auto overscroll-x-contain">
      <table
        className="table table-sm w-full min-w-[42rem] tabular-nums"
        aria-label="Volume theo Hub nội tỉnh"
      >
        <thead>
          <tr className="bg-base-200/70 text-xs uppercase tracking-wide text-base-content/65">
            <th scope="col" className="w-[46%] px-4 py-3 text-left">
              Hub
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              Station ID
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Tổng lượng hàng
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.name}:${row.id}`} className="align-middle hover:bg-base-200/45">
              <th scope="row" className="break-safe px-4 py-3 font-extrabold">
                {row.name}
              </th>
              <td className="px-4 py-3 font-mono text-xs font-semibold text-base-content/65">
                {row.id || "—"}
              </td>
              <td className="px-4 py-3 text-right text-xl font-black tracking-tight">
                {row.total === null ? "—" : numberFormatter.format(row.total)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
                {row.error ? (
                  <p
                    className="mt-1.5 max-w-64 break-safe text-xs font-medium leading-relaxed text-error"
                    title={row.error}
                  >
                    {row.error}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
