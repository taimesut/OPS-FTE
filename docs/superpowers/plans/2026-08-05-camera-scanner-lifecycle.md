# Camera Scanner Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably capture and decode LH Trip and incident barcodes inside the Google Apps Script iframe.

**Architecture:** The Apps Script page uses native `capture="environment"` file inputs because its sandbox blocks live `getUserMedia()`. A focused barcode utility decodes each captured image with ZXing and returns the text to the existing workflow.

**Tech Stack:** React 19, TypeScript 6, Vite 8, `@zxing/browser` 0.2, MediaDevices API

## Global Constraints

- Preserve all supported barcode formats.
- Native camera zoom, torch, and camera switching are controlled by the device camera application.
- Do not remove React Strict Mode.
- Cleanup must be safe before, during, and after asynchronous initialization.

---

### Task 1: Stabilize the live scanner lifecycle

**Files:**
- Create: `src/utils/camera.ts`
- Modify: `src/components/QRScanner.tsx`
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`

**Interfaces:**
- Consumes: `onScan(value: string): void`
- Produces: A live scanner session that remains active until cleanup and calls `onScan` once per distinct decoded value.

- [x] **Step 0: Request initial permission from the scan button**

Export the shared camera request/error helpers, request the initial stream directly inside both scan-button click paths, and pass it into `QRScanner`.

- [x] **Step 1: Switch to the ZXing Browser reader API**

Import `BrowserMultiFormatReader` and `IScannerControls` from `@zxing/browser`; retain barcode enums and decode hints from `@zxing/library`.

- [x] **Step 2: Make session setup and cleanup race-safe**

Create one local stream and controls reference per effect run. Reset capability state at session start, reject stale asynchronous completion, and make cleanup stop controls, tracks, and the video source safely.

- [x] **Step 3: Preserve scanner behavior**

Keep the existing result de-duplication, vibration, formats, capability discovery, zoom, torch, retry, camera switching, and error messages.

- [x] **Step 4: Run static verification**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully.

Run: `npm run lint`

Expected: ESLint completes with no errors introduced by `QRScanner.tsx`.

- [x] **Step 5: Review the modal integration**

Confirm a successful LH Trip scan still uppercases the code, changes the page step to `scan_items`, shows the success toast, and unmounts the scanner modal.

- [x] **Step 6: Add zoom fallback**

Use track constraints for native zoom. When the track exposes no zoom capability, apply a bounded visual scale to the video preview and keep the 1x-4x controls operational.

### Task 2: Apps Script native camera capture

**Files:**
- Create: `src/utils/barcode.ts`
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`
- Generate: `dist/index.html`
- Package: `gas/index.html`

- [x] **Step 1: Replace live scanner buttons with native capture inputs**

Use `accept="image/*"` and `capture="environment"` so the click opens the mobile device camera without `getUserMedia()`.

- [x] **Step 2: Decode captured images**

Decode QR, Code 128, Code 39, EAN, UPC, Data Matrix, and ITF images with ZXing and return normalized text to the existing LH Trip/item state transitions.

- [x] **Step 3: Verify and package**

Run the production build and targeted lint, then copy the single-file output to the Apps Script `gas/index.html` artifact.
