import { AlertCircle, MapPin, PackageSearch, Route, X } from "lucide-react";
import type { TransferOrderTrackingResult } from "../utils/transferOrderTracking";

interface TrackingModalProps {
  open: boolean;
  toNumber: string;
  loading: boolean;
  data: TransferOrderTrackingResult | null;
  error: string;
  onRetry: () => void;
  onClose: () => void;
}

const formatTrackingTime = (timestamp: number | null) => {
  if (timestamp === null) return "Không có thời gian";
  const milliseconds = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return "Không có thời gian";
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export default function TrackingModal({
  open,
  toNumber,
  loading,
  data,
  error,
  onRetry,
  onClose,
}: TrackingModalProps) {
  if (!open) return null;

  return (
    <dialog className="modal modal-open p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4">
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>

      <div className="modal-box max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-xl p-0 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-base-200 bg-base-100/95 p-4 backdrop-blur sm:p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Route className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-lg font-black">Tracking bao</h3>
            <p className="mt-0.5 break-all font-mono text-sm font-bold text-primary">
              {toNumber}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-square btn-ghost btn-sm min-h-10 min-w-10 rounded-xl"
            onClick={onClose}
            aria-label="Đóng tracking"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <span className="loading loading-spinner loading-lg text-primary" />
              <div>
                <p className="font-bold">Đang lấy tracking...</p>
                <p className="mt-1 text-sm text-base-content/60">
                  Đang lấy đơn đầu tiên trong bao và tải hành trình của đơn đó.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-4 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-error/10 text-error">
                <AlertCircle className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="max-w-md">
                <p className="font-black">Không tải được tracking</p>
                <p className="mt-1 break-safe text-sm text-base-content/65">{error}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary min-h-11 rounded-xl px-6"
                onClick={onRetry}
              >
                Thử lại
              </button>
            </div>
          ) : data ? (
            <>
              <div className="mb-5 rounded-2xl border border-base-200 bg-base-200/35 p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-base-100 text-primary shadow-xs">
                    <PackageSearch className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-base-content/50">
                      Đơn đại diện đầu tiên trong bao
                    </p>
                    <p className="mt-1 break-all font-mono text-sm font-black text-base-content">
                      {data.shipmentId}
                    </p>
                    <p className="mt-1 text-xs text-base-content/55">
                      {data.events.length} mốc tracking được tìm thấy
                    </p>
                  </div>
                </div>
              </div>

              <ol className="relative space-y-0 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-px before:bg-base-300">
                {data.events.map((event, index) => (
                  <li
                    key={`${event.status}-${event.timestamp ?? "na"}-${index}`}
                    className="relative grid grid-cols-[15px_minmax(0,1fr)] gap-3 pb-5 last:pb-0"
                  >
                    <span
                      className={`relative z-[1] mt-1.5 h-[15px] w-[15px] rounded-full border-4 border-base-100 ${
                        index === 0 ? "bg-primary" : "bg-base-300"
                      }`}
                    />
                    <div
                      className={`min-w-0 rounded-2xl border p-3 sm:p-4 ${
                        index === 0
                          ? "border-primary/25 bg-primary/5"
                          : "border-base-200 bg-base-100"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 break-safe font-bold leading-snug">
                          {event.title}
                        </p>
                        {event.status ? (
                          <span className="badge badge-outline badge-sm shrink-0 font-mono font-bold">
                            {event.status}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-xs font-semibold text-base-content/55">
                        {formatTrackingTime(event.timestamp)}
                      </p>

                      {event.location ? (
                        <div className="mt-2 flex items-start gap-1.5 text-sm text-base-content/70">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <span className="break-safe">{event.location}</span>
                        </div>
                      ) : null}

                      {event.description ? (
                        <p className="mt-2 break-safe text-sm leading-relaxed text-base-content/70">
                          {event.description}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </div>

        <div className="modal-action sticky bottom-0 m-0 justify-center border-t border-base-200 bg-base-100/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:p-4">
          <button
            type="button"
            className="btn btn-outline min-h-11 rounded-xl px-8"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </dialog>
  );
}
