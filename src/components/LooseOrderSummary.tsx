import {
  CircleAlert,
  Gem,
  PackageOpen,
  Route,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { LooseOrderCheckState } from "../hooks/useLooseOrderCheck";

const NUMBER_FORMATTER = new Intl.NumberFormat("vi-VN");

const METRIC_TONES = {
  primary: "border-primary/20 bg-primary/5 text-primary",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error: "border-error/25 bg-error/10 text-error",
} as const;

interface MetricProps {
  icon: LucideIcon;
  label: string;
  tone: keyof typeof METRIC_TONES;
  value: number;
}

const Metric = ({ icon: Icon, label, tone, value }: MetricProps) => (
  <div
    className={`min-w-0 rounded-xl border px-2.5 py-3 sm:px-4 ${METRIC_TONES[tone]}`}
  >
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate text-[10px] font-extrabold uppercase tracking-wide sm:text-xs">
        {label}
      </span>
    </div>
    <p className="mt-1 text-2xl font-black leading-none tabular-nums sm:text-3xl">
      {NUMBER_FORMATTER.format(value)}
    </p>
  </div>
);

interface LooseOrderSummaryProps {
  state: LooseOrderCheckState;
  currentName: string;
  currentId: string;
  destinationName: string;
  destinationIds: string[];
}

export const LooseOrderSummary = ({
  state,
  currentName,
  currentId,
  destinationName,
  destinationIds,
}: LooseOrderSummaryProps) => (
  <section
    aria-labelledby="loose-order-heading"
    className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xs"
  >
    <div className="flex flex-col gap-3 border-b border-base-200 bg-base-200/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <PackageOpen className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="loose-order-heading" className="font-black tracking-tight">
            Hàng xá lẻ
          </h2>
          <p className="text-xs text-base-content/60">
            Đơn đang nằm ngoài bao/TO
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 shadow-xs">
        <Route className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 leading-tight">
          <p className="font-mono text-xs font-black tracking-wide">
            {currentId || "—"} <span className="text-primary">→</span>{" "}
            {destinationIds.join(", ") || "—"}
          </p>
          <p className="truncate text-[10px] font-semibold text-base-content/55 sm:max-w-72">
            {currentName || "Chưa cấu hình SOC"} → {destinationName || "Chưa chọn tuyến"}
          </p>
        </div>
      </div>
    </div>

    <div className="p-4" aria-live="polite">
      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-base-300 px-4 py-5 text-center text-sm font-medium text-base-content/60">
          Chọn tuyến và bấm “Tìm kiếm” để kiểm tra hàng xá lẻ.
        </p>
      ) : state.status === "loading" ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Đang tải hàng xá lẻ">
          <div className="skeleton h-20 rounded-xl sm:h-24" />
          <div className="skeleton h-20 rounded-xl sm:h-24" />
          <div className="skeleton h-20 rounded-xl sm:h-24" />
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="alert alert-error items-start rounded-xl text-sm">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Không tải được hàng xá lẻ</p>
            <p className="mt-0.5 text-xs opacity-80">{state.message}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Metric
            icon={PackageOpen}
            label="Tổng"
            tone="primary"
            value={state.summary.total}
          />
          <Metric
            icon={ShieldAlert}
            label="Hàng DG"
            tone="warning"
            value={state.summary.dgCount}
          />
          <Metric
            icon={Gem}
            label="Hàng GTC"
            tone="error"
            value={state.summary.highValueCount}
          />
        </div>
      )}
    </div>
  </section>
);
