import type { PdaUploadStatus } from "./pdaUploadQueue";

export const PDA_SHIFTS = [
  "06:00-15:00",
  "13:00-22:00",
  "22:00-06:00",
] as const;

export type PdaShift = (typeof PDA_SHIFTS)[number];
export type PdaSessionStatus = "DRAFT" | "SUBMITTED";

export interface PdaHandoverItem {
  pdaName: string;
  scanAt: string | null;
  photoAt: string | null;
  photoUrl: string | null;
  completed: boolean;
}

export interface PdaHandoverSession {
  sessionId: string;
  handoverDate: string;
  shift: PdaShift;
  status: PdaSessionStatus;
  createdBy: string;
  createdAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  requiredCount: number;
  completedCount: number;
  items: PdaHandoverItem[];
}

export type PdaItemState = "PENDING_SCAN" | "WAITING_PHOTO" | "COMPLETED";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isPdaShift(value: string): value is PdaShift {
  return (PDA_SHIFTS as readonly string[]).includes(value);
}

export function validateHandoverDate(value: string, today: string): string {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error("Ngày bàn giao không hợp lệ.");
  }

  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Ngày bàn giao không hợp lệ.");
  }

  if (value > today) {
    throw new Error("Không thể chọn ngày bàn giao trong tương lai.");
  }

  return value;
}

export function derivePdaItemState(item: PdaHandoverItem): PdaItemState {
  if (
    item.completed &&
    item.scanAt &&
    item.photoAt &&
    item.photoUrl
  ) {
    return "COMPLETED";
  }
  return item.scanAt ? "WAITING_PHOTO" : "PENDING_SCAN";
}

export function getPdaProgress(
  items: readonly PdaHandoverItem[],
): { completed: number; total: number; canSubmit: boolean } {
  const total = items.length;
  const completed = items.reduce(
    (count, item) => count + (derivePdaItemState(item) === "COMPLETED" ? 1 : 0),
    0,
  );
  return { completed, total, canSubmit: total > 0 && completed === total };
}

export function canSubmitPdaHandover(input: {
  backendComplete: boolean;
  hasBlockingJobs: boolean;
  interactionPending: boolean;
}): boolean {
  return (
    input.backendComplete &&
    !input.hasBlockingJobs &&
    !input.interactionPending
  );
}

export function getPdaItemPriority(
  item: PdaHandoverItem,
  uploadStatus?: PdaUploadStatus,
): number {
  if (uploadStatus === "FAILED") return 0;
  if (uploadStatus === "QUEUED" || uploadStatus === "UPLOADING") return 1;
  return derivePdaItemState(item) === "COMPLETED" ? 2 : 0;
}

export function replacePdaItem(
  session: PdaHandoverSession,
  nextItem: PdaHandoverItem,
): PdaHandoverSession {
  const items = session.items.map((item) =>
    item.pdaName === nextItem.pdaName ? nextItem : item,
  );
  return {
    ...session,
    items,
    completedCount: getPdaProgress(items).completed,
  };
}
