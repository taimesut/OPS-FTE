import assert from "node:assert/strict";
import test from "node:test";
import {
  canSubmitPdaHandover,
  derivePdaItemState,
  getPdaItemPriority,
  getPdaProgress,
  isPdaShift,
  PDA_SHIFTS,
  replacePdaItem,
  validateHandoverDate,
  type PdaHandoverItem,
  type PdaHandoverSession,
} from "../src/utils/pdaHandover.ts";
import { getGasErrorMessage } from "../src/utils/pdaHandoverApi.ts";

function item(
  pdaName: string,
  values: Partial<PdaHandoverItem> = {},
): PdaHandoverItem {
  return {
    pdaName,
    scanAt: null,
    photoAt: null,
    photoUrl: null,
    completed: false,
    ...values,
  };
}

function completedItem(pdaName: string): PdaHandoverItem {
  return item(pdaName, {
    scanAt: "2026-08-11T01:00:00.000Z",
    photoAt: "2026-08-11T01:01:00.000Z",
    photoUrl: "https://drive.google.com/file/d/example/view",
    completed: true,
  });
}

test("accepts exactly the three fixed PDA handover shifts", () => {
  assert.deepEqual(PDA_SHIFTS, [
    "06:00-15:00",
    "13:00-22:00",
    "22:00-06:00",
  ]);
  for (const shift of PDA_SHIFTS) assert.equal(isPdaShift(shift), true);
  assert.equal(isPdaShift("09:00-18:00"), false);
  assert.equal(isPdaShift(""), false);
});

test("validates handover dates without locale parsing", () => {
  assert.equal(validateHandoverDate("2026-08-11", "2026-08-11"), "2026-08-11");
  assert.equal(validateHandoverDate("2026-08-10", "2026-08-11"), "2026-08-10");

  for (const invalid of ["", "11/08/2026", "2026-8-11", "2026-02-30"]) {
    assert.throws(
      () => validateHandoverDate(invalid, "2026-08-11"),
      /không hợp lệ/i,
    );
  }
});

test("rejects a future handover date", () => {
  assert.throws(
    () => validateHandoverDate("2026-08-12", "2026-08-11"),
    /tương lai/,
  );
});

test("derives all PDA item states from persisted evidence", () => {
  assert.equal(derivePdaItemState(item("PDA01")), "PENDING_SCAN");
  assert.equal(
    derivePdaItemState(item("PDA01", { scanAt: "2026-08-11T01:00:00.000Z" })),
    "WAITING_PHOTO",
  );
  assert.equal(derivePdaItemState(completedItem("PDA01")), "COMPLETED");
  assert.equal(
    derivePdaItemState(item("PDA01", { completed: true, scanAt: "time" })),
    "WAITING_PHOTO",
  );
});

test("only enables submit when every required PDA is completed", () => {
  assert.deepEqual(getPdaProgress([]), {
    completed: 0,
    total: 0,
    canSubmit: false,
  });
  assert.deepEqual(getPdaProgress([completedItem("PDA01"), item("PDA02")]), {
    completed: 1,
    total: 2,
    canSubmit: false,
  });
  assert.deepEqual(getPdaProgress([completedItem("PDA01")]), {
    completed: 1,
    total: 1,
    canSubmit: true,
  });
});

test("immutably replaces one PDA item and recomputes the progress", () => {
  const originalItem = item("PDA01");
  const untouchedItem = item("PDA02");
  const session: PdaHandoverSession = {
    sessionId: "session-1",
    handoverDate: "2026-08-11",
    shift: "06:00-15:00",
    status: "DRAFT",
    createdBy: "owner@spxexpress.com",
    createdAt: "2026-08-11T00:00:00.000Z",
    submittedBy: null,
    submittedAt: null,
    requiredCount: 2,
    completedCount: 0,
    items: [originalItem, untouchedItem],
  };

  const nextItem = completedItem("PDA01");
  const nextSession = replacePdaItem(session, nextItem);

  assert.notEqual(nextSession, session);
  assert.notEqual(nextSession.items, session.items);
  assert.equal(nextSession.items[0], nextItem);
  assert.equal(nextSession.items[1], untouchedItem);
  assert.equal(nextSession.completedCount, 1);
  assert.equal(session.items[0], originalItem);
  assert.equal(session.completedCount, 0);
});

test("normalizes Apps Script failures for display", () => {
  assert.equal(getGasErrorMessage(new Error("Máy chủ bận")), "Máy chủ bận");
  assert.equal(getGasErrorMessage({ message: "Không có quyền" }), "Không có quyền");
  assert.equal(getGasErrorMessage("Mất kết nối"), "Mất kết nối");
  assert.equal(
    getGasErrorMessage({ code: 500 }),
    "Không thể kết nối Google Apps Script.",
  );
  assert.equal(
    getGasErrorMessage(null),
    "Không thể kết nối Google Apps Script.",
  );
});

test("blocks submit until backend, queue and interaction state are all clear", () => {
  assert.equal(
    canSubmitPdaHandover({
      backendComplete: true,
      hasBlockingJobs: false,
      interactionPending: false,
    }),
    true,
  );

  for (const blocked of [
    { backendComplete: false, hasBlockingJobs: false, interactionPending: false },
    { backendComplete: true, hasBlockingJobs: true, interactionPending: false },
    { backendComplete: true, hasBlockingJobs: false, interactionPending: true },
  ]) {
    assert.equal(canSubmitPdaHandover(blocked), false);
  }
});

test("prioritizes failed and unfinished PDA before uploads and completed items", () => {
  const pending = item("PDA01");
  const waitingPhoto = item("PDA02", { scanAt: "2026-08-11T01:00:00.000Z" });
  const uploading = item("PDA03", { scanAt: "2026-08-11T01:00:00.000Z" });
  const complete = completedItem("PDA04");

  assert.equal(getPdaItemPriority(complete, "FAILED"), 0);
  assert.equal(getPdaItemPriority(pending), 0);
  assert.equal(getPdaItemPriority(waitingPhoto), 0);
  assert.equal(getPdaItemPriority(uploading, "QUEUED"), 1);
  assert.equal(getPdaItemPriority(uploading, "UPLOADING"), 1);
  assert.equal(getPdaItemPriority(complete, "COMPLETED"), 2);
  assert.equal(getPdaItemPriority(complete), 2);
});

test("priority sorting is stable and does not mutate the session snapshot", () => {
  const items = [
    completedItem("PDA04"),
    item("PDA02"),
    item("PDA01"),
    completedItem("PDA03"),
  ];
  const originalOrder = items.map(({ pdaName }) => pdaName);
  const sorted = [...items].sort(
    (left, right) => getPdaItemPriority(left) - getPdaItemPriority(right),
  );

  assert.deepEqual(sorted.map(({ pdaName }) => pdaName), [
    "PDA02",
    "PDA01",
    "PDA04",
    "PDA03",
  ]);
  assert.deepEqual(items.map(({ pdaName }) => pdaName), originalOrder);
});
