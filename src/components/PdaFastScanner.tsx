import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldAlert, X } from "lucide-react";
import { SCANNER_URL } from "../utils/config";
import {
  isPdaScannerMessage,
  PDA_FAST_CAPABILITY,
  type PdaParentMessage,
} from "../utils/pdaFastScannerProtocol";

export interface PdaFastScannerProps {
  open: boolean;
  completed: number;
  total: number;
  uploading: number;
  onValidate: (secret: string) => Promise<{
    accepted: boolean;
    pdaName?: string;
    message?: string;
  }>;
  onEvidence: (pdaName: string, blob: Blob) => void;
  onUnsupported: () => void;
  onClose: () => void;
}

type FastScannerStatus = "idle" | "connecting" | "ready" | "unsupported";

interface FastScannerSession {
  requestId: string;
  startSent: boolean;
  ready: boolean;
  stopped: boolean;
  validationPending: boolean;
  acceptedPdaName: string | null;
  fallbackTriggered: boolean;
}

const SCANNER_ORIGIN = new URL(SCANNER_URL).origin;
const SCANNER_IFRAME_SRC = `${SCANNER_URL}/?embedded=1&workflow=pda-handover`;
const CAPABILITY_TIMEOUT_MS = 4000;

function normalizeCounter(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isLifecycleMessage(
  value: unknown,
): value is {
  type: "LH_TRIP_SCANNER_ERROR" | "LH_TRIP_SCANNER_CANCEL";
  requestId: string;
  fallback?: "camera";
} {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (
    typeof message.requestId !== "string" ||
    message.requestId.trim().length === 0
  ) {
    return false;
  }
  const keys = Object.keys(message);
  if (message.type === "LH_TRIP_SCANNER_CANCEL") {
    return keys.length === 2 && keys.includes("type") && keys.includes("requestId");
  }
  if (message.type !== "LH_TRIP_SCANNER_ERROR") return false;
  const allowedKeys = new Set(["type", "requestId", "message", "fallback"]);
  return (
    keys.includes("type") &&
    keys.includes("requestId") &&
    keys.every((key) => allowedKeys.has(key)) &&
    (message.message === undefined || typeof message.message === "string") &&
    (message.fallback === undefined || message.fallback === "camera")
  );
}

export function PdaFastScanner({
  open,
  completed,
  total,
  uploading,
  onValidate,
  onEvidence,
  onUnsupported,
  onClose,
}: PdaFastScannerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<FastScannerSession | null>(null);
  const frameLoadedRef = useRef(false);
  const capabilityTimerRef = useRef<number | null>(null);
  const readyRequestIdRef = useRef<string | null>(null);
  const onValidateRef = useRef(onValidate);
  const onEvidenceRef = useRef(onEvidence);
  const onUnsupportedRef = useRef(onUnsupported);
  const onCloseRef = useRef(onClose);
  const progressRef = useRef({ completed, total, uploading });
  const [status, setStatus] = useState<FastScannerStatus>("idle");
  const [fallbackMessage, setFallbackMessage] = useState("");

  useEffect(() => {
    onValidateRef.current = onValidate;
    onEvidenceRef.current = onEvidence;
    onUnsupportedRef.current = onUnsupported;
    onCloseRef.current = onClose;
  }, [onClose, onEvidence, onUnsupported, onValidate]);

  const clearCapabilityTimer = useCallback(() => {
    if (capabilityTimerRef.current !== null) {
      window.clearTimeout(capabilityTimerRef.current);
      capabilityTimerRef.current = null;
    }
  }, []);

  const postToScanner = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, SCANNER_ORIGIN);
  }, []);

  useEffect(() => {
    const progress = { completed, total, uploading };
    progressRef.current = progress;
    const requestId = readyRequestIdRef.current;
    if (!requestId) return;
    const normalizedTotal = normalizeCounter(progress.total);
    const message: PdaParentMessage = {
      type: "PDA_HANDOVER_CONTINUE",
      requestId,
      completed: Math.min(normalizeCounter(progress.completed), normalizedTotal),
      total: normalizedTotal,
      uploading: normalizeCounter(progress.uploading),
    };
    postToScanner(message);
  }, [completed, postToScanner, total, uploading]);

  const sendStop = useCallback(
    (session: FastScannerSession) => {
      const message: PdaParentMessage = {
        type: "PDA_HANDOVER_STOP",
        requestId: session.requestId,
      };
      postToScanner(message);
    },
    [postToScanner],
  );

  const stopSession = useCallback(
    (session: FastScannerSession | null = sessionRef.current) => {
      if (!session) {
        clearCapabilityTimer();
        return;
      }
      if (!session.stopped) sendStop(session);
      session.stopped = true;
      session.validationPending = false;
      session.acceptedPdaName = null;
      if (readyRequestIdRef.current === session.requestId) {
        readyRequestIdRef.current = null;
      }
      if (sessionRef.current === session) sessionRef.current = null;
      clearCapabilityTimer();
    },
    [clearCapabilityTimer, sendStop],
  );

  const triggerUnsupported = useCallback(
    (message: string) => {
      const session = sessionRef.current;
      if (!session || session.fallbackTriggered) return;
      session.fallbackTriggered = true;
      setFallbackMessage(message);
      setStatus("unsupported");
      sendStop(session);
      session.stopped = true;
      session.validationPending = false;
      session.acceptedPdaName = null;
      if (readyRequestIdRef.current === session.requestId) {
        readyRequestIdRef.current = null;
      }
      clearCapabilityTimer();
      onUnsupportedRef.current();
    },
    [clearCapabilityTimer, sendStop],
  );

  const armCapabilityTimer = useCallback(
    (session: FastScannerSession) => {
      clearCapabilityTimer();
      capabilityTimerRef.current = window.setTimeout(() => {
        if (sessionRef.current !== session || session.ready || session.stopped) return;
        triggerUnsupported(
          "Máy quét nhanh chưa sẵn sàng. Đang chuyển sang chế độ quét thường.",
        );
      }, CAPABILITY_TIMEOUT_MS);
    },
    [clearCapabilityTimer, triggerUnsupported],
  );

  const sendStart = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.startSent || session.stopped) return;
    session.startSent = true;
    postToScanner({
      type: "LH_TRIP_SCANNER_START",
      requestId: session.requestId,
      targetOrigin: window.location.origin,
      mode: "item",
      workflow: "pda-handover",
      completed: Math.min(
        normalizeCounter(progressRef.current.completed),
        normalizeCounter(progressRef.current.total),
      ),
      total: normalizeCounter(progressRef.current.total),
      uploading: normalizeCounter(progressRef.current.uploading),
    });
    armCapabilityTimer(session);
  }, [armCapabilityTimer, postToScanner]);

  const startSession = useCallback(() => {
    stopSession();
    const session: FastScannerSession = {
      requestId: crypto.randomUUID(),
      startSent: false,
      ready: false,
      stopped: false,
      validationPending: false,
      acceptedPdaName: null,
      fallbackTriggered: false,
    };
    sessionRef.current = session;
    readyRequestIdRef.current = null;
    setFallbackMessage("");
    setStatus("connecting");
    if (frameLoadedRef.current) sendStart();
  }, [sendStart, stopSession]);

  useEffect(() => {
    if (!open) {
      frameLoadedRef.current = false;
      const timer = window.setTimeout(() => {
        stopSession();
        setStatus("idle");
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(startSession, 0);
    return () => {
      window.clearTimeout(timer);
      stopSession();
    };
  }, [open, startSession, stopSession]);

  useEffect(() => {
    if (!open || status === "unsupported") return;

    const receiveMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== SCANNER_ORIGIN) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      const session = sessionRef.current;
      if (!session || session.stopped) return;
      const raw = event.data;
      if (
        typeof raw !== "object" ||
        raw === null ||
        (raw as { requestId?: unknown }).requestId !== session.requestId
      ) {
        return;
      }

      if (isLifecycleMessage(raw)) {
        if (raw.type === "LH_TRIP_SCANNER_CANCEL") {
          stopSession(session);
          onCloseRef.current();
        } else {
          triggerUnsupported(
            "Máy quét không thể sử dụng camera. Đang chuyển sang chế độ quét thường.",
          );
        }
        return;
      }

      if (!isPdaScannerMessage(raw)) return;

      if (raw.type === "PDA_HANDOVER_SCANNER_READY") {
        if (!raw.capabilities.includes(PDA_FAST_CAPABILITY)) return;
        session.ready = true;
        readyRequestIdRef.current = session.requestId;
        clearCapabilityTimer();
        setStatus("ready");
        return;
      }

      if (!session.ready) return;

      if (raw.type === "PDA_HANDOVER_SCAN") {
        if (session.validationPending || session.acceptedPdaName) return;
        session.validationPending = true;
        const requestId = session.requestId;
        const validate = async () => {
          try {
            const result = await onValidateRef.current(raw.secret);
            const current = sessionRef.current;
            if (current !== session || current.stopped || current.requestId !== requestId) {
              return;
            }

            const pdaName = result.pdaName?.trim() || "";
            if (result.accepted && pdaName) {
              current.acceptedPdaName = pdaName;
              const accepted: PdaParentMessage = {
                type: "PDA_HANDOVER_SCAN_ACCEPTED",
                requestId,
                pdaName,
              };
              postToScanner(accepted);
              return;
            }

            const candidate = result.message?.trim() || "";
            const publicMessage =
              candidate && !candidate.includes(raw.secret)
                ? candidate
                : "Mã PDA không hợp lệ. Vui lòng quét lại.";
            const rejected: PdaParentMessage = {
              type: "PDA_HANDOVER_SCAN_REJECTED",
              requestId,
              message: publicMessage,
            };
            postToScanner(rejected);
          } catch {
            const current = sessionRef.current;
            if (current === session && !current.stopped) {
              const rejected: PdaParentMessage = {
                type: "PDA_HANDOVER_SCAN_REJECTED",
                requestId,
                message: "Không thể xác thực PDA. Vui lòng quét lại.",
              };
              postToScanner(rejected);
            }
          } finally {
            if (sessionRef.current === session) session.validationPending = false;
          }
        };
        void validate();
        return;
      }

      if (raw.type !== "PDA_HANDOVER_EVIDENCE") return;
      if (!session.acceptedPdaName || raw.pdaName !== session.acceptedPdaName) return;

      try {
        onEvidenceRef.current(raw.pdaName, raw.blob);
      } catch {
        triggerUnsupported(
          "Không thể nhận ảnh từ máy quét nhanh. Đang chuyển sang camera hệ thống.",
        );
        return;
      }

      session.acceptedPdaName = null;
      const progress = progressRef.current;
      const normalizedTotal = normalizeCounter(progress.total);
      const continueMessage: PdaParentMessage = {
        type: "PDA_HANDOVER_CONTINUE",
        requestId: session.requestId,
        completed: Math.min(normalizeCounter(progress.completed), normalizedTotal),
        total: normalizedTotal,
        uploading: Math.min(2, normalizeCounter(progress.uploading) + 1),
      };
      postToScanner(continueMessage);
    };

    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [clearCapabilityTimer, open, postToScanner, status, stopSession, triggerUnsupported]);

  const handleFrameLoad = () => {
    frameLoadedRef.current = true;
    sendStart();
  };

  const handleClose = () => {
    stopSession();
    onCloseRef.current();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] min-h-dvh bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pda-fast-scanner-title"
      aria-describedby="pda-fast-scanner-status"
    >
      <h2 id="pda-fast-scanner-title" className="sr-only">
        Quét và chụp ảnh bàn giao PDA
      </h2>
      <iframe
        ref={iframeRef}
        src={SCANNER_IFRAME_SRC}
        title="Máy quét và chụp ảnh PDA"
        allow="camera; fullscreen"
        onLoad={handleFrameLoad}
        className="h-full min-h-dvh w-full border-0 bg-slate-950"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-3">
        <p
          id="pda-fast-scanner-status"
          className="pointer-events-auto rounded-full bg-slate-950/80 px-3 py-2 text-xs font-bold text-white backdrop-blur"
          role="status"
        >
          {status === "ready" ? "Máy quét nhanh đã sẵn sàng" : "Đang kết nối máy quét nhanh..."}
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-slate-950/80 text-white backdrop-blur focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Đóng máy quét PDA"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {status === "connecting" ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center gap-2 rounded-full bg-slate-950/85 px-4 py-3 text-sm font-bold text-white backdrop-blur" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang kiểm tra chế độ quét liên tục...
          </div>
        </div>
      ) : null}

      {status === "unsupported" ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-base-100 p-5 text-center shadow-2xl">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-warning/15 text-warning">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-black">Dùng chế độ quét thường</h3>
            <p className="mt-2 text-sm leading-6 text-base-content/70">
              {fallbackMessage}
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-primary mt-5 min-h-11 w-full rounded-xl"
            >
              Tiếp tục bằng máy quét thường
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
