import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePdaItemState,
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
