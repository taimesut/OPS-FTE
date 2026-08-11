# Fast PDA Scan and Background Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rút ngắn thời gian bàn giao PDA bằng một phiên camera liên tục: quét QR, xác thực, chụp frame ngay trong scanner, tiếp tục máy kế tiếp tức thì và tải tối đa hai ảnh song song ở nền.

**Architecture:** Scanner mini-app giữ quyền sở hữu camera và có state machine riêng cho workflow `pda-handover`, nhưng vẫn giữ nguyên protocol `scan-only`. Trang React xác thực secret qua Apps Script, nhận JPEG Blob đã nén, quản lý một hàng đợi upload theo PDA và chỉ chặn thao tác gửi—not thao tác quét—khi upload chưa hoàn tất. Apps Script hiện tại tiếp tục là nguồn sự thật cho email, timestamp, quyền phiên, ảnh cuối và khóa gửi.

**Tech Stack:** React 19, TypeScript 6, ZXing Browser, Vite single-file scanner build, Node test runner, Google Apps Script, Google Drive.

## Global Constraints

- Giữ nguyên hành vi và message hiện tại của mọi luồng `scan-only` (LH Trip, mã đơn và các trang QR khác).
- Fast mode chỉ bật sau khi scanner công bố capability chính xác `pda-handover-v1`; timeout hoặc thiếu capability phải quay về luồng scanner + camera hệ thống hiện tại.
- Camera phải giữ mở giữa nhiều vòng quét/xác thực/chụp; decoder tạm dừng khi xác thực hoặc chụp nhưng `MediaStream` không bị dừng.
- Secret chỉ tồn tại tạm trong bước validate; không ghi vào console, toast, queue, storage, tên file hoặc message lỗi trả lại người dùng.
- Nén ảnh lần đầu: JPEG, cạnh dài tối đa `1280px`, chất lượng `0.65`. Nếu Blob lớn hơn `1.5 MiB`, nén lại ở `1024px`, chất lượng `0.50`. Blob cuối phải là `image/jpeg` và không quá `4 MiB`.
- Tối đa hai upload đồng thời. Một lần upload ban đầu và tối đa ba retry tự động với delay `500ms`, `1500ms`, `3500ms`.
- Job thất bại cuối giữ Blob trong bộ nhớ để thử lại thủ công mà không quét lại. Không thêm IndexedDB/persistence qua reload.
- Ảnh mới thay job `QUEUED`/`FAILED`; nếu job cùng PDA đang `UPLOADING`, giữ ảnh mới làm phiên bản kế tiếp và cuối cùng backend phải nhận ảnh mới nhất.
- Nút gửi chỉ bật khi backend báo mọi PDA hoàn tất và không còn validate/capture/job `QUEUED`, `UPLOADING` hoặc `FAILED`.
- Không thay đổi cấu trúc Sheet, quyền Gmail, server timestamp, `LockService` hoặc API Apps Script đã có.
- Deploy scanner tương thích ngược trước, kiểm tra production scan-only, rồi mới deploy app chính.
- `scanner-dist/scanner-dist.zip` là file người dùng chưa track. Không xóa, overwrite, stage hoặc để Vite `emptyOutDir` tác động vào file này.

---

## File Structure

- Create `src/utils/pdaFastScannerProtocol.ts`: message contracts, runtime guards, scanner state reducer and capture-size math.
- Create `tests/pdaFastScannerProtocol.test.ts`: protocol/state/compatibility tests.
- Create `src/utils/pdaUploadQueue.ts`: framework-independent concurrency/retry/replacement queue.
- Create `tests/pdaUploadQueue.test.ts`: deterministic queue tests with injected timers.
- Create `src/hooks/usePdaUploadQueue.ts`: React subscription and Apps Script upload adapter.
- Create `src/components/PdaFastScanner.tsx`: secure iframe bridge, capability negotiation and lifecycle.
- Modify `src/scanner.ts`, `scanner.html`, `src/scanner.css`: continuous PDA scan/capture UI while preserving scan-only.
- Modify `src/utils/imageCompression.ts`: fast JPEG Blob profile shared by scanner fallback capture.
- Modify `src/utils/pdaHandover.ts`, `tests/pdaHandover.test.ts`: pure submit-gate and card ordering rules.
- Modify `src/pages/BanGiaoPdaPage.tsx`: fast workflow, queue, fallback and submit orchestration.
- Modify `src/components/PdaHandoverCard.tsx`: background-upload status and manual retry.
- Modify `src/components/PdaEvidenceCapture.tsx`: use the same fast Blob compression for fallback/retake.
- Modify `package.json`: register the two new test suites.
- Modify `vite.scanner.config.ts`: build into a safe directory that cannot delete the user's ZIP.
- Regenerate `scanner-dist/scanner.html` and `gas/index.html` only after all source checks pass.

---

### Task 1: Protocol contracts and scanner state machine

**Files:**
- Create: `tests/pdaFastScannerProtocol.test.ts`
- Create: `src/utils/pdaFastScannerProtocol.ts`
- Modify: `package.json`

**Interfaces:**

```ts
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

export function reducePdaFastScannerState(
  state: PdaFastScannerState,
  event: PdaFastScannerEvent,
): PdaFastScannerState;
export function getEvidenceDimensions(width: number, height: number, maxEdge: number): { width: number; height: number };
export function isPdaParentMessage(value: unknown): value is PdaParentMessage;
export function isPdaScannerMessage(value: unknown): value is PdaScannerMessage;
```

- [ ] **Step 1: Write failing tests**

Cover legal transitions `IDLE → SCANNING → VALIDATING → CAPTURE_READY → CAPTURING → WAITING_CONTINUE → SCANNING`, rejection back to scanning, stop from every active phase, and no-op for illegal/stale events. Verify secrets are present only in `PDA_HANDOVER_SCAN`, while accepted/evidence/continue messages carry only public PDA name/progress.

Add runtime guard tests for every new message, missing/wrong `requestId`, wrong capability, non-JPEG evidence, Blob over 4 MiB and unknown message types. Test landscape/portrait/no-enlargement dimension math.

- [ ] **Step 2: Register the suite and verify RED**

Append `tests/pdaFastScannerProtocol.test.ts` to the explicit `test` command in `package.json` without removing existing suites.

Run: `npm test`

Expected: FAIL because `src/utils/pdaFastScannerProtocol.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Define exact message names from the approved design:

```ts
"PDA_HANDOVER_SCANNER_READY"
"PDA_HANDOVER_SCAN"
"PDA_HANDOVER_SCAN_ACCEPTED"
"PDA_HANDOVER_SCAN_REJECTED"
"PDA_HANDOVER_EVIDENCE"
"PDA_HANDOVER_CONTINUE"
"PDA_HANDOVER_STOP"
```

Every message contains a non-empty `requestId`. Ready contains `capabilities: ["pda-handover-v1"]`; evidence contains a validated JPEG Blob and the currently accepted public `pdaName`. Reducer state must never retain the secret.

- [ ] **Step 4: Verify and commit**

Run: `npm test`

Expected: all current and new tests PASS.

```powershell
git add -- package.json tests/pdaFastScannerProtocol.test.ts src/utils/pdaFastScannerProtocol.ts
git commit -m "test: define fast PDA scanner protocol"
```

---

### Task 2: Deterministic two-slot upload queue

**Files:**
- Create: `tests/pdaUploadQueue.test.ts`
- Create: `src/utils/pdaUploadQueue.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export type PdaUploadStatus = "QUEUED" | "UPLOADING" | "COMPLETED" | "FAILED";

export interface PdaUploadJobSnapshot {
  pdaName: string;
  status: PdaUploadStatus;
  attempt: number;
  error: string | null;
}

export interface PdaUploadQueueOptions<T> {
  maxConcurrency: number;
  retryDelays: readonly number[];
  upload: (pdaName: string, blob: Blob) => Promise<T>;
  onSuccess: (pdaName: string, result: T) => void;
  wait?: (milliseconds: number) => Promise<void>;
}

export class PdaUploadQueue<T> {
  constructor(options: PdaUploadQueueOptions<T>);
  enqueue(pdaName: string, blob: Blob): void;
  retry(pdaName: string): void;
  getSnapshot(): readonly PdaUploadJobSnapshot[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
```

- [ ] **Step 1: Write failing queue tests**

Use deferred Promises and injected `wait` to test without real timers:

- exactly two jobs start; the third remains `QUEUED` until a slot settles;
- initial call plus three retries with delays `[500, 1500, 3500]`;
- success releases Blob references and invokes `onSuccess` once;
- final failure exposes `FAILED`, retains the Blob and manual `retry()` restarts from attempt one;
- a new capture replaces `QUEUED` or `FAILED` data;
- a new capture while `UPLOADING` becomes the pending replacement and uploads after the in-flight request, even if that request succeeds;
- latest replacement wins when several captures arrive during upload;
- `dispose()` clears scheduled work/listeners/blob references and prevents new starts after an unavoidable in-flight request settles;
- every state mutation produces an immutable snapshot and notification.

- [ ] **Step 2: Register and verify RED**

Append the suite to `package.json`, preserving every existing test entry.

Run: `node --experimental-strip-types --test tests/pdaUploadQueue.test.ts`

Expected: FAIL because the queue module does not exist.

- [ ] **Step 3: Implement scheduling and replacement rules**

Internally keep mutable jobs private, expose snapshots without Blob, and pump until `activeCount === maxConcurrency`. An upload gets four total attempts. For an uploading PDA, store a single `pendingReplacement`; after the current request settles, enqueue that Blob as the next version and discard the older completed/failed visible result.

Do not use `URL.createObjectURL`; the queue only owns Blob references. `dispose()` must dereference queued, failed and replacement blobs.

- [ ] **Step 4: Verify and commit**

Run: `npm test`

Expected: all tests PASS.

```powershell
git add -- package.json tests/pdaUploadQueue.test.ts src/utils/pdaUploadQueue.ts
git commit -m "feat: add PDA background upload queue"
```

---

### Task 3: Continuous PDA workflow inside the scanner mini-app

**Files:**
- Modify: `src/scanner.ts`
- Modify: `scanner.html`
- Modify: `src/scanner.css`

**Consumes:** protocol/state helpers from Task 1.

- [ ] **Step 1: Add a workflow switch without changing scan-only**

Extend the existing start payload with optional `workflow: "pda-handover"`. When absent, execute the current code path exactly: first decoded value calls existing `finish()`, stops camera and emits existing result message.

For PDA workflow, start the same camera controls, emit:

```ts
{
  type: "PDA_HANDOVER_SCANNER_READY",
  requestId,
  capabilities: [PDA_FAST_CAPABILITY],
}
```

and keep the stream alive until close, fatal camera error or `PDA_HANDOVER_STOP`.

- [ ] **Step 2: Implement the continuous scan handshake**

Gate the ZXing callback by state. On first scan in `SCANNING`, transition to `VALIDATING`, pause further decode handling without stopping controls/stream, and send only `{ type, requestId, secret }` to parent.

- `PDA_HANDOVER_SCAN_REJECTED`: show the public message briefly, clear secret references and resume scanning.
- `PDA_HANDOVER_SCAN_ACCEPTED`: show `Chụp ảnh PDAxx`, retain only public PDA name and wait for user capture.
- `PDA_HANDOVER_CONTINUE`: update completed/total/uploading counters and resume scanning.
- `PDA_HANDOVER_STOP`: stop controls/tracks and return to idle.

Reject all parent messages with wrong origin, `event.source`, request ID, state or PDA name.

- [ ] **Step 3: Capture and adaptively compress the live frame**

On the capture button, draw the video frame to an offscreen canvas using `getEvidenceDimensions`:

1. `1280px`, `canvas.toBlob("image/jpeg", 0.65)`.
2. If Blob is over `1.5 * 1024 * 1024`, redraw at `1024px`, `0.50`.
3. Reject null, wrong MIME or more than `4 * 1024 * 1024` with a fallback-camera action.
4. Post `PDA_HANDOVER_EVIDENCE` with Blob/public PDA name, vibrate briefly when supported, show a capture flash and wait for CONTINUE.

Do not convert to base64 in the scanner.

- [ ] **Step 4: Add fast-workflow UI states**

Extend `scanner.html`/CSS with a compact progress header (`hoàn tất / tổng`, `đang tải`), validation status, large PDA name, thumb-friendly capture button, transient reject/success feedback and fallback button. Preserve existing torch, zoom, switch-camera and close controls. Hidden PDA controls must not alter scan-only layout or focus order.

- [ ] **Step 5: Run source checks and commit**

Run:

```powershell
npx eslint src/scanner.ts
npm run build
```

Expected: PASS. Do not run `build:scanner` yet because Task 7 first makes its output safe for the user ZIP.

```powershell
git add -- src/scanner.ts scanner.html src/scanner.css
git commit -m "feat: keep PDA scanner camera active"
```

---

### Task 4: Secure React fast-scanner bridge with legacy fallback

**Files:**
- Create: `src/components/PdaFastScanner.tsx`

**Interface:**

```ts
interface PdaFastScannerProps {
  open: boolean;
  completed: number;
  total: number;
  uploading: number;
  onValidate: (secret: string) => Promise<{
    accepted: boolean;
    pdaName?: string;
    message?: string;
  }>;
  onEvidence: (pdaName: string, blob: Blob) => void;
  onUnsupported: () => void;
  onClose: () => void;
}
```

- [ ] **Step 1: Implement one request-scoped bridge**

Follow the existing `EmbeddedQRScanner` origin and iframe/popup rules. Generate a fresh request ID per open; use `SCANNER_URL/?embedded=1&workflow=pda-handover`. Accept messages only when all of `event.origin`, `event.source`, request ID and runtime guard match.

Send the start payload after iframe load. Wait up to 4 seconds for READY containing `pda-handover-v1`; on timeout or scanner error, clean listeners/timer, close fast mode and call `onUnsupported()` exactly once.

- [ ] **Step 2: Implement validate/evidence orchestration**

On scan, allow only one pending validation, await `onValidate(secret)`, then immediately discard the callback reference to the secret and send ACCEPTED or REJECTED. Never put the secret into React state.

On evidence, require the PDA name accepted for the current cycle, `image/jpeg` and `0 < size <= 4 MiB`. Call `onEvidence` synchronously, then send CONTINUE with current progress/upload count so the camera resumes without waiting for Drive.

- [ ] **Step 3: Add lifecycle cleanup and accessibility**

On close/unmount, send STOP best-effort, remove listeners, clear capability timer and call `onClose`. Render a full-screen accessible dialog/iframe title and a fallback control if capability negotiation fails.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npx eslint src/components/PdaFastScanner.tsx
npm run build
```

Expected: PASS.

```powershell
git add -- src/components/PdaFastScanner.tsx
git commit -m "feat: bridge continuous PDA scanner"
```

---

### Task 5: Fast image fallback and React upload hook

**Files:**
- Modify: `src/utils/imageCompression.ts`
- Create: `src/hooks/usePdaUploadQueue.ts`

**Interfaces:**

```ts
export async function compressPdaEvidenceBlob(file: Blob): Promise<Blob>;

export function usePdaUploadQueue(options: {
  sessionId: string | null;
  onUploaded: (item: PdaHandoverItem) => void;
}): {
  jobs: readonly PdaUploadJobSnapshot[];
  enqueue: (pdaName: string, blob: Blob) => void;
  retry: (pdaName: string) => void;
  uploadingCount: number;
  hasBlockingJobs: boolean;
};
```

- [ ] **Step 1: Refactor compression around Blob output**

Reuse current orientation/decode cleanup, but make `compressPdaEvidenceBlob` apply the approved `1280/.65`, adaptive `1024/.50` profile and return JPEG Blob. Keep the existing data-URL export as a compatibility wrapper if another caller still needs it. The fallback system-camera flow must use this same profile.

- [ ] **Step 2: Implement Blob-to-data-URL at upload time**

Create a local Promise helper using `FileReader.readAsDataURL(blob)`. Validate the result prefix, call existing `uploadPdaPhoto(sessionId, pdaName, dataUrl)`, and let the local string fall out of scope in `finally`; never place base64 in React state or queue snapshots.

- [ ] **Step 3: Wrap the queue with `useSyncExternalStore`**

Create one queue per non-null session ID with `maxConcurrency: 2` and exact retry delays. `onSuccess` passes the public server item to `onUploaded`. Dispose the old queue on session change/unmount. Derive counts from snapshots; `hasBlockingJobs` is true for `QUEUED`, `UPLOADING` or `FAILED`.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm test
npx eslint src/utils/imageCompression.ts src/hooks/usePdaUploadQueue.ts
npm run build
```

Expected: all PASS.

```powershell
git add -- src/utils/imageCompression.ts src/hooks/usePdaUploadQueue.ts
git commit -m "feat: upload PDA evidence in background"
```

---

### Task 6: Submit gate, item priority and PDA page integration

**Files:**
- Modify: `tests/pdaHandover.test.ts`
- Modify: `src/utils/pdaHandover.ts`
- Modify: `src/pages/BanGiaoPdaPage.tsx`
- Modify: `src/components/PdaHandoverCard.tsx`
- Modify: `src/components/PdaEvidenceCapture.tsx`

- [ ] **Step 1: Write failing pure-domain tests**

Add helpers and tests:

```ts
export function canSubmitPdaHandover(input: {
  backendComplete: boolean;
  hasBlockingJobs: boolean;
  interactionPending: boolean;
}): boolean;

export function getPdaItemPriority(
  item: PdaHandoverItem,
  uploadStatus?: PdaUploadStatus,
): number;
```

Submit must be false for every incomplete backend snapshot, queued/uploading/failed job, validation or capture. Item ordering priority: failed/unfinished first, uploading/queued next, completed last; stable sort equal priorities without mutating the session array.

Run: `node --experimental-strip-types --test tests/pdaHandover.test.ts`

Expected: FAIL until helpers are implemented.

- [ ] **Step 2: Integrate fast scanner and validation**

Replace the page's single blocking `handleScan → capture → await upload` path with:

1. Open `PdaFastScanner` by default.
2. `onValidate` calls existing `validatePdaScan`. Merge its public response. If item is complete or has an active queue job, return rejected/info `PDAxx đã được ghi nhận`; otherwise accept its public name.
3. `onEvidence` immediately enqueues the Blob and returns; scanner continues.
4. On capability/capture failure, close fast scanner and open existing `EmbeddedQRScanner` + `PdaEvidenceCapture` flow.

Keep only a boolean/promise guard for validation; never persist secret.

- [ ] **Step 3: Make fallback/retake non-blocking**

After file selection, call `compressPdaEvidenceBlob`, enqueue it and close the evidence dialog immediately. Do not globally disable scanning while uploads run. Retaking a completed/queued/failed PDA follows the queue replacement semantics from Task 2.

- [ ] **Step 4: Surface queue state on cards and sticky actions**

Extend card props with optional upload status/error, `onRetry` and retry availability. Show `Đang chờ tải`, `Đang tải ảnh`, `Tải ảnh lỗi` or backend `Hoàn tất`; failed cards expose **Thử tải lại** without requiring QR. Keep **Chụp lại** fallback.

Sort a derived copy using `getPdaItemPriority`. Sticky actions show number uploading and a concise submit-block reason. Closing scanner must not dispose the queue; leaving route/session does.

- [ ] **Step 5: Apply the exact submit gate**

Use `canSubmitPdaHandover` with current backend progress, queue blockers and validation/capture state. Also retain backend validation on `submitPdaSession`. Submitted sessions remain read-only.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm test
npx eslint src/pages/BanGiaoPdaPage.tsx src/components/PdaHandoverCard.tsx src/components/PdaEvidenceCapture.tsx src/utils/pdaHandover.ts
npm run build
```

Expected: all PASS.

```powershell
git add -- tests/pdaHandover.test.ts src/utils/pdaHandover.ts src/pages/BanGiaoPdaPage.tsx src/components/PdaHandoverCard.tsx src/components/PdaEvidenceCapture.tsx
git commit -m "feat: optimize PDA handover workflow"
```

---

### Task 7: Safe scanner build and backward-compatibility gate

**Files:**
- Modify: `vite.scanner.config.ts`
- Modify: `scanner-dist/scanner.html` via generated output only.

- [ ] **Step 1: Protect the user-owned scanner ZIP**

Change Vite scanner output from `scanner-dist` to a disposable directory such as `scanner-build`, keeping `emptyOutDir: true` there. Do not copy/delete the entire directory and never run a command that cleans `scanner-dist`.

Before build, verify:

```powershell
git status --short
Get-Item -LiteralPath scanner-dist/scanner-dist.zip | Select-Object FullName,Length,LastWriteTime
```

Record its length/time for the post-build comparison.

- [ ] **Step 2: Build scanner into the safe directory**

Run: `npm run build:scanner`

Expected: generated `scanner-build/scanner.html`; `scanner-dist/scanner-dist.zip` unchanged.

Copy only the generated HTML mechanically:

```powershell
Copy-Item -LiteralPath scanner-build/scanner.html -Destination scanner-dist/scanner.html
```

Do not stage `scanner-build` or the ZIP.

- [ ] **Step 3: Verify both protocols in the built artifact**

Confirm generated HTML contains the existing scan-only message names plus all seven PDA message names and `pda-handover-v1`. Run the full tests/lint/build again. Inspect `git status --short` and verify only intended source/artifact changes plus the pre-existing untracked ZIP.

- [ ] **Step 4: Commit config and artifact**

```powershell
git add -- vite.scanner.config.ts scanner-dist/scanner.html
git commit -m "build: package continuous PDA scanner"
```

---

### Task 8: Browser regression and deployable main artifact

**Files:**
- Modify: `gas/index.html` via generated output only.

- [ ] **Step 1: Run the automated gate**

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits `0`; both new suites are included.

- [ ] **Step 2: Perform local browser QA at phone width**

At `390x844`, using local reversible stubs rather than production PDA calls, verify:

- READY capability selects fast mode; timeout selects legacy mode once;
- scan wrong/duplicate resumes camera without reopening it;
- valid QR shows verified public PDA name and capture button;
- capture returns to scan while prior image still uploads;
- third upload waits while two are active;
- closing scanner leaves queue running;
- failed upload shows manual retry with no new scan;
- card sorting and sticky progress remain readable with 11 devices;
- submit stays disabled for queue/error/validation/capture and enables only when all server items complete;
- legacy scan-only still returns one code and closes/releases camera;
- system-camera fallback can capture/retake with the fast compression profile.

- [ ] **Step 3: Package the main Apps Script artifact**

After the successful `npm run build`, copy only:

```powershell
Copy-Item -LiteralPath dist/index.html -Destination gas/index.html
```

Confirm it contains `/ban-giao-pda`, `pda-handover-v1`, the queue status labels and existing Apps Script PDA method names.

- [ ] **Step 4: Commit the generated app artifact**

```powershell
git add -- gas/index.html
git commit -m "build: package fast PDA handover app"
```

---

### Task 9: Staged production rollout and real-device acceptance

**Files:** none.

- [ ] **Step 1: Deploy scanner first**

Deploy the new `scanner-dist/scanner.html` to `https://scan-qr.taimesut.net` without changing the URL. Confirm HTTPS, camera permission and that READY advertises `pda-handover-v1`.

- [ ] **Step 2: Prove backward compatibility before main-app deployment**

On a real phone, run at least one current scan-only flow for LH Trip and one current order/TO QR flow. Each must scan once, return the same result payload, close the scanner and release the camera exactly as before. If either fails, stop rollout and restore only the previous scanner HTML.

- [ ] **Step 3: Deploy the main app**

Redeploy Apps Script/web frontend containing the new React artifact. No Sheet migration or backend code change is required for this optimization.

- [ ] **Step 4: Run one 11-PDA acceptance session**

Verify with non-production/test shift data:

- camera opens once for the continuous run;
- timestamp after each valid scan and final photo is produced by Apps Script;
- user can aim at the next PDA immediately after capture;
- two photos can upload concurrently and all 11 eventually show backend completion;
- retry works without scanning again;
- final submit is blocked until all background work succeeds;
- submitted Gmail and timestamp remain correct.

- [ ] **Step 5: Record measured outcome**

Record total time from opening scanner to the 11th capture, total time until uploads settle, retry count and any fallback activation. Compare against the current sequential workflow to confirm the optimization materially reduces device-occupation time.

---

## Plan Self-Review

- Spec coverage: continuous camera, capability fallback, protocol security, adaptive compression, two-slot queue, exact retries, replacement semantics, manual retry, submit blocking, item ordering, compatibility and staged rollout each map to an explicit task.
- Security: no queue/interface persists secret; origin/source/request/state/PDA checks are required before accepting evidence.
- Failure behavior: capability, validation, capture, upload, reload and scanner-loss paths all have a defined outcome.
- Artifact safety: scanner builds outside `scanner-dist`; only `scanner.html` is copied back, and the user-owned `scanner-dist/scanner-dist.zip` is explicitly protected before and after build.
- Type consistency: public PDA items continue using current `PdaHandoverItem`; Apps Script method names and Sheet model remain unchanged.
- Placeholder scan: no implementation TODOs are deferred; constants, retry counts, timings, size limits, commands and deployment order are exact.
