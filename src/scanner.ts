import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

import {
  getEvidenceDimensions,
  isPdaParentMessage,
  PDA_EVIDENCE_MAX_BYTES,
  PDA_FAST_CAPABILITY,
  reducePdaFastScannerState,
  type PdaFastScannerEvent,
  type PdaFastScannerState,
} from "./utils/pdaFastScannerProtocol";
import "./scanner.css";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const statusText = document.querySelector<HTMLElement>("#status")!;
const closeButton = document.querySelector<HTMLButtonElement>("#close")!;
const switchButton = document.querySelector<HTMLButtonElement>("#switch")!;
const torchButton = document.querySelector<HTMLButtonElement>("#torch")!;
const zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in")!;
const zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out")!;
const zoomLabel = document.querySelector<HTMLElement>("#zoom-label")!;
const pdaHud = document.querySelector<HTMLElement>("#pda-hud")!;
const pdaProgress = document.querySelector<HTMLElement>("#pda-progress")!;
const pdaUploading = document.querySelector<HTMLElement>("#pda-uploading")!;
const pdaPanel = document.querySelector<HTMLElement>("#pda-panel")!;
const pdaPhase = document.querySelector<HTMLElement>("#pda-phase")!;
const pdaName = document.querySelector<HTMLElement>("#pda-name")!;
const captureButton = document.querySelector<HTMLButtonElement>("#pda-capture")!;
const fallbackButton = document.querySelector<HTMLButtonElement>("#pda-fallback")!;
const captureFlash = document.querySelector<HTMLElement>("#capture-flash")!;

const params = new URLSearchParams(location.search);
const embeddedMode = params.get("embedded") === "1";
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

type ScannerWorkflow = "scan-only" | "pda-handover";

interface ScannerSession {
  requestId: string;
  targetOrigin: string;
  workflow: ScannerWorkflow;
}

interface StartMessage {
  type?: string;
  requestId?: string;
  targetOrigin?: string;
  workflow?: string;
  completed?: unknown;
  total?: unknown;
  uploading?: unknown;
}

let session: ScannerSession | null = null;
let controls: IScannerControls | null = null;
let stream: MediaStream | null = null;
let track: MediaStreamTrack | null = null;
let facingMode: "environment" | "user" = "environment";
let zoomMin = 1;
let zoomMax = 1;
let zoomCurrent = 1;
let torchOn = false;
let active = false;
let generation = 0;
let pdaState: PdaFastScannerState = { phase: "IDLE" };
let pdaCompleted = 0;
let pdaTotal = 0;
let pdaUploadingCount = 0;
let captureFailed = false;
let rejectTimer: number | null = null;
let flashTimer: number | null = null;

function normalizeOrigin(value: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function getMessageTarget() {
  if (embeddedMode) return window.parent;
  return window.opener;
}

function postMessage(type: string, extra: Record<string, unknown> = {}) {
  const target = getMessageTarget();
  if (!target || !session) return;
  target.postMessage(
    { type, requestId: session.requestId, ...extra },
    session.targetOrigin,
  );
}

function isPdaWorkflow() {
  return session?.workflow === "pda-handover";
}

function clearWorkflowTimers() {
  if (rejectTimer !== null) window.clearTimeout(rejectTimer);
  if (flashTimer !== null) window.clearTimeout(flashTimer);
  rejectTimer = null;
  flashTimer = null;
}

function setPdaState(event: PdaFastScannerEvent) {
  pdaState = reducePdaFastScannerState(pdaState, event);
  renderPdaUi();
}

function renderPdaUi(temporaryMessage?: string) {
  const enabled = isPdaWorkflow();
  document.body.classList.toggle("pda-workflow", enabled);
  pdaHud.hidden = !enabled;
  pdaPanel.hidden = !enabled || pdaState.phase === "SCANNING" || pdaState.phase === "IDLE";
  pdaProgress.textContent = `${pdaCompleted}/${pdaTotal || "—"} hoàn tất`;
  pdaUploading.textContent = `${pdaUploadingCount} đang tải`;
  captureButton.hidden = !enabled || pdaState.phase !== "CAPTURE_READY";
  fallbackButton.hidden = !enabled || !captureFailed;
  switchButton.disabled = enabled && pdaState.phase !== "SCANNING";

  const acceptedName = "pdaName" in pdaState ? pdaState.pdaName : "";
  pdaName.textContent = acceptedName;
  captureButton.textContent = acceptedName ? `Chụp ảnh ${acceptedName}` : "Chụp ảnh PDA";

  if (!enabled) return;
  if (temporaryMessage) {
    pdaPhase.textContent = temporaryMessage;
    statusText.textContent = temporaryMessage;
    return;
  }

  switch (pdaState.phase) {
    case "IDLE":
      pdaPhase.textContent = "Đang chuẩn bị";
      break;
    case "SCANNING":
      statusText.textContent = "Đưa mã QR PDA vào giữa khung";
      pdaPhase.textContent = "Sẵn sàng quét PDA tiếp theo";
      break;
    case "VALIDATING":
      statusText.textContent = "Đang kiểm tra PDA...";
      pdaPhase.textContent = "Giữ nguyên camera trong giây lát";
      break;
    case "CAPTURE_READY":
      statusText.textContent = `Đã xác thực ${pdaState.pdaName}`;
      pdaPhase.textContent = "Chụp rõ thân máy và nhãn nhận diện";
      break;
    case "CAPTURING":
      statusText.textContent = `Đang tạo ảnh ${pdaState.pdaName}...`;
      pdaPhase.textContent = "Đang nén ảnh bằng chứng";
      break;
    case "WAITING_CONTINUE":
      statusText.textContent = `Đã xếp tải ${pdaState.pdaName}`;
      pdaPhase.textContent = "Chuẩn bị quét máy tiếp theo";
      break;
    case "STOPPED":
      pdaPhase.textContent = "Đã dừng máy quét";
      break;
  }
}

function stopCamera() {
  controls?.stop();
  controls = null;
  stream?.getTracks().forEach((item) => item.stop());
  stream = null;
  track = null;
  video.srcObject = null;
  torchOn = false;
  torchButton.hidden = true;
  updateZoomLabel();
}

function stopActiveSession() {
  active = false;
  generation += 1;
  clearWorkflowTimers();
  if (isPdaWorkflow()) setPdaState({ type: "STOP" });
  stopCamera();
}

function closeWindowIfPopup() {
  if (!embeddedMode) window.close();
}

function cancelSession() {
  if (!session) {
    closeWindowIfPopup();
    return;
  }
  stopActiveSession();
  postMessage("LH_TRIP_SCANNER_CANCEL");
  closeWindowIfPopup();
}

function finish(value?: string) {
  if (!active || !session || isPdaWorkflow()) return;
  active = false;
  generation += 1;
  stopCamera();
  if (value?.trim()) postMessage("LH_TRIP_SCAN_RESULT", { value: value.trim() });
  closeWindowIfPopup();
}

function updateZoomLabel() {
  zoomLabel.textContent = `${zoomCurrent.toFixed(zoomCurrent % 1 ? 1 : 0)}x`;
  zoomOutButton.disabled = !track || zoomCurrent <= zoomMin;
  zoomInButton.disabled = !track || zoomCurrent >= zoomMax;
}

function readProgress(value: unknown, fallback: number) {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fallback;
}

function handleDecodedValue(value: string, currentGeneration: number) {
  if (!active || currentGeneration !== generation) return;
  if (!isPdaWorkflow()) {
    navigator.vibrate?.(100);
    finish(value);
    return;
  }
  if (pdaState.phase !== "SCANNING") return;

  const secret = value.trim();
  if (!secret) return;
  setPdaState({ type: "SCAN" });
  postMessage("PDA_HANDOVER_SCAN", { secret });
}

async function startCamera() {
  if (!session) {
    statusText.textContent = "Đang chờ kết nối với ứng dụng...";
    return;
  }

  const currentGeneration = ++generation;
  active = true;
  stopCamera();
  statusText.textContent = "Đang mở camera...";
  renderPdaUi();

  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    if (!active || currentGeneration !== generation) {
      nextStream.getTracks().forEach((item) => item.stop());
      return;
    }

    stream = nextStream;
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
    updateZoomLabel();

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 300,
    });
    statusText.textContent = isPdaWorkflow()
      ? "Đưa mã QR PDA vào giữa khung"
      : "Đưa mã vào giữa khung";
    controls = await reader.decodeFromStream(stream, video, (result) => {
      if (!result) return;
      handleDecodedValue(result.getText(), currentGeneration);
    });

    if (active && currentGeneration === generation) {
      if (isPdaWorkflow()) {
        postMessage("PDA_HANDOVER_SCANNER_READY", {
          capabilities: [PDA_FAST_CAPABILITY],
        });
      } else {
        postMessage("LH_TRIP_SCANNER_READY");
      }
    }
  } catch (error) {
    if (!active || currentGeneration !== generation) return;
    stopCamera();
    const name = (error as { name?: string }).name;
    const message = name === "NotAllowedError"
      ? "Chưa được cấp quyền camera. Hãy cho phép camera rồi thử lại."
      : "Không mở được camera. Hãy đóng ứng dụng khác đang dùng camera.";
    statusText.textContent = message;
    postMessage("LH_TRIP_SCANNER_ERROR", { message });
  }
}

async function setZoom(next: number) {
  if (!track || zoomMax <= zoomMin) return;
  zoomCurrent = Math.min(Math.max(next, zoomMin), zoomMax);
  await track.applyConstraints({ advanced: [{ zoom: zoomCurrent } as MediaTrackConstraintSet] });
  updateZoomLabel();
}

function canvasToJpeg(maxEdge: number, quality: number): Promise<Blob | null> {
  const dimensions = getEvidenceDimensions(video.videoWidth, video.videoHeight, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, dimensions.width, dimensions.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function isCapturingPda(expectedPdaName: string) {
  return pdaState.phase === "CAPTURING" && pdaState.pdaName === expectedPdaName;
}

function showCaptureFlash() {
  captureFlash.hidden = false;
  if (flashTimer !== null) window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    captureFlash.hidden = true;
    flashTimer = null;
  }, 180);
}

async function capturePdaEvidence() {
  if (!active || !isPdaWorkflow() || pdaState.phase !== "CAPTURE_READY") return;
  const acceptedPdaName = pdaState.pdaName;
  captureFailed = false;
  setPdaState({ type: "CAPTURE" });

  try {
    let blob = await canvasToJpeg(1280, 0.65);
    if (blob && blob.size > 1.5 * 1024 * 1024) {
      blob = await canvasToJpeg(1024, 0.5);
    }
    if (
      !blob ||
      blob.type !== "image/jpeg" ||
      blob.size <= 0 ||
      blob.size > PDA_EVIDENCE_MAX_BYTES
    ) {
      throw new Error("Không thể tạo ảnh JPEG phù hợp.");
    }
    if (!isCapturingPda(acceptedPdaName)) return;

    setPdaState({ type: "EVIDENCE_SENT" });
    showCaptureFlash();
    navigator.vibrate?.(80);
    postMessage("PDA_HANDOVER_EVIDENCE", {
      pdaName: acceptedPdaName,
      blob,
    });
    blob = null;
  } catch {
    if (!active || !isCapturingPda(acceptedPdaName)) return;
    captureFailed = true;
    renderPdaUi("Không thể chụp ảnh trực tiếp. Hãy dùng camera hệ thống.");
  }
}

function requestCameraFallback() {
  if (!session || !isPdaWorkflow()) return;
  const message = "Không thể chụp ảnh trực tiếp. Hãy dùng camera hệ thống.";
  postMessage("LH_TRIP_SCANNER_ERROR", { message, fallback: "camera" });
  stopActiveSession();
}

function handlePdaParentMessage(data: unknown) {
  if (!session || !isPdaWorkflow() || !isPdaParentMessage(data)) return;
  if (data.requestId !== session.requestId) return;

  if (data.type === "PDA_HANDOVER_STOP") {
    stopActiveSession();
    statusText.textContent = "Đang chờ kết nối với ứng dụng...";
    return;
  }

  if (data.type === "PDA_HANDOVER_SCAN_ACCEPTED") {
    if (pdaState.phase !== "VALIDATING") return;
    captureFailed = false;
    setPdaState({ type: "ACCEPT", pdaName: data.pdaName });
    return;
  }

  if (data.type === "PDA_HANDOVER_SCAN_REJECTED") {
    if (pdaState.phase !== "VALIDATING") return;
    const requestId = session.requestId;
    renderPdaUi(data.message);
    if (rejectTimer !== null) window.clearTimeout(rejectTimer);
    rejectTimer = window.setTimeout(() => {
      rejectTimer = null;
      if (!active || session?.requestId !== requestId || pdaState.phase !== "VALIDATING") return;
      setPdaState({ type: "REJECT" });
    }, 1100);
    return;
  }

  if (data.type === "PDA_HANDOVER_CONTINUE") {
    if (pdaState.phase === "IDLE" || pdaState.phase === "STOPPED") return;
    pdaCompleted = data.completed;
    pdaTotal = data.total;
    pdaUploadingCount = data.uploading;
    if (pdaState.phase === "WAITING_CONTINUE") {
      captureFailed = false;
      setPdaState({ type: "CONTINUE" });
    } else {
      renderPdaUi();
    }
  }
}

function startSession(data: StartMessage, eventOrigin: string) {
  const targetOrigin = normalizeOrigin(data.targetOrigin ?? null);
  if (!targetOrigin || eventOrigin !== targetOrigin || !data.requestId?.trim()) return;

  clearWorkflowTimers();
  session = {
    requestId: data.requestId,
    targetOrigin,
    workflow: data.workflow === "pda-handover" ? "pda-handover" : "scan-only",
  };
  pdaCompleted = readProgress(data.completed, 0);
  pdaTotal = readProgress(data.total, 0);
  pdaUploadingCount = readProgress(data.uploading, 0);
  captureFailed = false;
  pdaState = { phase: "IDLE" };
  if (isPdaWorkflow()) setPdaState({ type: "START" });
  else renderPdaUi();
  void startCamera();
}

function handleParentMessage(event: MessageEvent) {
  const expectedSource = getMessageTarget();
  if (!expectedSource || event.source !== expectedSource) return;

  const data = event.data as StartMessage;
  if (embeddedMode && data?.type === "LH_TRIP_SCANNER_START") {
    startSession(data, event.origin);
    return;
  }

  if (
    !session ||
    event.origin !== session.targetOrigin ||
    data?.requestId !== session.requestId
  ) {
    return;
  }

  if (data.type === "LH_TRIP_SCANNER_STOP") {
    stopActiveSession();
    statusText.textContent = "Đang chờ kết nối với ứng dụng...";
    return;
  }

  handlePdaParentMessage(event.data);
}

const initialRequestId = params.get("requestId") || "";
const initialTargetOrigin = normalizeOrigin(params.get("targetOrigin"));
if (!embeddedMode && initialRequestId && initialTargetOrigin) {
  const workflow = params.get("workflow") === "pda-handover"
    ? "pda-handover"
    : "scan-only";
  session = { requestId: initialRequestId, targetOrigin: initialTargetOrigin, workflow };
  pdaCompleted = readProgress(Number(params.get("completed")), 0);
  pdaTotal = readProgress(Number(params.get("total")), 0);
  pdaUploadingCount = readProgress(Number(params.get("uploading")), 0);
  if (workflow === "pda-handover") setPdaState({ type: "START" });
  void startCamera();
}

closeButton.addEventListener("click", cancelSession);
captureButton.addEventListener("click", () => void capturePdaEvidence());
fallbackButton.addEventListener("click", requestCameraFallback);
switchButton.addEventListener("click", () => {
  if (isPdaWorkflow() && pdaState.phase !== "SCANNING") return;
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
window.addEventListener("message", handleParentMessage);
window.addEventListener("beforeunload", stopCamera);

if (embeddedMode) {
  statusText.textContent = "Đang chờ kết nối với ứng dụng...";
}
