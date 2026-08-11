import { useCallback, useMemo, useRef, useState } from "react";
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
import { PdaFastScanner } from "../components/PdaFastScanner";
import { PdaHandoverCard } from "../components/PdaHandoverCard";
import { showToast } from "../components/Toast";
import { usePdaUploadQueue } from "../hooks/usePdaUploadQueue";
import { compressPdaEvidenceBlob } from "../utils/imageCompression";
import {
  canSubmitPdaHandover,
  getPdaItemPriority,
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
  validatePdaScan,
} from "../utils/pdaHandoverApi";

type PendingAction = "bootstrap" | "compression" | "submit" | null;

interface ScanValidationResult {
  accepted: boolean;
  pdaName?: string;
  message?: string;
}

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
  const [validationPending, setValidationPending] = useState(false);
  const [fastScannerOpen, setFastScannerOpen] = useState(false);
  const [legacyScannerOpen, setLegacyScannerOpen] = useState(false);
  const [fastScannerSupported, setFastScannerSupported] = useState(true);
  const [captureTarget, setCaptureTarget] = useState<string | null>(null);
  const validationPendingRef = useRef(false);
  const lastAcceptedPdaRef = useRef<string | null>(null);

  const readOnly = session?.status === "SUBMITTED";
  const progress = getPdaProgress(session?.items ?? []);
  const handleUploaded = useCallback((item: Parameters<typeof replacePdaItem>[1]) => {
    setSession((current) =>
      current ? replacePdaItem(current, item) : current,
    );
    showToast(`Đã lưu ảnh ${item.pdaName}.`, "success");
  }, []);
  const {
    jobs,
    enqueue,
    retry,
    uploadingCount,
    hasBlockingJobs,
  } = usePdaUploadQueue({
    sessionId: session?.status === "DRAFT" ? session.sessionId : null,
    onUploaded: handleUploaded,
  });

  const jobsByName = useMemo(
    () => new Map(jobs.map((job) => [job.pdaName, job])),
    [jobs],
  );
  const sortedItems = useMemo(() => {
    if (!session) return [];
    return session.items
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const priorityDifference =
          getPdaItemPriority(left.item, jobsByName.get(left.item.pdaName)?.status) -
          getPdaItemPriority(right.item, jobsByName.get(right.item.pdaName)?.status);
        return priorityDifference || left.index - right.index;
      })
      .map(({ item }) => item);
  }, [jobsByName, session]);

  const interactionPending =
    validationPending || pendingAction !== null || captureTarget !== null;
  const canSubmit = canSubmitPdaHandover({
    backendComplete: progress.canSubmit,
    hasBlockingJobs,
    interactionPending,
  });
  const busy = validationPending || pendingAction !== null;
  const selectionLocked = busy || hasBlockingJobs;

  const submitBlockReason = useMemo(() => {
    if (pendingAction === "submit") return "Đang gửi bàn giao...";
    if (validationPending) return "Đang xác thực mã PDA...";
    if (pendingAction === "compression" || captureTarget) {
      return "Hoàn tất hoặc đóng bước chụp ảnh.";
    }
    if (jobs.some((job) => job.status === "FAILED")) {
      return "Có ảnh tải lỗi. Hãy thử tải lại hoặc chụp lại.";
    }
    if (uploadingCount > 0) return `Đang tải ${uploadingCount} ảnh lên Drive...`;
    if (jobs.some((job) => job.status === "QUEUED")) {
      return "Ảnh đang chờ lượt tải lên.";
    }
    if (!progress.canSubmit) {
      return `Còn ${Math.max(0, progress.total - progress.completed)} PDA chưa hoàn tất.`;
    }
    return "Đã đủ bằng chứng, có thể gửi bàn giao.";
  }, [captureTarget, jobs, pendingAction, progress, uploadingCount, validationPending]);

  const resetSession = () => {
    setSession(null);
    setFastScannerOpen(false);
    setLegacyScannerOpen(false);
    setCaptureTarget(null);
    lastAcceptedPdaRef.current = null;
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

  const validateScannedPda = useCallback(async (secret: string): Promise<ScanValidationResult> => {
    if (!session || readOnly || validationPendingRef.current) {
      return { accepted: false, message: "Chưa thể xác thực PDA lúc này." };
    }

    const sessionId = session.sessionId;
    validationPendingRef.current = true;
    setValidationPending(true);
    try {
      const nextItem = await validatePdaScan(sessionId, secret);
      setSession((current) =>
        current?.sessionId === sessionId
          ? replacePdaItem(current, nextItem)
          : current,
      );

      const uploadStatus = jobsByName.get(nextItem.pdaName)?.status;
      if (
        nextItem.completed ||
        uploadStatus === "QUEUED" ||
        uploadStatus === "UPLOADING"
      ) {
        lastAcceptedPdaRef.current = null;
        return {
          accepted: false,
          message: `${nextItem.pdaName} đã được ghi nhận.`,
        };
      }

      lastAcceptedPdaRef.current = nextItem.pdaName;
      return { accepted: true, pdaName: nextItem.pdaName };
    } catch (error) {
      lastAcceptedPdaRef.current = null;
      return { accepted: false, message: getGasErrorMessage(error) };
    } finally {
      validationPendingRef.current = false;
      setValidationPending(false);
    }
  }, [jobsByName, readOnly, session]);

  const handleFastEvidence = useCallback((pdaName: string, blob: Blob) => {
    lastAcceptedPdaRef.current = null;
    enqueue(pdaName, blob);
  }, [enqueue]);

  const handleFastUnsupported = () => {
    setFastScannerSupported(false);
    setFastScannerOpen(false);
    const acceptedPdaName = lastAcceptedPdaRef.current;
    lastAcceptedPdaRef.current = null;
    if (acceptedPdaName) {
      setCaptureTarget(acceptedPdaName);
    } else {
      setLegacyScannerOpen(true);
    }
  };

  const handleFastClose = () => {
    lastAcceptedPdaRef.current = null;
    setFastScannerOpen(false);
  };

  const handleLegacyScan = async (secret: string) => {
    setLegacyScannerOpen(false);
    const result = await validateScannedPda(secret);
    if (result.accepted && result.pdaName) {
      lastAcceptedPdaRef.current = null;
      setCaptureTarget(result.pdaName);
      return;
    }
    showToast(result.message || "Mã PDA không hợp lệ. Vui lòng quét lại.", "warning");
  };

  const handlePhoto = async (file: File) => {
    if (!session || !captureTarget || pendingAction !== null) return;

    const pdaName = captureTarget;
    setPendingAction("compression");
    try {
      const blob = await compressPdaEvidenceBlob(file);
      enqueue(pdaName, blob);
      setCaptureTarget(null);
      showToast(`Đã xếp tải ảnh ${pdaName}.`, "success");
    } catch (error) {
      showToast(getGasErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const handleRetry = (pdaName: string) => {
    retry(pdaName);
    showToast(`Đang thử tải lại ảnh ${pdaName}.`, "info");
  };

  const handleOpenScanner = () => {
    lastAcceptedPdaRef.current = null;
    if (fastScannerSupported) setFastScannerOpen(true);
    else setLegacyScannerOpen(true);
  };

  const handleSubmit = async () => {
    if (!session || readOnly || !canSubmit) return;

    setPendingAction("submit");
    try {
      const submittedSession = await submitPdaSession(session.sessionId);
      setSession(submittedSession);
      setFastScannerOpen(false);
      setLegacyScannerOpen(false);
      setCaptureTarget(null);
      showToast("Đã gửi bàn giao PDA.", "success");
    } catch (error) {
      showToast(getGasErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="app-page space-y-5 pb-40 text-base-content md:space-y-6 md:pb-8">
      <PdaFastScanner
        open={fastScannerOpen}
        completed={progress.completed}
        total={progress.total}
        uploading={uploadingCount}
        onValidate={validateScannedPda}
        onEvidence={handleFastEvidence}
        onUnsupported={handleFastUnsupported}
        onClose={handleFastClose}
      />

      <EmbeddedQRScanner
        open={legacyScannerOpen}
        mode={legacyScannerOpen ? "item" : null}
        onScan={handleLegacyScan}
        onClose={() => setLegacyScannerOpen(false)}
      />

      <PdaEvidenceCapture
        open={captureTarget !== null}
        pdaName={captureTarget}
        uploading={pendingAction === "compression"}
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
              disabled={selectionLocked}
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
              disabled={selectionLocked}
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
            disabled={selectionLocked || !shift || !handoverDate}
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
                  PDA cần xử lý và ảnh lỗi luôn được đưa lên đầu.
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-black text-primary">
                {progress.completed}/{progress.total}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {sortedItems.map((item) => {
                const job = jobsByName.get(item.pdaName);
                return (
                  <PdaHandoverCard
                    key={item.pdaName}
                    item={item}
                    busy={busy}
                    readOnly={readOnly}
                    uploadStatus={job?.status}
                    uploadError={job?.error}
                    onCapture={setCaptureTarget}
                    onRetry={handleRetry}
                  />
                );
              })}
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
              {!readOnly ? (
                <p className={`mt-2 text-xs font-semibold ${canSubmit ? "text-success" : "text-base-content/65"}`} role="status">
                  {submitBlockReason}
                </p>
              ) : null}
            </div>

            {!readOnly ? (
              <div className="grid min-w-0 grid-cols-2 gap-2 md:flex md:shrink-0">
                <button
                  type="button"
                  onClick={handleOpenScanner}
                  disabled={busy}
                  className="btn btn-outline min-h-12 min-w-0 gap-2 rounded-xl md:min-w-36"
                  aria-label="Quét liên tục mã QR PDA"
                >
                  {validationPending ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ScanLine className="h-5 w-5" aria-hidden="true" />
                  )}
                  Quét PDA
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
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
