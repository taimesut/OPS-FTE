# Mobile UI and Embedded QR Scanner Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a review checkpoint after each task. Steps use checkbox syntax for tracking.

**Goal:** Make the SPX operations app mobile-first and hardcode the live QR scanner to `https://taimesut.net`, using a reusable iframe with a validated popup fallback.

**Architecture:** Keep the existing React/Vite/DaisyUI app shell and add one reusable `EmbeddedQRScanner` session component. The parent owns request IDs, origin/source validation, iframe visibility, and popup fallback; the standalone scanner owns camera tracks and supports both parent-frame and opener messaging. Responsive presentation is handled in existing page/component files, with mobile cards for dense TO data.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, DaisyUI, Lucide icons, ZXing Browser/Library.

## Global Constraints

- The live scanner URL is the exact constant `https://taimesut.net`.
- The editable scanner URL setting is removed from the workflow, while imported `scanner_url` data remains backward-compatible and is ignored at runtime.
- Existing SPX orange/Be Vietnam Pro light/dark visual language remains intact.
- Interactive controls are at least 44px on mobile and honor safe-area insets.
- Scanner messages are accepted only from the exact scanner origin, expected source window, active request ID, and expected message type.
- Native image capture remains available if the live scanner is unavailable.
- Preserve the user's existing uncommitted label change in `src/pages/SettingsPage.tsx`.

---

### Task 1: Hardcode scanner configuration and simplify Settings

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Produces `SCANNER_URL: "https://taimesut.net"` and `getScannerUrl(): string` for all live-scan callers.
- Preserves `AppConfig.scanner_url?: string` for imported/exported JSON compatibility.

- [ ] **Step 1: Add the runtime scanner constant**

In `src/utils/config.ts`, export `SCANNER_URL` and make `getScannerUrl()` return it without reading localStorage:

```ts
export const SCANNER_URL = "https://taimesut.net";

export const getScannerUrl = (): string => SCANNER_URL;
```

- [ ] **Step 2: Remove the editable scanner input**

In `SettingsPage`, remove scanner URL state and input handlers. Replace the scanner card with a read-only status card that shows the constant URL and explains that live scanning is fixed. Keep `scanner_url` in saved/imported JSON when possible, but do not use it to open a scanner.

- [ ] **Step 3: Run the fast type check**

Run `node node_modules/typescript/lib/tsc.js -b`.

Expected: exit code 0; no code should still require a scanner URL state in Settings.

---

### Task 2: Build the reusable embedded scanner session component

**Files:**
- Create: `src/components/EmbeddedQRScanner.tsx`

**Interfaces:**
- Consumes `open: boolean`, `mode: "lhtrip" | "item" | null`, `onScan(value: string, mode: ScanMode): void`, and `onClose(): void`.
- Produces a persistent iframe session, validated `postMessage` handling, and popup fallback without owning form state.

- [ ] **Step 1: Define the session protocol and state**

Create `ScanMode`, `EmbeddedQRScannerProps`, `ScannerStatus`, `SCANNER_ORIGIN`, and refs for the iframe, popup, current request ID, and timeout. Keep the iframe mounted after close so its document does not reload.

- [ ] **Step 2: Add secure iframe rendering**

Render a full-screen responsive modal when `open` is true and an iframe with `src={`${SCANNER_URL}/?embedded=1`}`, `allow="camera; fullscreen"`, `title="Live QR scanner"`, and a loading/error state. The close button must send a stop message before invoking `onClose`.

- [ ] **Step 3: Implement start/stop messaging**

On a new `open + mode`, create `crypto.randomUUID()`, save the mode, wait for the iframe load if necessary, and post:

```ts
{ type: "LH_TRIP_SCANNER_START", requestId, targetOrigin: window.location.origin, mode }
```

On close, post `{ type: "LH_TRIP_SCANNER_STOP", requestId }` and clear timeout/session state without unmounting the iframe.

- [ ] **Step 4: Validate iframe and popup messages**

Handle `LH_TRIP_SCANNER_READY`, `LH_TRIP_SCAN_RESULT`, and `LH_TRIP_SCANNER_ERROR`. Require `event.origin === SCANNER_ORIGIN`, `event.source === iframe.contentWindow` for iframe messages, and matching request ID before applying a result. For popup messages require `event.source === popupRef.current`.

- [ ] **Step 5: Add popup fallback**

Build a popup URL from `SCANNER_URL` with `embedded=0`, `requestId`, and `targetOrigin`. Show an `Open scanner window` button after iframe timeout/error. If `window.open` returns null, show a Vietnamese warning and retain native capture as the next option.

- [ ] **Step 6: Run lint for the new component**

Run `npx eslint src/components/EmbeddedQRScanner.tsx`.

Expected: no errors or warnings.

---

### Task 3: Extend the standalone scanner protocol

**Files:**
- Modify: `src/scanner.ts`
- Modify: `scanner.html`
- Modify: `src/scanner.css`

**Interfaces:**
- Consumes query parameters for popup mode and `LH_TRIP_SCANNER_START/STOP` messages for iframe mode.
- Produces `READY`, `RESULT`, and `ERROR` messages to either `window.parent` or `window.opener`.

- [ ] **Step 1: Separate context and session state**

Detect `embedded=1`, keep active request ID/target origin in mutable session state, and route outbound messages through one helper that targets `window.parent` for iframe mode or `window.opener` for popup mode.

- [ ] **Step 2: Handle iframe start and stop**

Listen for `LH_TRIP_SCANNER_START` and `LH_TRIP_SCANNER_STOP`, reject starts whose target origin is empty, stop any existing camera before restarting, and reset the closed/session flags for each new request.

- [ ] **Step 3: Report lifecycle and decode errors**

Post `LH_TRIP_SCANNER_READY` after camera and ZXing controls are active. Post `LH_TRIP_SCANNER_ERROR` on permission/start failures. On a decode, post `LH_TRIP_SCAN_RESULT` and stop tracks.

- [ ] **Step 4: Preserve popup behavior**

Popup success/cancel continues to call `window.close()`. Embedded success/cancel leaves the document open after stopping tracks so the parent can reuse it.

- [ ] **Step 5: Improve scanner mobile controls**

Keep the current dark camera view but make close, zoom, torch, and camera-switch controls safe-area aware, touch-sized, and usable at 360px width. Add visible focus styles and reduced-motion handling for the scan line.

- [ ] **Step 6: Build the scanner artifact**

Run `npm run build:scanner`.

Expected: Vite emits a successful scanner build with no TypeScript errors.

---

### Task 4: Integrate scanner sessions into the incident workflow

**Files:**
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`

**Interfaces:**
- Consumes `EmbeddedQRScanner` callbacks and existing `applyScannedValue(value, mode)` logic.
- Produces the same LH TRIP/item transitions while replacing the URL-configured popup handler.

- [ ] **Step 1: Replace popup-only state**

Remove `getScannerUrl`, `scannerUrl`, `pendingScan`, `scannerPopupRef`, and the page-level message listener. Add `scannerMode: ScanMode | null` and render `EmbeddedQRScanner` once near the page root.

- [ ] **Step 2: Connect scan buttons**

Both “Quét trực tiếp” buttons set the corresponding mode. Keep image capture buttons visible as the fallback path regardless of scanner state.

- [ ] **Step 3: Preserve result transitions**

Pass a stable callback to `EmbeddedQRScanner` that calls `applyScannedValue(value, mode)` and then clears `scannerMode`. LH TRIP results still advance to `scan_items`; item results still populate `currentCode`.

- [ ] **Step 4: Tighten mobile incident layout**

Make header copy readable at narrow widths, make scan/capture actions full width, give step banners and reason choices 44px touch targets, and render incident items as stacked cards on phones while preserving the desktop table and print preview.

- [ ] **Step 5: Run page lint**

Run `npx eslint src/pages/TaoBienBanSuVuPage.tsx`.

Expected: no new errors.

---

### Task 5: Apply the mobile UI pass across shared and data-heavy views

**Files:**
- Modify: `src/layouts/MobileLayout.tsx`
- Modify: `src/global.css`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/CheckSotNoiTinhPage.tsx`
- Modify: `src/pages/CheckSotNgoaiTinhPage.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/components/TOTable.tsx`
- Modify: `src/components/QRCodeModal.tsx`
- Modify: `src/components/Toast.tsx`

**Interfaces:**
- Preserves current route/component props and data behavior.
- Produces consistent mobile spacing, safe-area handling, and touch-sized controls across all pages.

- [ ] **Step 1: Normalize the shared shell**

Update header/drawer classes and accessible labels for a 56px top bar, viewport-relative drawer width, truncated SOC text, and `safe-bottom` content padding. Do not change route paths or navigation labels.

- [ ] **Step 2: Add global mobile primitives**

Add focused, reduced-motion, safe-area, and small-screen rules in `global.css`. Avoid broad element selectors that override existing DaisyUI component behavior.

- [ ] **Step 3: Make check pages stack cleanly**

Stack title/filter sections below the mobile breakpoint, keep selects and search buttons full width, and retain the desktop row layout from `md` upward.

- [ ] **Step 4: Render mobile TO cards**

In `TOTable.tsx`, define a module-level `TransferOrderCard` component. Render cards below `md` with TO number, route, operator, package, quantity/weight, status, completion time, and the same QR action; render the existing dense table only at `md` and above. Keep filtering, pagination, column preferences, and QR modal behavior unchanged.

- [ ] **Step 5: Fit modals, toasts, home, and settings**

Constrain modal/toast widths to the viewport, make QR content readable without horizontal overflow, keep the Home contact card within 100vw, and ensure Settings cards/buttons do not hide behind the sticky save bar.

- [ ] **Step 6: Run focused lint**

Run `npx eslint src/layouts/MobileLayout.tsx src/global.css src/pages/HomePage.tsx src/pages/CheckSotNoiTinhPage.tsx src/pages/CheckSotNgoaiTinhPage.tsx src/pages/SettingsPage.tsx src/components/TOTable.tsx src/components/QRCodeModal.tsx src/components/Toast.tsx`.

Expected: ESLint accepts TypeScript/TSX changes; CSS is ignored or handled by the repository config without errors.

---

### Task 6: Production verification and review checkpoint

**Files:**
- Verify: all modified files above
- Verify: `dist/` and `scanner-dist/` build outputs without staging generated artifacts unless already tracked by project convention

- [ ] **Step 1: Run the full app build**

Run `npm run build`.

Expected: TypeScript, Vite, and the PWA post-build script complete successfully.

- [ ] **Step 2: Run the full lint command**

Run `npm run lint`.

Expected: exit code 0, with no new diagnostics from modified source.

- [ ] **Step 3: Inspect responsive and scanner behavior**

Use a browser/device viewport at 360px, 390px, 768px, and desktop widths. Confirm no page-level horizontal overflow, sticky actions remain visible above the safe area, TO cards expose all existing actions, iframe scan results fill the correct field, iframe close stops camera, popup fallback opens, and native image capture remains usable.

- [ ] **Step 4: Confirm worktree boundaries**

Run `git status --short` and `git diff -- src/pages/SettingsPage.tsx`. Confirm the pre-existing SOC label change is still present and no unrelated files are reverted.

- [ ] **Step 5: Commit implementation**

After review, stage only implementation files and commit:

```bash
git add src docs/superpowers/plans/2026-08-07-mobile-ui-embedded-qr-scanner.md
git commit -m "feat: improve mobile UI and embed QR scanner"
```
