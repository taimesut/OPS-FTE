import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, X } from "lucide-react";
import { SCANNER_URL } from "../utils/config";

export type ScanMode = "lhtrip" | "item";

interface EmbeddedQRScannerProps {
  open: boolean;
  mode: ScanMode | null;
  onScan: (value: string, mode: ScanMode) => void;
  onClose: () => void;
}

type ScannerStatus = "idle" | "starting" | "ready" | "error" | "popup";

interface ScannerMessage {
  type?: string;
  requestId?: string;
  value?: string;
  message?: string;
}

interface ScannerSession {
  requestId: string;
  mode: ScanMode;
}

const SCANNER_ORIGIN = new URL(SCANNER_URL).origin;
const IFRAME_SRC = `${SCANNER_URL}/?embedded=1`;
const READY_TIMEOUT_MS = 7000;

export default function EmbeddedQRScanner({
  open,
  mode,
  onScan,
  onClose,
}: EmbeddedQRScannerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const popupRef = useRef<Window | null>(null);
  const sessionRef = useRef<ScannerSession | null>(null);
  const frameLoadedRef = useRef(false);
  const readyTimerRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const clearReadyTimer = useCallback(() => {
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
  }, []);

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, SCANNER_ORIGIN);
  }, []);

  const stopSession = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      postToFrame({
        type: "LH_TRIP_SCANNER_STOP",
        requestId: session.requestId,
      });
    }
    clearReadyTimer();
    popupRef.current?.close();
    popupRef.current = null;
    sessionRef.current = null;
    setStatus("idle");
  }, [clearReadyTimer, postToFrame]);

  const sendStart = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !open) return;

    setStatus("starting");
    postToFrame({
      type: "LH_TRIP_SCANNER_START",
      requestId: session.requestId,
      targetOrigin: window.location.origin,
      mode: session.mode,
    });

    clearReadyTimer();
    readyTimerRef.current = window.setTimeout(() => {
      if (sessionRef.current?.requestId !== session.requestId) return;
      setStatus("error");
      setErrorMessage("Không thể mở camera trong khung nhúng.");
    }, READY_TIMEOUT_MS);
  }, [clearReadyTimer, open, postToFrame]);

  const startSession = useCallback((nextMode: ScanMode) => {
    stopSession();
    const session = {
      requestId: crypto.randomUUID(),
      mode: nextMode,
    } satisfies ScannerSession;
    sessionRef.current = session;
    setErrorMessage("");
    setStatus("starting");
    if (frameLoadedRef.current) sendStart();
  }, [sendStart, stopSession]);

  useEffect(() => {
    if (open && mode) {
      const timer = window.setTimeout(() => startSession(mode), 0);
      return () => window.clearTimeout(timer);
    }
    frameLoadedRef.current = false;
    const timer = window.setTimeout(stopSession, 0);
    return () => window.clearTimeout(timer);
  }, [mode, open, startSession, stopSession]);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<ScannerMessage>) => {
      if (event.origin !== SCANNER_ORIGIN) return;

      const session = sessionRef.current;
      if (!session || event.data?.requestId !== session.requestId) return;

      const iframeWindow = iframeRef.current?.contentWindow;
      const isIframeMessage = event.source === iframeWindow;
      const isPopupMessage = event.source === popupRef.current;
      if (!isIframeMessage && !isPopupMessage) return;

      if (event.data.type === "LH_TRIP_SCANNER_READY") {
        clearReadyTimer();
        setStatus("ready");
        return;
      }

      if (event.data.type === "LH_TRIP_SCANNER_ERROR") {
        clearReadyTimer();
        setStatus("error");
        setErrorMessage(event.data.message || "Không thể mở camera.");
        return;
      }

      if (event.data.type === "LH_TRIP_SCANNER_CANCEL") {
        stopSession();
        onCloseRef.current();
        return;
      }

      if (event.data.type !== "LH_TRIP_SCAN_RESULT" || typeof event.data.value !== "string") {
        return;
      }

      const value = event.data.value.trim();
      if (!value) return;
      const currentMode = session.mode;
      stopSession();
      onScanRef.current(value, currentMode);
      onCloseRef.current();
    };

    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [clearReadyTimer, stopSession]);

  const handleFrameLoad = () => {
    frameLoadedRef.current = true;
    if (sessionRef.current && open) sendStart();
  };

  const openPopupFallback = () => {
    const session = sessionRef.current;
    if (!session) return;

    const url = new URL(SCANNER_URL);
    url.searchParams.set("embedded", "0");
    url.searchParams.set("requestId", session.requestId);
    url.searchParams.set("targetOrigin", window.location.origin);
    const popup = window.open(
      url.toString(),
      `lh-trip-scanner-${session.requestId}`,
      "popup,width=480,height=720",
    );

    if (!popup) {
      setErrorMessage("Trình duyệt đã chặn cửa sổ Scanner. Hãy cho phép popup.");
      return;
    }

    popupRef.current = popup;
    setStatus("popup");
  };

  const handleClose = () => {
    stopSession();
    onCloseRef.current();
  };

  if (!open || !mode) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label="Quét mã QR trực tiếp"
    >
      <iframe
        ref={iframeRef}
        src={IFRAME_SRC}
        title="Live QR scanner"
        allow="camera; fullscreen"
        onLoad={handleFrameLoad}
        className="h-full w-full border-0 bg-slate-950"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:p-3">
        <div className="pointer-events-auto min-w-0 max-w-[calc(100vw-4.5rem)] break-safe rounded-full bg-slate-950/80 px-3 py-2 text-xs font-bold text-white backdrop-blur">
          {status === "ready" ? "Đưa mã vào giữa khung" : "Đang kết nối camera..."}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-slate-950/80 text-white backdrop-blur focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Đóng máy quét"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {(status === "starting" || status === "error" || status === "popup") && (
        <div className="absolute inset-x-2 bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-3">
          <div className="mx-auto min-w-0 max-w-md rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur">
            {status === "starting" && (
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Đang mở camera live...
              </div>
            )}
            {(status === "error" || status === "popup") && (
              <>
                <p className="break-safe text-sm font-semibold">{errorMessage || "Camera trong iframe chưa sẵn sàng."}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={openPopupFallback}
                    className="btn btn-primary min-h-11 flex-1 gap-2 rounded-xl font-bold"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Mở cửa sổ quét
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="btn btn-ghost min-h-11 flex-1 rounded-xl text-white"
                  >
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
