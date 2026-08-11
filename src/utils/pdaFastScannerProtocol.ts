export const PDA_FAST_CAPABILITY = "pda-handover-v1";
export const PDA_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;

export type PdaFastScannerState =
  | { phase: "IDLE" }
  | { phase: "SCANNING" }
  | { phase: "VALIDATING" }
  | { phase: "CAPTURE_READY"; pdaName: string }
  | { phase: "CAPTURING"; pdaName: string }
  | { phase: "WAITING_CONTINUE"; pdaName: string }
  | { phase: "STOPPED" };

export type PdaFastScannerEvent =
  | { type: "START" }
  | { type: "SCAN" }
  | { type: "ACCEPT"; pdaName: string }
  | { type: "REJECT" }
  | { type: "CAPTURE" }
  | { type: "EVIDENCE_SENT" }
  | { type: "CONTINUE" }
  | { type: "STOP" };

export type PdaScannerMessage =
  | {
      type: "PDA_HANDOVER_SCANNER_READY";
      requestId: string;
      capabilities: [typeof PDA_FAST_CAPABILITY];
    }
  | {
      type: "PDA_HANDOVER_SCAN";
      requestId: string;
      secret: string;
    }
  | {
      type: "PDA_HANDOVER_EVIDENCE";
      requestId: string;
      pdaName: string;
      blob: Blob;
    };

export type PdaParentMessage =
  | {
      type: "PDA_HANDOVER_SCAN_ACCEPTED";
      requestId: string;
      pdaName: string;
    }
  | {
      type: "PDA_HANDOVER_SCAN_REJECTED";
      requestId: string;
      message: string;
    }
  | {
      type: "PDA_HANDOVER_CONTINUE";
      requestId: string;
      completed: number;
      total: number;
      uploading: number;
    }
  | {
      type: "PDA_HANDOVER_STOP";
      requestId: string;
    };

export function reducePdaFastScannerState(
  state: PdaFastScannerState,
  event: PdaFastScannerEvent,
): PdaFastScannerState {
  if (event.type === "STOP" && state.phase !== "IDLE" && state.phase !== "STOPPED") {
    return { phase: "STOPPED" };
  }

  switch (state.phase) {
    case "IDLE":
      return event.type === "START" ? { phase: "SCANNING" } : state;
    case "SCANNING":
      return event.type === "SCAN" ? { phase: "VALIDATING" } : state;
    case "VALIDATING":
      if (event.type === "REJECT") return { phase: "SCANNING" };
      if (event.type === "ACCEPT" && isNonEmptyString(event.pdaName)) {
        return { phase: "CAPTURE_READY", pdaName: event.pdaName };
      }
      return state;
    case "CAPTURE_READY":
      return event.type === "CAPTURE"
        ? { phase: "CAPTURING", pdaName: state.pdaName }
        : state;
    case "CAPTURING":
      return event.type === "EVIDENCE_SENT"
        ? { phase: "WAITING_CONTINUE", pdaName: state.pdaName }
        : state;
    case "WAITING_CONTINUE":
      return event.type === "CONTINUE" ? { phase: "SCANNING" } : state;
    case "STOPPED":
      return state;
  }
}

export function getEvidenceDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxEdge) ||
    width <= 0 ||
    height <= 0 ||
    maxEdge <= 0
  ) {
    throw new Error("Kích thước ảnh không hợp lệ.");
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function hasRequestId(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.requestId);
}

export function isPdaParentMessage(value: unknown): value is PdaParentMessage {
  if (!isRecord(value) || !hasRequestId(value)) return false;

  switch (value.type) {
    case "PDA_HANDOVER_SCAN_ACCEPTED":
      return (
        hasExactKeys(value, ["type", "requestId", "pdaName"]) &&
        isNonEmptyString(value.pdaName)
      );
    case "PDA_HANDOVER_SCAN_REJECTED":
      return (
        hasExactKeys(value, ["type", "requestId", "message"]) &&
        isNonEmptyString(value.message)
      );
    case "PDA_HANDOVER_CONTINUE":
      return (
        hasExactKeys(value, [
          "type",
          "requestId",
          "completed",
          "total",
          "uploading",
        ]) &&
        isNonNegativeInteger(value.completed) &&
        isNonNegativeInteger(value.total) &&
        value.completed <= value.total &&
        isNonNegativeInteger(value.uploading)
      );
    case "PDA_HANDOVER_STOP":
      return hasExactKeys(value, ["type", "requestId"]);
    default:
      return false;
  }
}

export function isPdaScannerMessage(value: unknown): value is PdaScannerMessage {
  if (!isRecord(value) || !hasRequestId(value)) return false;

  switch (value.type) {
    case "PDA_HANDOVER_SCANNER_READY":
      return (
        hasExactKeys(value, ["type", "requestId", "capabilities"]) &&
        Array.isArray(value.capabilities) &&
        value.capabilities.length === 1 &&
        value.capabilities[0] === PDA_FAST_CAPABILITY
      );
    case "PDA_HANDOVER_SCAN":
      return (
        hasExactKeys(value, ["type", "requestId", "secret"]) &&
        isNonEmptyString(value.secret)
      );
    case "PDA_HANDOVER_EVIDENCE":
      return (
        hasExactKeys(value, ["type", "requestId", "pdaName", "blob"]) &&
        isNonEmptyString(value.pdaName) &&
        value.blob instanceof Blob &&
        value.blob.type === "image/jpeg" &&
        value.blob.size > 0 &&
        value.blob.size <= PDA_EVIDENCE_MAX_BYTES
      );
    default:
      return false;
  }
}
