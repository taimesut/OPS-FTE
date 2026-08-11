# PDA Handover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng luồng bàn giao toàn bộ PDA hoạt động theo ngày/ca, bắt buộc quét secret QR và chụp ảnh từng máy, lưu nháp trên Apps Script, lưu ảnh Drive, ghi Sheet và chặn gửi trùng.

**Architecture:** Logic ngày/ca, trạng thái và tiến độ nằm trong module TypeScript thuần để kiểm thử độc lập. React gọi một adapter Promise bọc `google.script.run`; Apps Script là nguồn sự thật cho email, secret, timestamp, quyền sở hữu phiên, Sheet, Drive và khóa gửi. Mỗi ảnh được nén rồi upload ngay trong phiên nháp; thao tác gửi chỉ chốt một snapshot đã hoàn tất.

**Tech Stack:** React 19, TypeScript 6, React Router, Tailwind CSS/DaisyUI, Node test runner, Google Apps Script V8, Google Sheets, Google Drive, `EmbeddedQRScanner`.

## Global Constraints

- Ca làm việc cố định chính xác: `06:00-15:00`, `13:00-22:00`, `22:00-06:00`.
- Ngày của ca `22:00-06:00` là ngày bắt đầu ca; không cho chọn ngày tương lai.
- Phiên mới bắt buộc toàn bộ PDA có `Hoạt động = TRUE` trong `PDA_DanhMuc` tại lúc tạo snapshot.
- Secret QR chỉ được so khớp phía Apps Script và không được trả xuống trình duyệt hoặc ghi vào log bàn giao.
- Mỗi PDA cần `scan_at` hợp lệ và ảnh cuối upload thành công; chỉ giữ timestamp ảnh cuối.
- Ảnh đầu ra là JPEG, cạnh dài tối đa `1600px`, chất lượng `0.78`, data URL tối đa `4 MiB`.
- Timestamp lưu bằng thời gian Apps Script và hiển thị theo `Asia/Bangkok`; không tin timestamp frontend.
- Mỗi cặp `handover_date + shift` chỉ có một phiên `SUBMITTED`.
- Mọi hàm Apps Script mới phải kiểm tra email qua sheet `account`, cột A từ dòng 2.
- Không sửa hoặc đưa file ngoài phạm vi vào commit; `scanner-dist/scanner-dist.zip` hiện là file người dùng chưa track.

---

## File Structure

- Create `src/utils/pdaHandover.ts`: constants, types, date validation, item state and progress derivation.
- Create `src/utils/pdaHandoverApi.ts`: typed Promise adapter for four Apps Script functions.
- Create `src/utils/imageCompression.ts`: decode/orient image through browser, resize and export bounded JPEG data URL.
- Create `src/components/PdaHandoverCard.tsx`: present one PDA snapshot item and its scan/photo actions.
- Create `src/components/PdaEvidenceCapture.tsx`: focused capture/upload dialog for the just-scanned PDA.
- Create `src/pages/BanGiaoPdaPage.tsx`: session selection, restore, scan, capture, progress and submit orchestration.
- Modify `src/App.tsx`: add `/ban-giao-pda` route.
- Modify `src/layouts/MobileLayout.tsx`: add the menu entry.
- Modify `gas/code.gs`: Sheet/Drive/session functions and authorization guards.
- Modify `gas/appsscript.json`: use timezone `Asia/Bangkok`.
- Create `tests/pdaHandover.test.ts`: pure frontend business-rule tests.
- Create `tests/gasPdaHandover.test.ts`: Apps Script VM harness and server behavior tests.
- Modify `package.json`: include both new test files in `npm test`.
- Regenerate `gas/index.html`: single-file deploy artifact after all source checks pass.

---

### Task 1: Frontend PDA handover domain model

**Files:**
- Create: `tests/pdaHandover.test.ts`
- Create: `src/utils/pdaHandover.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:

```ts
export const PDA_SHIFTS = ["06:00-15:00", "13:00-22:00", "22:00-06:00"] as const;
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
export function isPdaShift(value: string): value is PdaShift;
export function validateHandoverDate(value: string, today: string): string;
export function derivePdaItemState(item: PdaHandoverItem): PdaItemState;
export function getPdaProgress(items: readonly PdaHandoverItem[]): { completed: number; total: number; canSubmit: boolean };
export function replacePdaItem(session: PdaHandoverSession, nextItem: PdaHandoverItem): PdaHandoverSession;
```

- [ ] **Step 1: Write failing domain tests**

Create tests covering all fixed shifts, rejection of unknown shift, blank/invalid/future dates, acceptance of today/past date, all three item states, zero-item submit rejection, full-progress submit permission, and immutable replacement by `pdaName`:

```ts
test("only enables submit when every required PDA is completed", () => {
  assert.deepEqual(getPdaProgress([]), { completed: 0, total: 0, canSubmit: false });
  assert.deepEqual(getPdaProgress([
    item("PDA01", true),
    item("PDA02", false),
  ]), { completed: 1, total: 2, canSubmit: false });
  assert.equal(getPdaProgress([item("PDA01", true)]).canSubmit, true);
});

test("rejects a future handover date", () => {
  assert.throws(
    () => validateHandoverDate("2026-08-12", "2026-08-11"),
    /tương lai/,
  );
});
```

- [ ] **Step 2: Add the test script entry and verify RED**

Append `tests/pdaHandover.test.ts` to the explicit `test` script in `package.json`.

Run: `npm test`

Expected: FAIL because `src/utils/pdaHandover.ts` does not exist.

- [ ] **Step 3: Implement the minimal domain model**

Implement exact string/date checks without locale parsing:

```ts
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateHandoverDate(value: string, today: string) {
  if (!ISO_DATE_PATTERN.test(value)) throw new Error("Ngày bàn giao không hợp lệ.");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Ngày bàn giao không hợp lệ.");
  }
  if (value > today) throw new Error("Không thể chọn ngày bàn giao trong tương lai.");
  return value;
}
```

`derivePdaItemState` returns `COMPLETED` only when `completed`, `scanAt`, `photoAt`, and `photoUrl` are all truthy. `getPdaProgress` derives counts from items instead of trusting a server count.

- [ ] **Step 4: Verify GREEN and regression**

Run: `npm test`

Expected: all old tests and new domain tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- package.json tests/pdaHandover.test.ts src/utils/pdaHandover.ts
git commit -m "feat: add PDA handover domain model"
```

---

### Task 2: Apps Script Sheet/session foundation

**Files:**
- Create: `tests/gasPdaHandover.test.ts`
- Modify: `gas/code.gs`
- Modify: `gas/appsscript.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `getCurrentUserAccess_()`.
- Produces server functions:

```js
function getPdaHandoverBootstrap(handoverDate, shift) {}
function requirePdaAccess_() {}
function ensurePdaSheets_() {}
function validatePdaHandoverDate_(value) {}
function validatePdaShift_(value) {}
function serializePdaSession_(sessionRow, detailRows) {}
```

- [ ] **Step 1: Build a failing Apps Script VM harness**

Create an in-memory spreadsheet harness supporting `getSheetByName`, `insertSheet`, `getDataRange().getValues()`, `getRange().getValues()/setValues()/setValue()`, `appendRow`, and `getLastRow`. Stub authorized Session, UUID/timezone utilities, script lock, Drive folder lookup and Blob creation. Start with these tests:

```ts
test("creates a draft with a snapshot of every active PDA", async () => {
  const harness = await createPdaHarness({
    email: "owner@spxexpress.com",
    catalog: [
      ["PDA01", "PDA01SECRET", true],
      ["PDA02", "PDA02SECRET", false],
      ["PDA03", "PDA03SECRET", "TRUE"],
    ],
  });
  const result = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  assert.equal(result.status, "DRAFT");
  assert.deepEqual(result.items.map((row: { pdaName: string }) => row.pdaName), ["PDA01", "PDA03"]);
  assert.doesNotMatch(JSON.stringify(result), /PDA01SECRET/);
});

test("restores the same owner's draft instead of duplicating it", async () => {
  const harness = await createPdaHarness(defaultOptions);
  const first = harness.context.getPdaHandoverBootstrap("2026-08-11", "13:00-22:00");
  const second = harness.context.getPdaHandoverBootstrap("2026-08-11", "13:00-22:00");
  assert.equal(second.sessionId, first.sessionId);
});
```

Also test unauthorized access, missing/empty catalog, duplicate active name, duplicate active secret, invalid date, future date, invalid shift, returned submitted session, and exact header creation.

- [ ] **Step 2: Register the test and verify RED**

Append `tests/gasPdaHandover.test.ts` to `npm test`.

Run: `npm test`

Expected: FAIL because `getPdaHandoverBootstrap` is undefined.

- [ ] **Step 3: Add constants, validation and sheet initialization**

Add constants near the top of `gas/code.gs`:

```js
var PDA_CATALOG_SHEET = "PDA_DanhMuc";
var PDA_SESSION_SHEET = "PDA_PhienBanGiao";
var PDA_DETAIL_SHEET = "PDA_ChiTietBanGiao";
var PDA_PHOTO_FOLDER = "PDA_HANDOVER_PHOTOS";
var PDA_TIMEZONE = "Asia/Bangkok";
var PDA_SHIFTS = ["06:00-15:00", "13:00-22:00", "22:00-06:00"];
var PDA_SESSION_HEADERS = ["session_id", "handover_date", "shift", "status", "created_by", "created_at", "submitted_by", "submitted_at", "required_count", "completed_count"];
var PDA_DETAIL_HEADERS = ["session_id", "pda_name", "scan_at", "photo_at", "photo_file_id", "photo_url", "completed"];
```

`ensurePdaSheets_` creates missing sheets and row-1 headers. It may create an empty catalog with `Tên PDA`, `Mã key`, `Hoạt động`, but bootstrap returns a Vietnamese error until at least one valid active row exists.

`requirePdaAccess_` throws a public error when `getCurrentUserAccess_().allowed` is false and returns the normalized email otherwise.

- [ ] **Step 4: Implement snapshot creation/restore under a script lock**

Normalize active flags with `value === true || String(value).trim().toUpperCase() === "TRUE"`. Validate uniqueness using `Set`. Within `LockService.getScriptLock().waitLock(30000)`:

1. Return an existing submitted session for date+shift.
2. Otherwise restore an existing DRAFT matching date+shift+email.
3. Otherwise append one session row and one detail row per active PDA using a UUID.
4. Always release the lock in `finally`.

Serialize dates as ISO strings and camelCase field names; never include catalog secret values.

- [ ] **Step 5: Set manifest timezone and verify GREEN**

Change `gas/appsscript.json`:

```json
{
  "timeZone": "Asia/Bangkok",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- package.json tests/gasPdaHandover.test.ts gas/code.gs gas/appsscript.json
git commit -m "feat: add PDA handover draft sessions"
```

---

### Task 3: Server-side QR validation

**Files:**
- Modify: `tests/gasPdaHandover.test.ts`
- Modify: `gas/code.gs`

**Interfaces:**
- Consumes: session/detail lookup helpers from Task 2.
- Produces:

```js
function validatePdaQr(sessionId, secret) {}
```

Response is the updated public item shape:

```ts
interface PdaHandoverItem {
  pdaName: string;
  scanAt: string | null;
  photoAt: string | null;
  photoUrl: string | null;
  completed: boolean;
}
```

- [ ] **Step 1: Write failing QR tests**

Cover unauthorized calls, blank/wrong secret, wrong owner, submitted session, secret for a PDA outside the snapshot, successful exact trimmed match, no secret in response, and repeated scan behavior:

```ts
test("records server time for a valid secret without returning the secret", async () => {
  const harness = await createPdaHarness(defaultOptions);
  const session = harness.context.getPdaHandoverBootstrap("2026-08-11", "06:00-15:00");
  const item = harness.context.validatePdaQr(session.sessionId, "  PDA01SECRET  ");
  assert.equal(item.pdaName, "PDA01");
  assert.equal(item.scanAt, "2026-08-11T02:03:04.000Z");
  assert.doesNotMatch(JSON.stringify(item), /SECRET/);
});
```

For a PDA already completed, repeat validation returns the existing item and does not change `scan_at`. A catalog row that became inactive after snapshot remains valid if its name/key still exists and its name belongs to the snapshot; the snapshot, not the current active list, defines required devices.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --experimental-strip-types --test tests/gasPdaHandover.test.ts`

Expected: FAIL because `validatePdaQr` is undefined.

- [ ] **Step 3: Implement server-only secret matching**

Implementation sequence:

1. `requirePdaAccess_()`.
2. Validate non-empty session ID and trimmed secret with a maximum of 512 characters.
3. Find owned DRAFT session.
4. Read catalog rows on each call; find exact trimmed secret.
5. Confirm matched `pda_name` exists in session detail snapshot.
6. If item is completed, return it unchanged; otherwise set detail `scan_at` to `new Date()` and return serialized item.

Return the same generic message for unknown secret and secret outside the snapshot: `Mã QR PDA không hợp lệ cho phiên này.`

- [ ] **Step 4: Verify tests and commit**

Run: `npm test`

Expected: all tests PASS.

```powershell
git add -- tests/gasPdaHandover.test.ts gas/code.gs
git commit -m "feat: validate PDA handover QR keys"
```

---

### Task 4: Image compression and Drive evidence upload

**Files:**
- Create: `src/utils/imageCompression.ts`
- Modify: `tests/gasPdaHandover.test.ts`
- Modify: `gas/code.gs`

**Interfaces:**
- Produces frontend function:

```ts
export const PDA_IMAGE_MAX_EDGE = 1600;
export const PDA_IMAGE_QUALITY = 0.78;
export const PDA_IMAGE_MAX_DATA_URL_BYTES = 4 * 1024 * 1024;
export async function compressPdaEvidence(file: File): Promise<string>;
```

- Produces server function:

```js
function uploadPdaEvidence(sessionId, pdaName, dataUrl) {}
```

- [ ] **Step 1: Write failing Drive/upload tests**

Extend the VM harness with in-memory `DriveApp`, `Utilities.base64Decode`, `Utilities.newBlob`, file IDs/URLs, trash state and deterministic `new Date()`. Test:

- rejects unauthorized/wrong owner/submitted session;
- rejects upload before valid scan;
- rejects unknown PDA, malformed data URL, unsupported MIME and decoded data over 4 MiB;
- creates/reuses `PDA_HANDOVER_PHOTOS`;
- uses a sanitized filename with session ID and PDA name but no secret;
- stores file ID, URL, `photo_at`, and `completed = true`;
- tries domain-with-link sharing without failing the upload when sharing throws;
- on replacement, saves the new file and Sheet update before trashing old file;
- if Sheet update fails, trashes the new file and preserves the old detail values.

Core success assertion:

```ts
assert.deepEqual(result, {
  pdaName: "PDA01",
  scanAt: "2026-08-11T02:03:04.000Z",
  photoAt: "2026-08-11T02:03:05.000Z",
  photoUrl: "https://drive.google.com/file/d/file-1/view",
  completed: true,
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/gasPdaHandover.test.ts`

Expected: FAIL because `uploadPdaEvidence` is undefined.

- [ ] **Step 3: Implement bounded browser image compression**

`compressPdaEvidence` must:

1. Reject non-image files and zero-byte files.
2. Decode with `createImageBitmap(file, { imageOrientation: "from-image" })` when available, otherwise an object-URL `Image` fallback.
3. Scale so `max(width, height) <= 1600` without enlarging small images.
4. Draw to canvas and call `canvas.toDataURL("image/jpeg", 0.78)`.
5. Throw `Ảnh sau khi nén vẫn vượt quá 4 MiB.` if the resulting string exceeds the exact byte limit.
6. Close `ImageBitmap` and revoke object URLs in `finally` paths.

Do not add a new image library to the bundle.

- [ ] **Step 4: Implement transactional Drive upload**

Parse only this regex:

```js
var match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
```

Decode first, enforce `<= 4 * 1024 * 1024`, create a JPEG/PNG blob, and save in the folder. Call `file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW)` in a narrow `try/catch`. Update the matching detail row with `new Date()`, file metadata and `true`. Recompute the session completed count. Only then trash the prior file; if the Sheet update throws, trash the new file and rethrow.

- [ ] **Step 5: Verify and commit**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run lint`

Expected: PASS.

```powershell
git add -- src/utils/imageCompression.ts tests/gasPdaHandover.test.ts gas/code.gs
git commit -m "feat: store PDA photo evidence in Drive"
```

---

### Task 5: Atomic handover submission

**Files:**
- Modify: `tests/gasPdaHandover.test.ts`
- Modify: `gas/code.gs`

**Interfaces:**
- Produces:

```js
function submitPdaHandover(sessionId) {}
```

- [ ] **Step 1: Write failing submission tests**

Test unauthorized, wrong owner, empty snapshot, incomplete item, missing file URL/ID despite `completed`, successful submit, immutable submitted session, and duplicate date+shift across two email drafts. Verify that final `submitted_by` comes from Session rather than request input and `submitted_at` is server time.

```ts
test("allows only one submitted session per date and shift", async () => {
  const harness = await createCompletedConcurrentDraftHarness();
  const first = harness.as("first@spxexpress.com").submitPdaHandover("session-1");
  assert.equal(first.status, "SUBMITTED");
  assert.throws(
    () => harness.as("second@spxexpress.com").submitPdaHandover("session-2"),
    /đã được bàn giao/,
  );
  assert.equal(harness.submittedRows("2026-08-11", "06:00-15:00").length, 1);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/gasPdaHandover.test.ts`

Expected: FAIL because `submitPdaHandover` is undefined.

- [ ] **Step 3: Implement locked final validation**

Within a script lock:

1. Re-read the owned DRAFT row and all detail rows.
2. Reject when another SUBMITTED row has the same date+shift.
3. Reject zero detail rows or count mismatch with `required_count`.
4. Require every row to have non-empty `scan_at`, `photo_at`, `photo_file_id`, `photo_url`, and boolean true `completed`.
5. Update only the session row to `SUBMITTED`, current email, `new Date()`, and exact completed count.
6. Return the full serialized read-only session.
7. Release the lock in `finally`.

- [ ] **Step 4: Verify and commit**

Run: `npm test`

Expected: all tests PASS.

```powershell
git add -- tests/gasPdaHandover.test.ts gas/code.gs
git commit -m "feat: atomically submit PDA handovers"
```

---

### Task 6: Typed Apps Script frontend adapter

**Files:**
- Create: `src/utils/pdaHandoverApi.ts`
- Modify: `tests/pdaHandover.test.ts`

**Interfaces:**
- Consumes types from `src/utils/pdaHandover.ts`.
- Produces:

```ts
export function fetchPdaHandover(date: string, shift: PdaShift): Promise<PdaHandoverSession>;
export function validatePdaScan(sessionId: string, secret: string): Promise<PdaHandoverItem>;
export function uploadPdaPhoto(sessionId: string, pdaName: string, dataUrl: string): Promise<PdaHandoverItem>;
export function submitPdaSession(sessionId: string): Promise<PdaHandoverSession>;
```

- [ ] **Step 1: Write failing adapter normalization tests**

Export and test a small error normalizer from the same module:

```ts
export function getGasErrorMessage(error: unknown): string;
```

Test `Error`, `{ message: string }`, string and unknown values. The fallback is `Không thể kết nối Google Apps Script.`

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/pdaHandover.test.ts`

Expected: FAIL because `pdaHandoverApi.ts` does not exist.

- [ ] **Step 3: Implement one reusable Promise bridge**

Define the minimal script runner type locally and use a single helper:

```ts
function runGas<T>(method: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = window.google?.script?.run;
    if (!runner) {
      reject(new Error("Chức năng bàn giao PDA chỉ hoạt động trên Google Apps Script."));
      return;
    }
    runner
      .withSuccessHandler((value: T) => resolve(value))
      .withFailureHandler((error: unknown) => reject(new Error(getGasErrorMessage(error))))
      [method](...args);
  });
}
```

Add a focused global declaration without `any`. Do not route these calls through the Shopee Axios adapter.

- [ ] **Step 4: Verify and commit**

Run: `npm test`

Run: `npm run lint`

Expected: both PASS.

```powershell
git add -- tests/pdaHandover.test.ts src/utils/pdaHandoverApi.ts
git commit -m "feat: add PDA handover Apps Script client"
```

---

### Task 7: PDA evidence and status components

**Files:**
- Create: `src/components/PdaHandoverCard.tsx`
- Create: `src/components/PdaEvidenceCapture.tsx`

**Interfaces:**
- `PdaHandoverCard`:

```ts
interface PdaHandoverCardProps {
  item: PdaHandoverItem;
  busy: boolean;
  readOnly: boolean;
  onCapture: (pdaName: string) => void;
}
```

- `PdaEvidenceCapture`:

```ts
interface PdaEvidenceCaptureProps {
  open: boolean;
  pdaName: string | null;
  uploading: boolean;
  onFile: (file: File) => void;
  onClose: () => void;
}
```

- [ ] **Step 1: Implement the status card**

Use `derivePdaItemState` for exactly three badges:

- `PENDING_SCAN`: neutral, label `Chưa quét`.
- `WAITING_PHOTO`: warning, label `Chờ ảnh`.
- `COMPLETED`: success, label `Hoàn tất`.

Show server timestamps with a single formatter using locale `vi-VN`. Only show a thumbnail when `photoUrl` exists. The action reads `Chụp ảnh` for waiting items and `Chụp lại` for completed items; hide it for pending and submitted items. Add `loading="lazy"`, useful alt text, and a fixed thumbnail aspect ratio.

- [ ] **Step 2: Implement the focused capture dialog**

Create an accessible full-screen mobile dialog with:

```tsx
<input
  type="file"
  accept="image/jpeg,image/png"
  capture="environment"
  onChange={(event) => {
    const file = event.currentTarget.files?.[0];
    if (file) onFile(file);
    event.currentTarget.value = "";
  }}
/>
```

The dialog clearly names the PDA, says the image is mandatory evidence, prevents close during upload, and shows `Đang nén và tải ảnh...`. All interactive targets are at least 44px.

- [ ] **Step 3: Run static checks and commit**

Run: `npx eslint src/components/PdaHandoverCard.tsx src/components/PdaEvidenceCapture.tsx`

Run: `npm run build`

Expected: both PASS.

```powershell
git add -- src/components/PdaHandoverCard.tsx src/components/PdaEvidenceCapture.tsx
git commit -m "feat: add PDA evidence UI components"
```

---

### Task 8: PDA handover page orchestration

**Files:**
- Create: `src/pages/BanGiaoPdaPage.tsx`

**Interfaces:**
- Consumes all frontend interfaces from Tasks 1, 4, 6 and 7.
- Uses `EmbeddedQRScanner` with `mode="item"`.

- [ ] **Step 1: Build date/shift bootstrap controls**

Default date to today's local `YYYY-MM-DD`, but do not create a draft until the user selects a shift and presses `Bắt đầu bàn giao`. Set input `max` to today. Call `validateHandoverDate` before `fetchPdaHandover`. Disable selector changes while bootstrap/upload/submit is pending.

- [ ] **Step 2: Build scanner-to-capture flow**

On **Quét PDA**:

1. Open `EmbeddedQRScanner` in `item` mode.
2. After scan, close scanner and call `validatePdaScan` once.
3. Merge the returned item with `replacePdaItem`.
4. If returned item is not completed, set it as capture target and open `PdaEvidenceCapture`.
5. If completed, show `PDA này đã hoàn tất.` and do not change its timestamp.

Disable a second scan while validation is pending. Never log the scanned secret to console, toast or component state after the request resolves.

- [ ] **Step 3: Build compression/upload/retry flow**

For a selected file:

1. Call `compressPdaEvidence(file)`.
2. Call `uploadPdaPhoto(sessionId, pdaName, dataUrl)`.
3. Merge the public item response.
4. Close capture and show `Đã lưu ảnh PDA01.`.
5. On error, retain the capture target and allow retry.

Clear the data URL as soon as upload settles; do not store base64 in React state beyond the active handler.

- [ ] **Step 4: Render snapshot, progress and read-only result**

Use a mobile-first list of `PdaHandoverCard`. Add a sticky/safe-area-aware action area showing `completed/total`, a progress bar, **Quét PDA**, and **Gửi bàn giao**. `Gửi bàn giao` requires `progress.canSubmit`, DRAFT status and no pending action.

After `submitPdaSession`, replace the full session with the returned SUBMITTED session, disable all mutations, and show:

```text
Đã bàn giao bởi owner@spxexpress.com
11/08/2026, 09:15
```

Errors use `showToast` with the exact server message. Page heading: `Bàn giao PDA`; description: `Quét và chụp đủ toàn bộ thiết bị trước khi gửi bàn giao.`

- [ ] **Step 5: Check page quality and commit**

Run: `npx eslint src/pages/BanGiaoPdaPage.tsx`

Run: `npm run build`

Expected: both PASS.

```powershell
git add -- src/pages/BanGiaoPdaPage.tsx
git commit -m "feat: add PDA handover workflow page"
```

---

### Task 9: Route and navigation integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/layouts/MobileLayout.tsx`

**Interfaces:**
- Consumes: named export `BanGiaoPdaPage` from Task 8.
- Produces: hash route `#/ban-giao-pda` and drawer label `Bàn giao PDA`.

- [ ] **Step 1: Add the route**

Import the page directly and add:

```tsx
<Route path="/ban-giao-pda" element={<BanGiaoPdaPage />} />
```

- [ ] **Step 2: Add drawer navigation**

Import the Lucide `TabletSmartphone` icon and add after `Lấy mã TO`:

```ts
{
  path: "/ban-giao-pda",
  label: "Bàn giao PDA",
  icon: TabletSmartphone,
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run lint`

Run: `npm run build`

Expected: both PASS.

```powershell
git add -- src/App.tsx src/layouts/MobileLayout.tsx
git commit -m "feat: add PDA handover navigation"
```

---

### Task 10: Full regression, mobile QA and deployment artifact

**Files:**
- Modify: `gas/index.html` via build output only.

**Interfaces:**
- Deployable bundle contains route, UI and calls to the server functions already present in `gas/code.gs`.

- [ ] **Step 1: Run the full automated gate**

Run:

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits `0`; the test count includes both new PDA suites.

- [ ] **Step 2: Regenerate the Apps Script HTML artifact**

Copy the mechanically generated single-file build:

```powershell
Copy-Item -LiteralPath dist/index.html -Destination gas/index.html
```

Confirm it contains `Bàn giao PDA`, `/ban-giao-pda`, `getPdaHandoverBootstrap`, `validatePdaQr`, `uploadPdaEvidence`, and `submitPdaHandover`.

- [ ] **Step 3: Perform browser QA at phone width**

At `390x844`, verify:

- no horizontal overflow;
- date and shift controls are readable and at least 44px high;
- 11 sample PDA cards remain scannable as a vertical list;
- progress remains visible without covering the last card;
- QR scanner opens full screen and closing it preserves the draft;
- capture dialog names the scanned PDA and exposes rear-camera capture;
- submit stays disabled at `10/11` and enables at `11/11` in a mocked session;
- submitted view is read-only and shows Gmail/timestamp;
- keyboard focus and screen-reader labels are present on scanner, capture, retake and submit controls.

Do not call the production PDA functions or upload real photos during local browser QA; use a reversible local stub or inspect the rendered states through development mocks.

- [ ] **Step 4: Review deployment prerequisites**

Before real-device acceptance, document these one-time deployment checks in the handoff:

1. Add `PDA01`… rows, unique QR secrets and `TRUE` flags to `PDA_DanhMuc`.
2. Redeploy the Apps Script web app so the new server functions and Drive scopes are authorized.
3. Authorize Drive access with the deployment owner.
4. Confirm Spreadsheet timezone and manifest timezone are `Asia/Bangkok`.
5. Test camera, QR scanner iframe/popup fallback, upload, Drive link visibility and duplicate blocking using non-production sample PDA rows.

- [ ] **Step 5: Commit only the generated artifact**

Check `git status --short` first and preserve unrelated files.

```powershell
git add -- gas/index.html
git commit -m "build: package PDA handover app"
```

Do not add `scanner-dist/scanner-dist.zip` or any unrelated user file.

---

## Plan Self-Review

- Spec coverage: Sheet catalog/session/detail, active snapshot, fixed shifts, no future date, server timestamps, email authorization, server-only secrets, Drive upload/replacement, progress gate, duplicate lock, route, mobile QA and deployment are each assigned to a task.
- Placeholder scan: the plan contains no deferred implementation markers; validation messages, limits, interfaces, file paths and commands are explicit.
- Type consistency: public session/item fields are camelCase in TypeScript and Apps Script responses; Sheet fields remain snake_case headers. API names match the approved design: `getPdaHandoverBootstrap`, `validatePdaQr`, `uploadPdaEvidence`, `submitPdaHandover`.
