import {
  AlertCircle,
  Camera,
  Clock3,
  ExternalLink,
  MapPin,
  PackageSearch,
  Route,
  ScanLine,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import type {
  TransferOrderTrackingEvent,
  TransferOrderTrackingResult,
} from "../utils/transferOrderTracking";

interface TrackingModalProps {
  open: boolean;
  toNumber: string;
  loading: boolean;
  data: TransferOrderTrackingResult | null;
  error: string;
  onRetry: () => void;
  onClose: () => void;
}

const trackingTimeParts = (timestamp: number | null) => {
  if (timestamp === null) {
    return { time: "--:--:--", date: "Không có thời gian" };
  }

  const milliseconds =
    timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return { time: "--:--:--", date: "Không có thời gian" };
  }

  return {
    time: date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    date: date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
  };
};

const TrackingBadge = ({ event }: { event: TransferOrderTrackingEvent }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {event.status ? (
      <span className="badge badge-outline badge-sm font-mono font-bold">
        Status {event.status}
      </span>
    ) : null}
    {event.eventCode ? (
      <span
        className="badge badge-ghost badge-sm max-w-full truncate font-mono text-[10px]"
        title={event.eventCode}
      >
        {event.eventCode}
      </span>
    ) : null}
    {event.source === "event" ? (
      <span className="badge badge-info badge-sm gap-1 border-0 bg-info/10 text-info">
        <ScanLine className="h-3 w-3" aria-hidden="true" />
        Event
      </span>
    ) : null}
  </div>
);

const TrackingEventCard = ({
  event,
  latest,
}: {
  event: TransferOrderTrackingEvent;
  latest: boolean;
}) => {
  const time = trackingTimeParts(event.timestamp);

  return (
    <li className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-3 pb-4 last:pb-0 sm:grid-cols-[28px_minmax(0,1fr)]">
      <div className="relative flex justify-center">
        <span
          className={`relative z-[1] mt-4 grid h-5 w-5 place-items-center rounded-full border-4 border-base-100 sm:h-6 sm:w-6 ${
            latest ? "bg-primary" : event.source === "event" ? "bg-info" : "bg-base-300"
          }`}
        >
          {latest ? <span className="h-1.5 w-1.5 rounded-full bg-primary-content" /> : null}
        </span>
      </div>

      <article
        className={`min-w-0 overflow-hidden rounded-2xl border ${
          latest
            ? "border-primary/30 bg-primary/[0.04] shadow-sm"
            : "border-base-200 bg-base-100"
        }`}
      >
        <div className="p-3.5 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {latest ? (
                  <span className="badge badge-primary badge-sm border-0 font-bold">
                    Mới nhất
                  </span>
                ) : null}
                <TrackingBadge event={event} />
              </div>
              <h4 className="mt-2 break-safe text-sm font-black leading-5 text-base-content sm:text-[15px]">
                {event.title}
              </h4>
              {event.description ? (
                <p className="mt-1 break-safe text-xs leading-5 text-base-content/55">
                  {event.description}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-base-200/60 px-2.5 py-1.5 text-xs sm:block sm:min-w-24 sm:text-right">
              <span className="font-black text-base-content">{time.time}</span>
              <span className="text-base-content/45 sm:mt-0.5 sm:block">{time.date}</span>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-base-content/65 sm:grid-cols-2">
            {event.location || event.stationId ? (
              <div className="flex min-w-0 items-start gap-2 rounded-xl bg-base-200/35 px-2.5 py-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-base-content/40">
                    Trạm
                  </p>
                  <p className="break-safe font-semibold text-base-content/75">
                    {event.location || `Station ID ${event.stationId}`}
                  </p>
                  {event.location && event.stationId ? (
                    <p className="mt-0.5 font-mono text-[10px] text-base-content/40">
                      ID {event.stationId}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {event.operator ? (
              <div className="flex min-w-0 items-start gap-2 rounded-xl bg-base-200/35 px-2.5 py-2">
                <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-base-content/40">
                    Operator
                  </p>
                  <p className="break-all font-semibold text-base-content/75">
                    {event.operator}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {event.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-base-content/40" aria-hidden="true" />
              {event.tags.map((tag) => (
                <span key={tag} className="badge badge-ghost badge-sm font-semibold">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {event.photoUrls.length > 0 ? (
            <div className="mt-3 border-t border-base-200 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-base-content/55">
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Ảnh tracking
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {event.photoUrls.map((photoUrl, index) => (
                  <a
                    key={`${photoUrl}-${index}`}
                    href={photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-base-200 bg-base-200"
                    aria-label={`Mở ảnh tracking ${index + 1}`}
                  >
                    <img
                      src={photoUrl}
                      alt={`Ảnh tracking ${index + 1}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-base-100/90 text-base-content shadow-sm">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </article>
    </li>
  );
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

  const latestEvent = data?.events[0] ?? null;
  const latestTime = latestEvent ? trackingTimeParts(latestEvent.timestamp) : null;

  return (
    <dialog className="modal modal-open p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4">
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>

      <div className="modal-box max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto rounded-xl p-0 sm:rounded-2xl">
        <header className="sticky top-0 z-20 border-b border-base-200 bg-base-100/95 px-4 py-3.5 backdrop-blur sm:px-5 sm:py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Route className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-black">Tracking bao</h3>
              <p className="mt-0.5 break-all font-mono text-xs font-bold text-primary sm:text-sm">
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
        </header>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <span className="loading loading-spinner loading-lg text-primary" />
              <div>
                <p className="font-bold">Đang lấy tracking...</p>
                <p className="mt-1 text-sm text-base-content/60">
                  Đang lấy đơn đầu tiên trong bao và tải toàn bộ hành trình.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
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
              <section className="mb-5 grid gap-2.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                <div className="rounded-2xl border border-base-200 bg-base-200/30 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-base-100 text-primary shadow-xs">
                      <PackageSearch className="h-4.5 w-4.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-base-content/45">
                        Đơn đại diện đầu tiên
                      </p>
                      <p className="mt-1 break-all font-mono text-sm font-black">
                        {data.shipmentId}
                      </p>
                      <p className="mt-1 text-xs text-base-content/50">
                        {data.events.length} mốc hành trình
                      </p>
                    </div>
                  </div>
                </div>

                {latestEvent && latestTime ? (
                  <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3.5">
                    <div className="flex items-start gap-2.5">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-content shadow-xs">
                        <Clock3 className="h-4.5 w-4.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-primary/70">
                            Cập nhật mới nhất
                          </p>
                          {latestEvent.status ? (
                            <span className="badge badge-primary badge-xs font-mono">
                              {latestEvent.status}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 break-safe text-sm font-black leading-5">
                          {latestEvent.title}
                        </p>
                        <p className="mt-1 text-xs text-base-content/55">
                          {latestTime.time} · {latestTime.date}
                          {latestEvent.location ? ` · ${latestEvent.location}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black">Lịch sử hành trình</h4>
                  <p className="mt-0.5 text-xs text-base-content/50">
                    Mới nhất ở trên · hiển thị cả event hệ thống/ASM nếu có
                  </p>
                </div>
              </div>

              <ol className="relative before:absolute before:bottom-4 before:left-[10px] before:top-4 before:w-px before:bg-base-300 sm:before:left-[13px]">
                {data.events.map((event, index) => (
                  <TrackingEventCard
                    key={`${event.status}-${event.eventCode}-${event.timestamp ?? "na"}-${index}`}
                    event={event}
                    latest={index === 0}
                  />
                ))}
              </ol>
            </>
          ) : null}
        </div>

        <div className="modal-action sticky bottom-0 z-20 m-0 justify-center border-t border-base-200 bg-base-100/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:p-4">
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
