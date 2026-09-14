import {
  AlertCircle,
  Camera,
  ChevronDown,
  Clock3,
  ExternalLink,
  MapPin,
  PackageSearch,
  Route,
  ScanLine,
  Wrench,
  X,
} from "lucide-react";
import {
  groupTransferOrderTrackingByStationAndFlow,
  type TransferOrderTrackingEvent,
  type TransferOrderTrackingFlowGroup,
  type TransferOrderTrackingResult,
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
    return { time: "--:--:--", date: "Unknown date" };
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return { time: "--:--:--", date: "Unknown date" };
  }

  return {
    time: date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    date: date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  };
};

const StatusLabel = ({ event }: { event: TransferOrderTrackingEvent }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="font-black text-base-content">
      {event.statusName || (event.status ? `Status ${event.status}` : "System Event")}
    </span>
    {event.tags.map((tag) => (
      <span key={tag} className="badge badge-outline badge-sm font-bold">
        {tag}
      </span>
    ))}
    {event.status && !event.statusName ? (
      <span className="badge badge-ghost badge-sm font-mono text-[10px]">
        {event.status}
      </span>
    ) : null}
  </div>
);

const TrackingEventRow = ({ event }: { event: TransferOrderTrackingEvent }) => {
  const time = trackingTimeParts(event.timestamp);

  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[96px_minmax(0,1fr)]">
      <div className="text-right">
        <div className="font-mono text-sm font-black text-base-content">{time.time}</div>
        <div className="mt-0.5 text-[11px] font-semibold text-base-content/45">{time.date}</div>
      </div>

      <div className="relative min-w-0 border-l border-base-300 pl-4 before:absolute before:-left-[5px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:bg-primary before:ring-4 before:ring-base-100">
        <StatusLabel event={event} />

        <div className="mt-1.5 space-y-1 text-xs leading-5 text-base-content/65">
          {event.title ? (
            <p className="break-safe">
              <span className="font-bold text-base-content/45">message:</span>{" "}
              {event.title}
            </p>
          ) : null}
          {event.description ? (
            <p className="break-safe text-base-content/50">{event.description}</p>
          ) : null}
          {event.operator ? (
            <p className="break-all">
              <span className="font-bold text-base-content/45">operator:</span>{" "}
              {event.operator}
            </p>
          ) : null}
          {event.workstation ? (
            <p className="break-all">
              <span className="font-bold text-base-content/45">workstation:</span>{" "}
              {event.workstation}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const AuxiliaryEventRow = ({ event }: { event: TransferOrderTrackingEvent }) => {
  const time = trackingTimeParts(event.timestamp);
  const photoCount = event.photoUrls.length;
  const label = photoCount > 0 ? `View ${photoCount} Photo${photoCount > 1 ? "s" : ""}` : "View 1 Node";

  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[96px_minmax(0,1fr)]">
      <div className="text-right">
        <div className="font-mono text-sm font-black text-base-content">{time.time}</div>
        <div className="mt-0.5 text-[11px] font-semibold text-base-content/45">{time.date}</div>
      </div>

      <details className="group min-w-0 border-l border-base-300 pl-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-info marker:hidden">
          {photoCount > 0 ? (
            <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ScanLine className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {label}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="mt-2 rounded-xl bg-base-200/35 p-3 text-xs text-base-content/65">
          {event.eventCode ? (
            <p className="break-all font-mono text-[10px] font-bold text-base-content/55">
              {event.eventCode}
            </p>
          ) : null}
          {event.title ? <p className="mt-1 break-safe">{event.title}</p> : null}
          {event.operator ? (
            <p className="mt-1 break-all">
              <span className="font-bold text-base-content/45">operator:</span>{" "}
              {event.operator}
            </p>
          ) : null}

          {photoCount > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {event.photoUrls.map((photoUrl, index) => (
                <a
                  key={`${photoUrl}-${index}`}
                  href={photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group/photo relative aspect-[4/3] overflow-hidden rounded-xl border border-base-200 bg-base-200"
                  aria-label={`Mở ảnh tracking ${index + 1}`}
                >
                  <img
                    src={photoUrl}
                    alt={`Ảnh tracking ${index + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover/photo:scale-[1.03]"
                  />
                  <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-base-100/90 text-base-content shadow-sm">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
};

const FlowGroup = ({ group }: { group: TransferOrderTrackingFlowGroup }) => (
  <section className="rounded-xl border border-base-200 bg-base-100 p-3 sm:p-4">
    <div className="mb-3 flex items-center gap-2">
      <div className="h-px flex-1 bg-base-200" />
      <span className="badge badge-ghost badge-sm font-bold">{group.flow}</span>
      <div className="h-px flex-1 bg-base-200" />
    </div>

    {group.events.map((event, index) =>
      event.source === "event" ? (
        <AuxiliaryEventRow
          key={`${event.eventCode}-${event.timestamp ?? "na"}-${index}`}
          event={event}
        />
      ) : (
        <TrackingEventRow
          key={`${event.status}-${event.timestamp ?? "na"}-${index}`}
          event={event}
        />
      ),
    )}
  </section>
);

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

  const stationGroups = data
    ? groupTransferOrderTrackingByStationAndFlow(data.events)
    : [];
  const latestEvent = data?.events[0] ?? null;
  const latestTime = latestEvent ? trackingTimeParts(latestEvent.timestamp) : null;

  return (
    <dialog className="modal modal-open p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4">
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>

      <div className="modal-box max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto rounded-xl p-0 sm:rounded-2xl">
        <header className="sticky top-0 z-20 border-b border-base-200 bg-base-100/95 px-4 py-3.5 backdrop-blur sm:px-5 sm:py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Route className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-black">Order Tracking History</h3>
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
              <section className="mb-5 grid gap-2.5 sm:grid-cols-2">
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
                        {data.events.length} events · {stationGroups.length} station groups
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
                        <p className="text-[10px] font-bold uppercase tracking-wide text-primary/70">
                          Latest update
                        </p>
                        <p className="mt-1 break-safe text-sm font-black leading-5">
                          {latestEvent.statusName || latestEvent.title}
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

              <div className="space-y-5">
                {stationGroups.map((station, stationIndex) => (
                  <section
                    key={station.stationKey}
                    className="overflow-hidden rounded-2xl border border-base-200 bg-base-200/20"
                  >
                    <header className="flex items-start gap-3 border-b border-base-200 bg-base-100 px-3.5 py-3 sm:px-4">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary">
                        {station.stationName === "Khởi tạo" ? (
                          <Wrench className="h-4.5 w-4.5" aria-hidden="true" />
                        ) : (
                          <MapPin className="h-4.5 w-4.5" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="break-safe text-sm font-black sm:text-base">
                            {station.stationName}
                          </h4>
                          <span className="badge badge-ghost badge-sm">
                            Trạm {stationIndex + 1}
                          </span>
                        </div>
                        {station.stationId ? (
                          <p className="mt-0.5 font-mono text-[10px] text-base-content/45">
                            Station ID {station.stationId}
                          </p>
                        ) : null}
                      </div>
                    </header>

                    <div className="space-y-2.5 p-2.5 sm:p-3">
                      {station.flows.map((flow, flowIndex) => (
                        <FlowGroup
                          key={`${station.stationKey}-${flow.flow}-${flowIndex}`}
                          group={flow}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
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
