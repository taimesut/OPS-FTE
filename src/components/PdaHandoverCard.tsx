import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  ScanLine,
} from "lucide-react";
import {
  derivePdaItemState,
  type PdaHandoverItem,
  type PdaItemState,
} from "../utils/pdaHandover";
import type { PdaUploadStatus } from "../utils/pdaUploadQueue";

interface PdaHandoverCardProps {
  item: PdaHandoverItem;
  busy: boolean;
  readOnly: boolean;
  uploadStatus?: PdaUploadStatus;
  uploadError?: string | null;
  onCapture: (pdaName: string) => void;
  onRetry: (pdaName: string) => void;
}

const STATUS: Record<
  PdaItemState,
  { label: string; badge: string; icon: typeof ScanLine }
> = {
  PENDING_SCAN: {
    label: "Chưa quét",
    badge: "badge-ghost",
    icon: ScanLine,
  },
  WAITING_PHOTO: {
    label: "Chờ ảnh",
    badge: "badge-warning",
    icon: Clock3,
  },
  COMPLETED: {
    label: "Hoàn tất",
    badge: "badge-success",
    icon: CheckCircle2,
  },
};

const timestampFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? "—"
    : timestampFormatter.format(parsed);
}

function getPhotoThumbnailUrl(photoUrl: string): string {
  const fileId = /\/file\/d\/([^/?#]+)/.exec(photoUrl)?.[1];
  return fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w400`
    : photoUrl;
}

export function PdaHandoverCard({
  item,
  busy,
  readOnly,
  uploadStatus,
  uploadError,
  onCapture,
  onRetry,
}: PdaHandoverCardProps) {
  const state = derivePdaItemState(item);
  const persistedStatus = STATUS[state];
  const uploadPresentation = uploadStatus === "FAILED"
    ? { label: "Tải ảnh lỗi", badge: "badge-error", icon: AlertCircle }
    : uploadStatus === "UPLOADING"
      ? { label: "Đang tải ảnh", badge: "badge-info", icon: LoaderCircle }
      : uploadStatus === "QUEUED"
        ? { label: "Đang chờ tải", badge: "badge-info", icon: Clock3 }
        : persistedStatus;
  const StatusIcon = uploadPresentation.icon;
  const canCapture = !readOnly && state !== "PENDING_SCAN";
  const canRetry = !readOnly && uploadStatus === "FAILED";

  return (
    <article className="app-surface overflow-hidden" aria-label={`Thiết bị ${item.pdaName}`}>
      <div className="flex min-w-0 items-start gap-3 p-4">
        {item.photoUrl ? (
          <img
            src={getPhotoThumbnailUrl(item.photoUrl)}
            alt={`Ảnh bằng chứng của ${item.pdaName}`}
            loading="lazy"
            className="aspect-[4/3] h-20 w-24 shrink-0 rounded-xl border border-base-200 bg-base-200 object-cover"
          />
        ) : (
          <div className="grid aspect-[4/3] h-20 w-24 shrink-0 place-items-center rounded-xl border border-dashed border-base-300 bg-base-200/60 text-base-content/35">
            <Camera className="h-6 w-6" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 className="break-safe text-lg font-black tracking-tight">
              {item.pdaName}
            </h2>
            <span className={`badge min-h-7 gap-1.5 px-2.5 font-bold ${uploadPresentation.badge}`}>
              <StatusIcon
                className={`h-3.5 w-3.5 ${uploadStatus === "UPLOADING" ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {uploadPresentation.label}
            </span>
          </div>

          <dl className="mt-3 grid gap-1.5 text-xs text-base-content/65">
            <div className="flex min-w-0 justify-between gap-3">
              <dt>Quét lúc</dt>
              <dd className="break-safe text-right font-semibold text-base-content/80">
                {formatTimestamp(item.scanAt)}
              </dd>
            </div>
            <div className="flex min-w-0 justify-between gap-3">
              <dt>Ảnh lúc</dt>
              <dd className="break-safe text-right font-semibold text-base-content/80">
                {formatTimestamp(item.photoAt)}
              </dd>
            </div>
          </dl>
          {uploadStatus === "FAILED" && uploadError ? (
            <p className="break-safe mt-2 text-xs font-semibold text-error" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>
      </div>

      {canCapture || canRetry ? (
        <div className="border-t border-base-200 bg-base-200/35 p-3">
          <div className={`grid gap-2 ${canCapture && canRetry ? "grid-cols-2" : ""}`}>
            {canRetry ? (
              <button
                type="button"
                onClick={() => onRetry(item.pdaName)}
                disabled={busy}
                className="btn btn-error min-h-11 min-w-0 rounded-xl"
                aria-label={`Thử tải lại ảnh ${item.pdaName}`}
              >
                Thử tải lại
              </button>
            ) : null}
            {canCapture ? (
              <button
                type="button"
                onClick={() => onCapture(item.pdaName)}
                disabled={busy}
                className="btn btn-outline min-h-11 min-w-0 gap-2 rounded-xl"
                aria-label={`${state === "COMPLETED" ? "Chụp lại" : "Chụp ảnh"} ${item.pdaName}`}
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                {state === "COMPLETED" ? "Chụp lại" : "Chụp ảnh"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
