import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

import "./scanner.css";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const statusText = document.querySelector<HTMLElement>("#status")!;
const closeButton = document.querySelector<HTMLButtonElement>("#close")!;
const switchButton = document.querySelector<HTMLButtonElement>("#switch")!;
const torchButton = document.querySelector<HTMLButtonElement>("#torch")!;
const zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in")!;
const zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out")!;
const zoomLabel = document.querySelector<HTMLElement>("#zoom-label")!;

const params = new URLSearchParams(location.search);
const requestId = params.get("requestId") || "";
const targetOrigin = params.get("targetOrigin") || "";
const formats = [
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

let facingMode: "environment" | "user" = "environment";
let controls: IScannerControls | null = null;
let stream: MediaStream | null = null;
let track: MediaStreamTrack | null = null;
let zoomMin = 1;
let zoomMax = 1;
let zoomCurrent = 1;
let torchOn = false;
let closed = false;

function stopCamera() {
  controls?.stop();
  controls = null;
  stream?.getTracks().forEach((item) => item.stop());
  stream = null;
  track = null;
  video.srcObject = null;
}

function finish(value?: string) {
  if (closed) return;
  closed = true;
  stopCamera();
  if (value && requestId && targetOrigin && window.opener) {
    window.opener.postMessage(
      { type: "LH_TRIP_SCAN_RESULT", requestId, value },
      targetOrigin,
    );
  }
  window.close();
}

function updateZoomLabel() {
  zoomLabel.textContent = `${zoomCurrent.toFixed(zoomCurrent % 1 ? 1 : 0)}x`;
  zoomOutButton.disabled = !track || zoomCurrent <= zoomMin;
  zoomInButton.disabled = !track || zoomCurrent >= zoomMax;
}

async function startCamera() {
  stopCamera();
  statusText.textContent = "Đang mở camera…";
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    track = stream.getVideoTracks()[0] || null;
    const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & {
      zoom?: { min: number; max: number; step?: number };
      torch?: boolean;
    };
    const settings = track?.getSettings?.() as MediaTrackSettings & { zoom?: number };
    if (capabilities?.zoom) {
      zoomMin = capabilities.zoom.min;
      zoomMax = capabilities.zoom.max;
      zoomCurrent = settings.zoom ?? zoomMin;
    } else {
      zoomMin = 1;
      zoomMax = 1;
      zoomCurrent = 1;
    }
    torchButton.hidden = !capabilities?.torch;
    torchOn = false;
    updateZoomLabel();

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 300,
    });
    statusText.textContent = "Đưa mã vào giữa khung";
    controls = await reader.decodeFromStream(stream, video, (result) => {
      if (!result) return;
      navigator.vibrate?.(100);
      finish(result.getText());
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    statusText.textContent = name === "NotAllowedError"
      ? "Chưa được cấp quyền camera. Hãy cho phép rồi tải lại trang."
      : "Không mở được camera. Hãy đóng ứng dụng khác đang dùng camera.";
  }
}

async function setZoom(next: number) {
  if (!track || zoomMax <= zoomMin) return;
  zoomCurrent = Math.min(Math.max(next, zoomMin), zoomMax);
  await track.applyConstraints({ advanced: [{ zoom: zoomCurrent } as MediaTrackConstraintSet] });
  updateZoomLabel();
}

closeButton.addEventListener("click", () => finish());
switchButton.addEventListener("click", () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  void startCamera();
});
zoomOutButton.addEventListener("click", () => void setZoom(zoomCurrent - 0.5));
zoomInButton.addEventListener("click", () => void setZoom(zoomCurrent + 0.5));
torchButton.addEventListener("click", async () => {
  if (!track) return;
  torchOn = !torchOn;
  await track.applyConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] });
  torchButton.textContent = torchOn ? "Tắt đèn" : "Đèn";
});
window.addEventListener("beforeunload", stopCamera);

void startCamera();
