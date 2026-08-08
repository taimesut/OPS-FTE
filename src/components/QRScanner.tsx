/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Zap, ZapOff, SwitchCamera, AlertTriangle, RefreshCw, Camera } from "lucide-react";
import { showToast } from "./Toast";
import {
  getCameraErrorMessage,
  requestCameraStream,
  type CameraFacingMode,
} from "../utils/camera";

interface Props {
  onScan: (value: string) => void;
  initialStream: MediaStream;
}

const SUPPORTED_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.ITF,
];

export default function QRScanner({ onScan, initialStream }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onScanRef = useRef(onScan);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Camera Capabilities State
  const [streamTrack, setStreamTrack] = useState<MediaStreamTrack | null>(null);
  const [zoomCapable, setZoomCapable] = useState(false);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const [currentZoom, setCurrentZoom] = useState(1);

  const [torchCapable, setTorchCapable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [reloadKey, setReloadKey] = useState(0);
  const initialStreamConsumedRef = useRef(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let isActive = true;
    let controls: IScannerControls | null = null;
    let activeStream: MediaStream | null = null;
    const videoElement = videoRef.current;

    const startLiveScanner = async () => {
      try {
        // Strict Mode runs an effect setup/cleanup cycle before the real setup.
        // Yield once so the discarded setup can be cancelled before requesting
        // camera permission or opening a second, short-lived camera stream.
        await Promise.resolve();
        if (!isActive) return;

        setCameraError(null);
        setStreamTrack(null);
        setZoomCapable(false);
        setTorchCapable(false);
        setTorchOn(false);

        // The first stream is requested directly by the user's button click.
        // Retries and camera switching can request a replacement after permission exists.
        const stream = !initialStreamConsumedRef.current
          ? initialStream
          : await requestCameraStream(facingMode);
        initialStreamConsumedRef.current = true;

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        activeStream = stream;

        // Gắn luồng Live Stream vào thẻ Video
        if (videoElement) {
          videoElement.srcObject = stream;
          await videoElement.play().catch(() => {});
        }

        // Lấy Track để điều khiển Zoom & Torch
        const track = stream.getVideoTracks()[0];
        if (track) {
          setStreamTrack(track);
          const capabilities: any = track.getCapabilities?.() || {};

          if (capabilities.zoom) {
            setZoomCapable(true);
            setMinZoom(capabilities.zoom.min || 1);
            setMaxZoom(capabilities.zoom.max || 5);
            const settings: any = track.getSettings?.() || {};
            setCurrentZoom(settings.zoom || 1);
          }

          if (capabilities.torch) {
            setTorchCapable(true);
          }
        }

        // 2. Khởi tạo ZXing Reader quét Live liên tục từ Stream Camera
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        let lastScanned = "";

        controls = await reader.decodeFromStream(
          stream,
          videoElement!,
          (result) => {
            if (result && isActive) {
              const text = result.getText();
              if (text && text !== lastScanned) {
                lastScanned = text;
                try {
                  navigator.vibrate?.(100);
                } catch {
                  // Ignore
                }
                onScanRef.current(text);

                // Reset lastScanned after 2s to allow re-scanning same code if needed
                setTimeout(() => {
                  lastScanned = "";
                }, 2000);
              }
            }
          }
        );
      } catch (err: any) {
        console.error("Lỗi mở Live Stream Camera:", err);
        if (!isActive) return;

        setCameraError(getCameraErrorMessage(err));
      }
    };

    startLiveScanner();

    return () => {
      isActive = false;
      if (controls) {
        try {
          controls.stop();
        } catch {
          // Ignore
        }
      }
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [facingMode, initialStream, reloadKey]);

  // Xử lý đọc ảnh chụp mã thủ công (Dự phòng)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      const img = new Image();
      img.src = imgUrl;
      img.onload = async () => {
        try {
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const reader = new BrowserMultiFormatReader(hints);
          const result = await reader.decodeFromImageElement(img);

          if (result) {
            try {
              navigator.vibrate?.(100);
            } catch {
              // Ignore
            }
            onScan(result.getText());
            showToast("Đã quét mã thành công!", "success");
          }
        } catch {
          showToast("Không tìm thấy mã QR/Barcode trong ảnh!", "warning");
        }
      };
    };
    fileReader.readAsDataURL(file);
  };

  // Zoom control handler
  const handleZoomChange = async (newZoom: number) => {
    const effectiveMin = zoomCapable ? minZoom : 1;
    const effectiveMax = zoomCapable ? maxZoom : 4;
    const clampedZoom = Math.min(Math.max(newZoom, effectiveMin), effectiveMax);
    if (!streamTrack || !zoomCapable) {
      setCurrentZoom(clampedZoom);
      return;
    }
    try {
      await streamTrack.applyConstraints({
        advanced: [{ zoom: clampedZoom } as any],
      });
      setCurrentZoom(clampedZoom);
    } catch (err) {
      console.error("Lỗi áp dụng Zoom camera:", err);
    }
  };

  // Torch control handler
  const handleToggleTorch = async () => {
    if (!streamTrack || !torchCapable) return;
    const nextState = !torchOn;
    try {
      await streamTrack.applyConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.error("Lỗi bật/tắt đèn Flash:", err);
    }
  };

  // Toggle Camera Front/Back
  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col justify-between">
      {/* Hidden Native Mobile Camera Input (Backup) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Video Stream Container */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transition-transform duration-200"
        style={{ transform: zoomCapable ? undefined : `scale(${currentZoom})` }}
      />

      {/* Error Overlay Fallback */}
      {cameraError && (
        <div className="absolute inset-0 z-30 bg-black/95 p-6 flex flex-col items-center justify-center text-center text-white space-y-4">
          <div className="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center text-error">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-error">Lỗi Bật Live Camera</h3>
          <p className="text-xs text-white/70 max-w-xs leading-relaxed">
            {cameraError}
          </p>

          <div className="flex flex-col gap-2.5 w-full max-w-xs pt-2">
            <button
              type="button"
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="btn btn-primary gap-2 rounded-xl"
            >
              <RefreshCw className="w-4 h-4" />
              Bật Lại Camera Trực Tiếp
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-outline btn-ghost text-white gap-2 rounded-xl border-white/20"
            >
              <Camera className="w-4 h-4" />
              Dùng Camera Chụp Ảnh
            </button>
          </div>
        </div>
      )}

      {/* Target Laser Overlay Guide */}
      {!cameraError && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
          <div className="relative h-[min(52vw,16rem)] w-[min(84vw,22rem)] overflow-hidden rounded-3xl border-2 border-primary/80 shadow-2xl flex items-center justify-center md:h-72 md:w-72">
            {/* Corner Markers */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl"></div>

            {/* Animated Scanning Laser */}
            <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_#ff0000] animate-pulse"></div>
          </div>
          <span className="text-white/80 text-xs font-semibold mt-4 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-xs">
            Quét Live: Đưa mã QR/Barcode vào khung ngắm
          </span>
        </div>
      )}

      {/* Camera Controls Overlay Bar */}
      {!cameraError && (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-col items-center gap-3">
          {/* Zoom Quick Selector Buttons */}
          <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/70 p-2 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => handleZoomChange(currentZoom - 0.5)}
              disabled={currentZoom <= (zoomCapable ? minZoom : 1)}
              className="btn btn-sm btn-circle min-h-10 min-w-10 btn-ghost text-white disabled:opacity-30"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            {/* Preset Zoom Chips */}
            {[1, 2, 3, 4].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => handleZoomChange(level)}
              className={`btn btn-sm min-h-10 min-w-10 rounded-xl px-2.5 font-mono text-xs ${
                  Math.round(currentZoom) === level
                    ? "btn-primary font-bold shadow-xs"
                    : "btn-ghost text-white/80"
                }`}
              >
                {level}x
              </button>
            ))}

            <button
              type="button"
              onClick={() => handleZoomChange(currentZoom + 0.5)}
              disabled={currentZoom >= (zoomCapable ? maxZoom : 4)}
              className="btn btn-sm btn-circle min-h-10 min-w-10 btn-ghost text-white disabled:opacity-30"
              title="Phóng to"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Auxiliary Controls (Flash & Switch Camera) */}
          <div className="flex items-center gap-3">
            {torchCapable && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`btn btn-circle min-h-11 min-w-11 shadow-lg ${
                  torchOn ? "btn-warning" : "btn-neutral text-white"
                }`}
                title={torchOn ? "Tắt đèn Flash" : "Bật đèn Flash"}
              >
                {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleCamera}
            className="btn btn-circle min-h-11 min-w-11 btn-neutral text-white shadow-lg"
              title="Đổi camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
