import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, RefreshCw, X } from "lucide-react";
import QRScanner from "./QRScanner";
import { showToast } from "./Toast";
import { decodeBarcodeImage } from "../utils/barcode";
import { getCameraErrorMessage, requestCameraStream } from "../utils/camera";

export type ScanMode = "lhtrip" | "item";

interface EmbeddedQRScannerProps {
  open: boolean;
  mode: ScanMode | null;
  onScan: (value: string, mode: ScanMode) => void;
  onClose: () => void;
}

type ScannerStatus = "idle" | "starting" | "ready" | "error";

export default function EmbeddedQRScanner({
  open,
  mode,
  onScan,
  onClose,
}: EmbeddedQRScannerProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const requestGenerationRef = useRef(0);
  const handledScanRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [decodingImage, setDecodingImage] = useState(false);

  const releaseStream = useCallback(() => {
    const current = streamRef.current;
    streamRef.current = null;
    if (current) {
      current.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
  }, []);

  const stopScanner = useCallback(() => {
    requestGenerationRef.current += 1;
    handledScanRef.current = false;
    releaseStream();
    setStatus("idle");
    setErrorMessage("");
    setDecodingImage(false);
  }, [releaseStream]);

  const startScanner = useCallback(async () => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    handledScanRef.current = false;
    releaseStream();
    setStatus("starting");
    setErrorMessage("");

    // Đợi một nhịp để tránh React StrictMode mở camera hai lần trong dev.
    await Promise.resolve();
    if (requestGenerationRef.current !== generation) return;

    try {
      const nextStream = await requestCameraStream("environment");
      if (requestGenerationRef.current !== generation) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = nextStream;
      setStream(nextStream);
      setStatus("ready");
    } catch (error) {
      if (requestGenerationRef.current !== generation) return;
      releaseStream();
      setStatus("error");
      setErrorMessage(getCameraErrorMessage(error));
    }
  }, [releaseStream]);

  useEffect(() => {
    if (!open || !mode) {
      const timer = window.setTimeout(stopScanner, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      requestGenerationRef.current += 1;
      releaseStream();
    };
  }, [mode, open, releaseStream, startScanner, stopScanner]);

  const finishScan = useCallback(
    (rawValue: string) => {
      if (!open || !mode || handledScanRef.current) return;
      const value = rawValue.trim();
      if (!value) return;

      handledScanRef.current = true;
      try {
        navigator.vibrate?.(100);
      } catch {
        // Vibration is optional.
      }

      requestGenerationRef.current += 1;
      releaseStream();
      onScan(value, mode);
      onClose();
    },
    [mode, onClose, onScan, open, releaseStream],
  );

  const handleCapturedImage = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || decodingImage || !mode) return;

    setDecodingImage(true);
    try {
      const value = await decodeBarcodeImage(file);
      finishScan(value);
      showToast("Đã quét mã từ ảnh trên thiết bị.", "success");
    } catch {
      showToast(
        "Không tìm thấy mã QR/Barcode trong ảnh. Hãy chụp rõ hơn và thử lại.",
        "warning",
      );
    } finally {
      setDecodingImage(false);
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  if (!open || !mode) return null;

  return (
    <div
      className="fixed inset-0 z-[70] overflow-hidden bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Quét mã QR hoặc Barcode trực tiếp trên thiết bị"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleCapturedImage(event)}
      />

      {status === "ready" && stream ? (
        <QRScanner
          key={`${mode}-${requestGenerationRef.current}`}
          initialStream={stream}
          onScan={finishScan}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 p-5 text-white">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-5 text-center shadow-2xl backdrop-blur">
            {status === "starting" ? (
              <>
                <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-primary" />
                <h3 className="mt-4 text-lg font-black">Đang mở camera thiết bị</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  Camera được mở trực tiếp ngay trong OPS FTE, không chuyển qua website scanner khác.
                </p>
              </>
            ) : (
              <>
                <Camera className="mx-auto h-10 w-10 text-primary" />
                <h3 className="mt-4 text-lg font-black">Không mở được camera</h3>
                <p className="mt-2 break-words text-sm leading-relaxed text-white/70">
                  {errorMessage || "Camera trên thiết bị chưa sẵn sàng."}
                </p>
                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void startScanner()}
                    className="btn btn-primary min-h-11 w-full gap-2 rounded-xl font-bold"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Thử mở lại camera
                  </button>
                  <button
                    type="button"
                    disabled={decodingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="btn min-h-11 w-full gap-2 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15"
                  >
                    {decodingImage ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {decodingImage ? "Đang đọc mã..." : "Chụp ảnh để quét"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[80] flex items-start justify-between gap-2 p-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-3">
        <div className="pointer-events-auto max-w-[calc(100vw-4.5rem)] rounded-full bg-slate-950/80 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur">
          {mode === "lhtrip" ? "Quét mã LH TRIP" : "Quét mã đơn"} · QR / Barcode
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-slate-950/80 text-white shadow-lg backdrop-blur focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Đóng máy quét"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
