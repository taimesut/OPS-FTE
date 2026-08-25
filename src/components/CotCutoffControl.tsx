import { Clock3 } from "lucide-react";
import { parseCotLocalDateTime } from "../utils/cotCutoff";

export interface CotProgress {
  processed: number;
  total: number;
}

interface CotCutoffControlProps {
  enabled: boolean;
  localDateTime: string;
  disabled: boolean;
  progress: CotProgress | null;
  onEnabledChange: (enabled: boolean) => void;
  onDateTimeChange: (value: string) => void;
}

const formatActiveCot = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(parseCotLocalDateTime(value));
  } catch {
    return "Thời gian COT chưa hợp lệ";
  }
};

export const CotCutoffControl = ({
  enabled,
  localDateTime,
  disabled,
  progress,
  onEnabledChange,
  onDateTimeChange,
}: CotCutoffControlProps) => (
  <section
    className="app-surface p-4 sm:p-5"
    aria-labelledby="cot-cutoff-heading"
  >
    <div className="grid gap-4 sm:grid-cols-[auto_minmax(14rem,20rem)_minmax(0,1fr)] sm:items-center">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 has-disabled:cursor-not-allowed has-disabled:opacity-60">
        <input
          type="checkbox"
          role="switch"
          className="toggle toggle-primary"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span id="cot-cutoff-heading" className="font-black">
          Cắt COT
        </span>
      </label>

      {enabled ? (
        <label className="form-control w-full">
          <span className="label-text mb-1.5 text-sm font-bold">
            Ngày giờ COT
          </span>
          <input
            type="datetime-local"
            value={localDateTime}
            disabled={disabled}
            onChange={(event) => onDateTimeChange(event.target.value)}
            className="input input-bordered min-h-11 w-full rounded-xl focus:input-primary disabled:cursor-not-allowed"
          />
        </label>
      ) : null}

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex min-w-0 items-start gap-2 text-sm text-base-content/70"
      >
        <Clock3
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p className="min-w-0 break-words">
          {progress
            ? `Đang kiểm tra COT: ${progress.processed}/${progress.total} TO`
            : enabled
              ? `Đang áp dụng COT ${formatActiveCot(localDateTime)}`
              : "Đang kiểm tra toàn bộ dữ liệu"}
        </p>
      </div>
    </div>
  </section>
);
