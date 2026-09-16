import {
  AlertCircle,
  Camera,
  ChevronDown,
  ExternalLink,
  MapPin,
  ScanLine,
  X,
} from "lucide-react";
import {
  groupTransferOrderTrackingByStationAndFlow,
  type TransferOrderTrackingEvent,
  type TransferOrderTrackingStationGroup,
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

const TimelineTime = ({ timestamp }: { timestamp: number | null }) => {
  const value = trackingTimeParts(timestamp);

  return (
    <div className="pt-0.5 text-right">
      <div className="font-mono text-[12px] font-black leading-4 text-base-content sm:text-[13px]">
        {value.time}
      </div>
      <div className="mt-0.5 whitespace-nowrap text-[9px] font-medium leading-3 text-base-content/55 sm:text-[10px]">
        {value.date}
      </div>
    </div>
  );
};

const TimelineRail = ({
  marker = true,
  station = false,
  completed = false,
}: {
  marker?: boolean;
  station?: boolean;
  completed?: boolean;
}) => (
  <div className="relative flex min-h-full justify-center">
    <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-base-300" />
    {marker ? (
      station ? (
        <span className="relative mt-1 grid h-4 w-4 place-items-center rounded-full bg-base-100 text-base-content/45">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : (
        <span
          className={`relative mt-1.5 h-2.5 w-2.5 rounded-full border bg-base-100 ${
            completed ? "border-success text-success" : "border-base-300"
          }`}
        >
          {completed ? (
            <span className="absolute inset-[2px] rounded-full bg-success" />
          ) : null}
        </span>
      )
    ) : null}
  </div>
);

const isDeliveredEvent = (event: TransferOrderTrackingEvent): boolean =>
  /(^|_)Delivered$/i.test(event.statusName) || /^Delivered$/i.test(event.statusName);

const StatusLabel = ({ event }: { event: TransferOrderTrackingEvent }) => {
  const label =
    event.statusName ||
    event.eventCode ||
    (event.status ? `Status ${event.status}` : "System Event");
  const delivered = isDeliveredEvent(event);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex min-h-5 items-center rounded-[2px] px-1.5 py-0.5 text-[11px] font-bold leading-4 ${
          delivered
            ? "bg-success/10 text-success"
            : "bg-base-200 text-base-content/60"
        }`}
      >
        {label}
      </span>

      {event.tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex min-h-5 items-center rounded-[2px] border border-base-300 bg-base-100 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-base-content/60"
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

const EventDetails = ({ event }: { event: TransferOrderTrackingEvent }) => {
  const photoCount = event.photoUrls.length;

  return (
    <div className="min-w-0 pb-4">
      <StatusLabel event={event} />

      <div className="mt-1.5 space-y-0.5 text-[11px] leading-[1.55] text-base-content/55 sm:text-xs">
        {event.title ? (
          <p className="break-words">
            <span className="text-base-content/45">message:</span> {event.title}
          </p>
        ) : null}
        {event.description ? (
          <p className="break-words text-base-content/45">{event.description}</p>
        ) : null}
        {event.operator ? (
          <p className="break-words">
            <span className="text-base-content/45">operator:</span> {event.operator}
          </p>
        ) : null}
        {event.workstation ? (
          <p className="break-words">
            <span className="text-base-content/45">workstation:</span> {event.workstation}
          </p>
        ) : null}
      </div>

      {event.source === "event" && (photoCount > 0 || event.eventCode) ? (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-info marker:hidden">
            {photoCount > 0 ? (
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {photoCount > 0
              ? `${photoCount} ảnh tracking`
              : event.eventCode || "Chi tiết event"}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>

          <div className="mt-2 border-l-2 border-base-200 pl-2.5">
            {event.eventCode && photoCount > 0 ? (
              <p className="break-all font-mono text-[9px] font-semibold text-base-content/45">
                {event.eventCode}
              </p>
            ) : null}

            {photoCount > 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {event.photoUrls.map((photoUrl, index) => (
                  <a
                    key={`${photoUrl}-${index}`}
                    href={photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group/photo relative aspect-[4/3] overflow-hidden rounded-md border border-base-200 bg-base-200"
                    aria-label={`Mở ảnh tracking ${index + 1}`}
                  >
                    <img
                      src={photoUrl}
                      alt={`Ảnh tracking ${index + 1}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover/photo:scale-[1.03]"
                    />
                    <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded bg-base-100/90 text-base-content shadow-sm">
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
};

const TrackingEventRow = ({
  event,
  hideTime = false,
  hideMarker = false,
}: {
  event: TransferOrderTrackingEvent;
  hideTime?: boolean;
  hideMarker?: boolean;
}) => (
  <div className="grid grid-cols-[72px_18px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[84px_20px_minmax(0,1fr)] sm:gap-x-2.5">
    {hideTime ? <div /> : <TimelineTime timestamp={event.timestamp} />}
    <TimelineRail
      marker={!hideMarker}
      completed={isDeliveredEvent(event)}
    />
    <EventDetails event={event} />
  </div>
);

const flattenStationEvents = (
  station: TransferOrderTrackingStationGroup,
): TransferOrderTrackingEvent[] =>
  station.flows.flatMap((flow) => flow.events);

const StationTimelineGroup = ({
  station,
}: {
  station: TransferOrderTrackingStationGroup;
}) => {
  const events = flattenStationEvents(station);

  if (station.stationName === "Khởi tạo") {
    return (
      <>
        {events.map((event, index) => (
          <TrackingEventRow
            key={`${event.status}-${event.eventCode}-${event.timestamp ?? "na"}-${index}`}
            event={event}
          />
        ))}
      </>
    );
  }

  const firstEvent = events[0] ?? null;

  return (
    <details className="group/station" open>
      <summary className="grid cursor-pointer list-none grid-cols-[72px_18px_minmax(0,1fr)] gap-x-2 marker:hidden sm:grid-cols-[84px_20px_minmax(0,1fr)] sm:gap-x-2.5">
        <TimelineTime timestamp={station.firstTimestamp} />
        <TimelineRail station />
        <div className="min-w-0 pb-2 pt-0.5">
          <div className="flex items-start gap-1.5 text-[13px] font-black leading-5 text-base-content sm:text-sm">
            <span className="min-w-0 flex-1 break-words">{station.stationName}</span>
            <ChevronDown
              className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open/station:rotate-180"
              aria-hidden="true"
            />
          </div>
        </div>
      </summary>

      <div>
        {firstEvent ? (
          <TrackingEventRow event={firstEvent} hideTime hideMarker />
        ) : null}
        {events.slice(1).map((event, index) => (
          <TrackingEventRow
            key={`${event.status}-${event.eventCode}-${event.timestamp ?? "na"}-${index + 1}`}
            event={event}
          />
        ))}
      </div>
    </details>
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

  const stationGroups = data
    ? groupTransferOrderTrackingByStationAndFlow(data.events)
    : [];

  return (
    <dialog className="modal modal-open p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4">
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>

      <div className="modal-box max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[480px] overflow-y-auto rounded-lg bg-base-100 p-0 shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <header className="sticky top-0 z-20 bg-base-100 px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
          <div className="flex items-start gap-2 rounded bg-primary/[0.055] py-2 pl-0 pr-1">
            <span className="mt-0.5 h-4 w-[3px] shrink-0 bg-primary" />
            <div className="min-w-0 flex-1 px-1">
              <h3 className="text-sm font-medium text-primary sm:text-base">
                Order Tracking History
              </h3>
              {toNumber ? (
                <p className="mt-0.5 break-all font-mono text-[9px] font-semibold text-base-content/40 sm:text-[10px]">
                  {toNumber}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-square btn-ghost btn-xs min-h-8 min-w-8 rounded-md"
              onClick={onClose}
              aria-label="Đóng tracking"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <span className="loading loading-spinner loading-md text-primary" />
              <div>
                <p className="text-sm font-bold">Đang lấy tracking...</p>
                <p className="mt-1 text-xs text-base-content/55">
                  Đang tải toàn bộ hành trình của đơn đại diện.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-error/10 text-error">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="max-w-sm">
                <p className="text-sm font-black">Không tải được tracking</p>
                <p className="mt-1 break-words text-xs text-base-content/60">
                  {error}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm min-h-10 rounded-md px-5"
                onClick={onRetry}
              >
                Thử lại
              </button>
            </div>
          ) : data ? (
            <div className="pb-1">
              {stationGroups.map((station) => (
                <StationTimelineGroup
                  key={station.stationKey}
                  station={station}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
