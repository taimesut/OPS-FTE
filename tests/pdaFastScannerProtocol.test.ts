import assert from "node:assert/strict";
import test from "node:test";
import {
  getEvidenceDimensions,
  isPdaParentMessage,
  isPdaScannerMessage,
  PDA_EVIDENCE_MAX_BYTES,
  PDA_FAST_CAPABILITY,
  reducePdaFastScannerState,
  type PdaFastScannerEvent,
  type PdaFastScannerState,
} from "../src/utils/pdaFastScannerProtocol.ts";

function withoutRequestId(
  message: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(message).filter(([key]) => key !== "requestId"),
  );
}

test("runs the complete fast scanner state cycle without retaining a secret", () => {
  let state: PdaFastScannerState = { phase: "IDLE" };
  const events: PdaFastScannerEvent[] = [
    { type: "START" },
    { type: "SCAN" },
    { type: "ACCEPT", pdaName: "PDA01" },
    { type: "CAPTURE" },
    { type: "EVIDENCE_SENT" },
    { type: "CONTINUE" },
  ];
  const phases = events.map((event) => {
    state = reducePdaFastScannerState(state, event);
    assert.equal("secret" in state, false);
    return state.phase;
  });

  assert.deepEqual(phases, [
    "SCANNING",
    "VALIDATING",
    "CAPTURE_READY",
    "CAPTURING",
    "WAITING_CONTINUE",
    "SCANNING",
  ]);
});

test("returns to scanning after a rejected QR", () => {
  const validating = reducePdaFastScannerState(
    { phase: "SCANNING" },
    { type: "SCAN" },
  );
  assert.deepEqual(
    reducePdaFastScannerState(validating, { type: "REJECT" }),
    { phase: "SCANNING" },
  );
});

test("stops from every active scanner phase", () => {
  const activeStates: PdaFastScannerState[] = [
    { phase: "SCANNING" },
    { phase: "VALIDATING" },
    { phase: "CAPTURE_READY", pdaName: "PDA01" },
    { phase: "CAPTURING", pdaName: "PDA01" },
    { phase: "WAITING_CONTINUE", pdaName: "PDA01" },
  ];
  for (const state of activeStates) {
    assert.deepEqual(reducePdaFastScannerState(state, { type: "STOP" }), {
      phase: "STOPPED",
    });
  }
});

test("ignores illegal and stale scanner events", () => {
  const cases: Array<[PdaFastScannerState, PdaFastScannerEvent]> = [
    [{ phase: "IDLE" }, { type: "SCAN" }],
    [{ phase: "SCANNING" }, { type: "CAPTURE" }],
    [{ phase: "VALIDATING" }, { type: "CONTINUE" }],
    [
      { phase: "CAPTURE_READY", pdaName: "PDA01" },
      { type: "ACCEPT", pdaName: "PDA02" },
    ],
    [
      { phase: "WAITING_CONTINUE", pdaName: "PDA01" },
      { type: "EVIDENCE_SENT" },
    ],
    [{ phase: "STOPPED" }, { type: "START" }],
  ];
  for (const [state, event] of cases) {
    assert.equal(reducePdaFastScannerState(state, event), state);
  }
});

test("accepts every exact scanner-to-parent message", () => {
  const evidence = new Blob(["jpeg"], { type: "image/jpeg" });
  assert.equal(
    isPdaScannerMessage({
      type: "PDA_HANDOVER_SCANNER_READY",
      requestId: "request-1",
      capabilities: [PDA_FAST_CAPABILITY],
    }),
    true,
  );
  assert.equal(
    isPdaScannerMessage({
      type: "PDA_HANDOVER_SCAN",
      requestId: "request-1",
      secret: "PDA01SECRET",
    }),
    true,
  );
  assert.equal(
    isPdaScannerMessage({
      type: "PDA_HANDOVER_EVIDENCE",
      requestId: "request-1",
      pdaName: "PDA01",
      blob: evidence,
    }),
    true,
  );
});

test("accepts every exact parent-to-scanner message without a secret", () => {
  const messages = [
    {
      type: "PDA_HANDOVER_SCAN_ACCEPTED",
      requestId: "request-1",
      pdaName: "PDA01",
    },
    {
      type: "PDA_HANDOVER_SCAN_REJECTED",
      requestId: "request-1",
      message: "Mã PDA không hợp lệ.",
    },
    {
      type: "PDA_HANDOVER_CONTINUE",
      requestId: "request-1",
      completed: 3,
      total: 11,
      uploading: 2,
    },
    { type: "PDA_HANDOVER_STOP", requestId: "request-1" },
  ];

  for (const message of messages) {
    assert.equal(isPdaParentMessage(message), true);
    assert.equal("secret" in message, false);
  }
});

test("rejects malformed request IDs, capabilities and unknown messages", () => {
  const invalidMessages = [
    null,
    { type: "PDA_HANDOVER_STOP" },
    { type: "PDA_HANDOVER_STOP", requestId: "  " },
    {
      type: "PDA_HANDOVER_SCANNER_READY",
      requestId: "request-1",
      capabilities: ["some-other-capability"],
    },
    {
      type: "PDA_HANDOVER_SCANNER_READY",
      requestId: "request-1",
      capabilities: [PDA_FAST_CAPABILITY, "extra"],
    },
    { type: "UNKNOWN", requestId: "request-1" },
  ];

  for (const message of invalidMessages) {
    assert.equal(isPdaParentMessage(message), false);
    assert.equal(isPdaScannerMessage(message), false);
  }
});

test("requires a non-empty string requestId on every protocol message", () => {
  const scannerMessages = [
    {
      type: "PDA_HANDOVER_SCANNER_READY",
      requestId: "request-1",
      capabilities: [PDA_FAST_CAPABILITY],
    },
    {
      type: "PDA_HANDOVER_SCAN",
      requestId: "request-1",
      secret: "PDA01SECRET",
    },
    {
      type: "PDA_HANDOVER_EVIDENCE",
      requestId: "request-1",
      pdaName: "PDA01",
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    },
  ];
  const parentMessages = [
    {
      type: "PDA_HANDOVER_SCAN_ACCEPTED",
      requestId: "request-1",
      pdaName: "PDA01",
    },
    {
      type: "PDA_HANDOVER_SCAN_REJECTED",
      requestId: "request-1",
      message: "Mã PDA không hợp lệ.",
    },
    {
      type: "PDA_HANDOVER_CONTINUE",
      requestId: "request-1",
      completed: 3,
      total: 11,
      uploading: 2,
    },
    { type: "PDA_HANDOVER_STOP", requestId: "request-1" },
  ];

  for (const message of scannerMessages) {
    assert.equal(isPdaScannerMessage(withoutRequestId(message)), false);
    assert.equal(isPdaScannerMessage({ ...message, requestId: 123 }), false);
    assert.equal(isPdaScannerMessage({ ...message, requestId: "" }), false);
  }
  for (const message of parentMessages) {
    assert.equal(isPdaParentMessage(withoutRequestId(message)), false);
    assert.equal(isPdaParentMessage({ ...message, requestId: 123 }), false);
    assert.equal(isPdaParentMessage({ ...message, requestId: "" }), false);
  }
});

test("keeps the secret exclusive to scan messages", () => {
  assert.equal(
    isPdaScannerMessage({
      type: "PDA_HANDOVER_SCAN",
      requestId: "request-1",
      secret: " ",
    }),
    false,
  );
  assert.equal(
    isPdaParentMessage({
      type: "PDA_HANDOVER_SCAN_ACCEPTED",
      requestId: "request-1",
      pdaName: "PDA01",
      secret: "must-not-leak",
    }),
    false,
  );
  assert.equal(
    isPdaScannerMessage({
      type: "PDA_HANDOVER_EVIDENCE",
      requestId: "request-1",
      pdaName: "PDA01",
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      secret: "must-not-leak",
    }),
    false,
  );
});

test("rejects a secret added to every non-scan message", () => {
  const messages = [
    {
      type: "PDA_HANDOVER_SCANNER_READY",
      requestId: "request-1",
      capabilities: [PDA_FAST_CAPABILITY],
    },
    {
      type: "PDA_HANDOVER_EVIDENCE",
      requestId: "request-1",
      pdaName: "PDA01",
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    },
    {
      type: "PDA_HANDOVER_SCAN_ACCEPTED",
      requestId: "request-1",
      pdaName: "PDA01",
    },
    {
      type: "PDA_HANDOVER_SCAN_REJECTED",
      requestId: "request-1",
      message: "Mã PDA không hợp lệ.",
    },
    {
      type: "PDA_HANDOVER_CONTINUE",
      requestId: "request-1",
      completed: 3,
      total: 11,
      uploading: 2,
    },
    { type: "PDA_HANDOVER_STOP", requestId: "request-1" },
  ];

  for (const message of messages) {
    const leaked = { ...message, secret: "must-not-leak" };
    assert.equal(isPdaScannerMessage(leaked), false);
    assert.equal(isPdaParentMessage(leaked), false);
  }
});

test("rejects blank public PDA names", () => {
  assert.equal(
    isPdaParentMessage({
      type: "PDA_HANDOVER_SCAN_ACCEPTED",
      requestId: "request-1",
      pdaName: "   ",
    }),
    false,
  );
  assert.equal(
    isPdaScannerMessage({
      type: "PDA_HANDOVER_EVIDENCE",
      requestId: "request-1",
      pdaName: "",
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    }),
    false,
  );
});

test("rejects invalid PDA evidence blobs", () => {
  const base = {
    type: "PDA_HANDOVER_EVIDENCE",
    requestId: "request-1",
    pdaName: "PDA01",
  };
  assert.equal(
    isPdaScannerMessage({
      ...base,
      blob: new Blob(["png"], { type: "image/png" }),
    }),
    false,
  );
  assert.equal(
    isPdaScannerMessage({
      ...base,
      blob: new Blob([], { type: "image/jpeg" }),
    }),
    false,
  );
  assert.equal(
    isPdaScannerMessage({
      ...base,
      blob: new Blob([new Uint8Array(PDA_EVIDENCE_MAX_BYTES + 1)], {
        type: "image/jpeg",
      }),
    }),
    false,
  );
  assert.equal(isPdaScannerMessage({ ...base, blob: "not-a-blob" }), false);
  assert.equal(
    isPdaScannerMessage({
      ...base,
      blob: new Blob([new Uint8Array(PDA_EVIDENCE_MAX_BYTES)], {
        type: "image/jpeg",
      }),
    }),
    true,
  );
});

test("validates continue progress counters", () => {
  const base = {
    type: "PDA_HANDOVER_CONTINUE",
    requestId: "request-1",
    completed: 3,
    total: 11,
    uploading: 2,
  };
  assert.equal(isPdaParentMessage({ ...base, completed: -1 }), false);
  assert.equal(isPdaParentMessage({ ...base, completed: 12 }), false);
  assert.equal(isPdaParentMessage({ ...base, uploading: 1.5 }), false);
});

test("scales landscape and portrait evidence without enlargement", () => {
  assert.deepEqual(getEvidenceDimensions(2000, 1000, 1280), {
    width: 1280,
    height: 640,
  });
  assert.deepEqual(getEvidenceDimensions(1000, 2000, 1280), {
    width: 640,
    height: 1280,
  });
  assert.deepEqual(getEvidenceDimensions(640, 480, 1280), {
    width: 640,
    height: 480,
  });
});

test("rejects invalid evidence dimension inputs", () => {
  const invalidInputs: Array<[number, number, number]> = [
    [0, 480, 1280],
    [640, 0, 1280],
    [-1, 480, 1280],
    [640, -1, 1280],
    [640, 480, 0],
    [Number.NaN, 480, 1280],
    [640, Number.POSITIVE_INFINITY, 1280],
    [640, 480, Number.NaN],
  ];
  for (const [width, height, maxEdge] of invalidInputs) {
    assert.throws(
      () => getEvidenceDimensions(width, height, maxEdge),
      /không hợp lệ/i,
    );
  }
});
