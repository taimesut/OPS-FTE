import { useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  ScanLine,
  Send,
} from "lucide-react";
import EmbeddedQRScanner from "../components/EmbeddedQRScanner";
import { PageHeader } from "../components/PageHeader";
import { PdaEvidenceCapture } from "../components/PdaEvidenceCapture";
import { PdaHandoverCard } from "../components/PdaHandoverCard";
import { showToast } from "../components/Toast";
import { compressPdaEvidence } from "../utils/imageCompression";
import {
  getPdaProgress,
  isPdaShift,
  PDA_SHIFTS,
  replacePdaItem,
  validateHandoverDate,
  type PdaHandoverSession,
  type PdaShift,
} from "../utils/pdaHandover";
import {
  fetchPdaHandover,
  getGasErrorMessage,
  submitPdaSession,
  uploadPdaPhoto,
  validatePdaScan,
} from "../utils/pdaHandoverApi";

type PendingAction = "bootstrap" | "scan" | "upload" | "submit" | null;

const submittedAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function getLocalDateValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.valueOf() - offset).toISOString().slice(0, 10);
}

function formatSubmittedAt(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? ""
    : submittedAtFormatter.format(parsed);
}

export function BanGiaoPdaPage() {
  const today = getLocalDateValue();
  const [handoverDate, setHandoverDate] = useState(today);
  const [shift, setShift] = useState<PdaShift | "">("");
  const [session, setSession] = useState<PdaHandoverSession | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<string | null>(null);

  const busy = pendingAction !== null;
  const readOnly = session?.status === "SUBMITTED";
  const progress = getPdaProgress(session?.items ?? []);

  const resetSession = () => {
    setSession(null);
    setScannerOpen(false);
    setCaptureTarget(null);
  };

  const handleBootstrap = async () => {
    try {
      validateHandoverDate(handoverDate, today);
      if (!shift) {
        showToast("Vui lòng chọn ca làm việc.", "warning");
        return;
      }

      setPendingAction("bootstrap");
      const nextSession = await fetchPdaHandover(handoverDate, shift);
      setSession(nextSession);
      showToast(
        nextSession.status === "SUBMITTED"
          ? "Ca này đã được bàn giao."
          : "Đã mở phiên bàn giao PDA.",
        nextSession.status === "SUBMITTED" ? "info" : "success",
      );
    } catch (error) {
      showToast(getGasErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const handleScan = async (secret: string) => {
    setScannerOpen(false);
    if (!session || pendingAction !== null) return;

    setPendingAction("scan");
    try {
      const nextItem = await validatePdaScan(session.sessionId, secret);
      setSession((current) =>
        current ? replacePdaItem(current, nextItem) : current,
      );
      if (nextItem.completed) {
        showToast("PDA này đã hoàn tất.", "info");
      } else {
        setCaptureTarget(nextItem.pdaName);
      }
    } catch (error) {
      showToast(getGasErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const handlePhoto = async (file: File) => {
    if (!session || !captureTarget || pendingAction !== null) return;

    const pdaName = captureTarget;
    setPendingAction("upload");
    try {
      const dataUrl = await compressPdaEvidence(file);
      const nextItem = await uploadPdaPhoto(session.sessionId, pdaName, dataUrl);
      setSession((current) =>
        current ? replacePdaItem(current, nextItem) : current,
      );
      setCaptureTarget(null);
      showToast(`Đã lưu ảnh ${pdaName}.`, "success");
    } catch (error) {
      showToast(getGasErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = async () => {
    if (!session || readOnly || !progress.canSubmit || pendingAction !== null) {
      return;
    }

    setPendingAction("submit");
    try {
      const submittedSession = await submitPdaSession(session.sessionId);
      setSession(submittedSession);
      showToast("Đã gửi bàn giao PDA.", "success");
    } catch (error) {
      showToast(getGasErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="app-page space-y-5 pb-36 text-base-content md:space-y-6 md:pb-8">
      <EmbeddedQRScanner
        open={scannerOpen}
        mode={scannerOpen ? "item" : null}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
      />

      <PdaEvidenceCapture
        open={captureTarget !== null}
        pdaName={captureTarget}
        uploading={pendingAction === "upload"}
        onFile={handlePhoto}
        onClose={() => setCaptureTarget(null)}
      />

      <PageHeader
        icon={ClipboardCheck}
        title="Bàn giao PDA"
        description="Quét và chụp đủ toàn bộ thiết bị trước khi gửi bàn giao."
        tone="warning"
      />

      <section className="app-surface overflow-hidden" aria-labelledby="handover-session-heading">
        <div className="border-b border-base-200 bg-base-200/40 px-4 py-3 sm:px-5">
          <h2 id="handover-session-heading" className="app-section-title">
            Ngày và ca bàn giao
          </h2>
          <p className="app-section-description">
            Mỗi ngày và ca chỉ được gửi một phiên bàn giao.
          </p>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <label className="form-control w-full">
            <span className="label-text mb-2 text-sm">Ngày bàn giao</span>
            <input
              type="date"
              value={handoverDate}
              max={today}
              disabled={busy}
              onChange={(event) => {
                setHandoverDate(event.target.value);
                resetSession();
              }}
              className="input input-bordered min-h-12 w-full rounded-xl"
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-2 text-sm">Ca làm việc</span>
            <select
              value={shift}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value;
                setShift(isPdaShift(value) ? value : "");
                resetSession();
              }}
              className="select select-bordered min-h-12 w-full rounded-xl"
            >
              <option value="">Chọn ca làm việc</option>
              {PDA_SHIFTS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleBootstrap}
            disabled={busy || !shift || !handoverDate}
            className="btn btn-primary min-h-12 w-full gap-2 rounded-xl sm:col-span-2"
          >
            {pendingAction === "bootstrap" ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                Đang mở phiên...
              </>
            ) : (
              <>
                <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                {session ? "Tải lại phiên bàn giao" : "Bắt đầu bàn giao"}
              </>
            )}
          </button>
        </div>
      </section>

      {session ? (
        <>
          {readOnly ? (
            <section className="app-surface border-success/30 bg-success/10 p-4" role="status">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="font-black text-success">Đã hoàn tất bàn giao</h2>
                  <p className="break-safe mt-1 text-sm text-base-content/75">
                    Đã bàn giao bởi {session.submittedBy}
                    <br />
                    {formatSubmittedAt(session.submittedAt)}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="pda-list-heading">
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div>
                <h2 id="pda-list-heading" className="app-section-title">
                  Danh sách PDA
                </h2>
                <p className="app-section-description">
                  Quét đúng mã QR rồi chụp ảnh từng máy.
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-black text-primary">
                {progress.completed}/{progress.total}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {session.items.map((item) => (
                <PdaHandoverCard
                  key={item.pdaName}
                  item={item}
                  busy={busy}
                  readOnly={readOnly}
                  onCapture={setCaptureTarget}
                />
              ))}
            </div>
          </section>

          <aside className="mobile-action-bar" aria-label="Tiến độ và thao tác bàn giao">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-bold">Tiến độ bàn giao</span>
                <span className="font-mono font-black text-primary">
                  {progress.completed}/{progress.total}
                </span>
              </div>
              <progress
                className="progress progress-primary h-2 w-full"
                value={progress.completed}
                max={Math.max(progress.total, 1)}
                aria-label={`Đã hoàn tất ${progress.completed} trên ${progress.total} PDA`}
              />
            </div>

            {!readOnly ? (
              <div className="grid min-w-0 grid-cols-2 gap-2 md:flex md:shrink-0">
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  disabled={busy}
                  className="btn btn-outline min-h-12 min-w-0 gap-2 rounded-xl md:min-w-36"
                  aria-label="Quét mã QR PDA"
                >
                  {pendingAction === "scan" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ScanLine className="h-5 w-5" aria-hidden="true" />
                  )}
                  Quét PDA
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={busy || !progress.canSubmit}
                  className="btn btn-primary min-h-12 min-w-0 gap-2 rounded-xl md:min-w-40"
                >
                  {pendingAction === "submit" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-5 w-5" aria-hidden="true" />
                  )}
                  Gửi bàn giao
                </button>
              </div>
            ) : null}
          </aside>
        </>
      ) : (
        <section className="app-surface p-6 text-center text-sm text-base-content/60">
          Chọn ngày, ca làm việc và bắt đầu để tải danh sách PDA đang hoạt động.
        </section>
      )}
    </div>
  );
}
