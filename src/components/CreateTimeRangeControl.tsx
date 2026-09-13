import { Clock3, RotateCcw } from "lucide-react";

interface CreateTimeRangeControlProps {
  fromLocalDateTime: string;
  toLocalDateTime: string;
  disabled: boolean;
  onFromDateTimeChange: (value: string) => void;
  onToDateTimeChange: (value: string) => void;
  onReset: () => void;
}

export const CreateTimeRangeControl = ({
  fromLocalDateTime,
  toLocalDateTime,
  disabled,
  onFromDateTimeChange,
  onToDateTimeChange,
  onReset,
}: CreateTimeRangeControlProps) => (
  <section
    className="app-surface p-4 sm:p-5"
    aria-labelledby="create-time-heading"
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Clock3 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="create-time-heading" className="font-black">
            Create time
          </h2>
          <p className="mt-0.5 text-sm text-base-content/65">
            Chọn khoảng thời gian tạo Transfer Order cần kiểm tra.
          </p>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm gap-2 rounded-xl"
        disabled={disabled}
        onClick={onReset}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        7 ngày gần nhất
      </button>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="form-control w-full">
        <span className="label-text mb-1.5 text-sm font-bold">Từ ngày giờ</span>
        <input
          type="datetime-local"
          value={fromLocalDateTime}
          disabled={disabled}
          onChange={(event) => onFromDateTimeChange(event.target.value)}
          className="input input-bordered min-h-11 w-full rounded-xl focus:input-primary disabled:cursor-not-allowed"
        />
      </label>

      <label className="form-control w-full">
        <span className="label-text mb-1.5 text-sm font-bold">Đến ngày giờ</span>
        <input
          type="datetime-local"
          value={toLocalDateTime}
          disabled={disabled}
          onChange={(event) => onToDateTimeChange(event.target.value)}
          className="input input-bordered min-h-11 w-full rounded-xl focus:input-primary disabled:cursor-not-allowed"
        />
      </label>
    </div>

    <p className="mt-3 rounded-xl border border-base-200 bg-base-200/35 px-3 py-2 text-xs leading-relaxed text-base-content/65">
      Khoảng Create time áp dụng cho phần Hàng đã đóng bao (TO). Hàng xá lẻ giữ nguyên bộ lọc hiện tại; COT ở kiểm tra nội tỉnh vẫn được áp dụng thêm sau Create time.
    </p>
  </section>
);
