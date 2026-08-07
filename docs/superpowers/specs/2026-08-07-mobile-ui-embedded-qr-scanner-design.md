# Mobile UI and Embedded QR Scanner Design

## Goal

Make the entire SPX operations app comfortable to use on a phone while hardcoding the live scanner URL to `https://taimesut.net`. The scanner should prefer a reusable iframe to avoid repeated page loads, while retaining a popup fallback for browsers or Google Apps Script contexts that deny camera access to embedded frames.

## Scope

- Update the shared mobile shell and all five main pages for narrow screens.
- Keep the existing SPX orange/Be Vietnam Pro visual language and light/dark themes.
- Improve touch targets, safe-area spacing, page headers, filters, forms, tables, cards, modals, and toasts.
- Remove the editable scanner URL setting from the user workflow; keep the config field readable for backward-compatible imports but ignore it at runtime.
- Update the standalone scanner protocol so it works both embedded and as a popup.

## Design

### Shared mobile shell

`MobileLayout` remains the single navigation boundary. Its top bar becomes a compact 56px header with a touch-friendly menu button, a truncated SOC label, and the theme toggle. The drawer uses a viewport-relative width capped at 320px. Page content receives consistent mobile padding and bottom safe-area space so sticky actions never cover controls.

Pages use a shared visual rhythm: compact icon eyebrow, readable title, one-line supporting copy, then the primary action or filter. Controls are at least 44px tall and retain visible keyboard focus. Existing brand colors and typography remain unchanged; the UI gains consistency through spacing, responsive stacking, and surface treatment rather than a palette rewrite.

### Responsive data and forms

The TO result view keeps the existing dense table on desktop. Below the mobile breakpoint it renders each transfer order as a readable card with the same fields and actions, avoiding forced page-wide horizontal scrolling. Long identifiers may still scroll inside their own bounded region. Search filters stack into one column on phones and become a row on larger screens.

Settings fields use one-column cards on phones. The scanner URL card becomes an informational, read-only card showing `https://taimesut.net`; save/import/reset continue to preserve unrelated configuration. The incident form uses full-width scan/capture buttons, a compact step banner, card-based incident items, and a safe-area-aware action bar.

### Scanner session architecture

The application owns one scanner session state with `mode`, `requestId`, `status`, and the iframe reference. The scanner source is a module constant (`https://taimesut.net`) and is never read from user configuration when opening a live scan.

When the user starts a scan, the app opens a full-screen mobile modal containing an iframe with `allow="camera; fullscreen"`. The iframe is created once and kept mounted after close so subsequent scans reuse the loaded document. A new scan sends:

```text
LH_TRIP_SCANNER_START { requestId, targetOrigin, mode }
```

The scanner responds with `LH_TRIP_SCANNER_READY`, then posts `LH_TRIP_SCAN_RESULT` on success or `LH_TRIP_SCANNER_ERROR` when camera startup fails. Closing or cancelling sends `LH_TRIP_SCANNER_STOP`; the scanner stops all tracks but remains loaded.

The parent accepts messages only when all of the following match: exact scanner origin (`https://taimesut.net`), the current iframe `contentWindow`, the active request ID, and an expected message type. A successful result applies to the existing LH TRIP/item state transition and closes the modal.

If the iframe does not become ready within a short timeout or reports a permission/security error, the modal presents an explicit `Open scanner window` action. The popup URL is the same hardcoded HTTPS URL with request parameters, and the existing `window.opener` result path remains available. Popup results are validated by origin, source window, request ID, and message type before applying.

The standalone scanner detects its context. In an iframe it communicates with `window.parent`, never calls `window.close()`, and handles start/stop messages. In a popup it reads request parameters, communicates with `window.opener`, and closes itself after success or cancel. Camera tracks and ZXing controls are stopped on every exit path.

## Data flow

1. User taps a scan button in the incident form.
2. Parent creates a request ID, opens/reuses the iframe, and sends `START`.
3. Scanner opens the camera and sends `READY` or `ERROR`.
4. Scanner decodes a QR/barcode and sends the result to the parent.
5. Parent validates the message, updates the form, stops the scanner, and hides the modal.
6. On iframe failure, the user can open the same session in a popup.

## Error handling

- Invalid or unexpected messages are ignored without changing form state.
- Iframe camera denial shows a concise Vietnamese explanation and the popup fallback.
- Popup blocking shows the existing permission guidance.
- Decode failures leave the current value untouched and allow retry.
- Closing the modal always stops camera tracks and clears pending session state.
- If `taimesut.net` is unavailable, the app keeps the native image-capture buttons usable.

## Verification

- Run TypeScript/Vite app build and standalone scanner build.
- Run ESLint and ensure no new warnings/errors are introduced.
- Check 360px, 390px, 768px, and desktop layouts for overflow, clipped sticky bars, and reachable controls.
- Verify table cards preserve all existing TO fields/actions.
- Verify iframe `READY`, result, cancel, timeout, and error paths with strict origin/source/request validation.
- Verify popup fallback and native image capture still work.
- Confirm the existing uncommitted SOC label change remains intact.
