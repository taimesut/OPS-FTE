# Camera Scanner Lifecycle Design

## Problem

The live LH Trip scanner briefly activates the device camera and then stops. `QRScanner` imports the legacy browser reader from `@zxing/library`, manually owns a `MediaStream`, and treats `decodeFromStream()` as though it returned the scanner controls from `@zxing/browser`. React Strict Mode also exercises effect setup and cleanup twice in development, exposing races between pending camera requests and cleanup.

## Design

Google Apps Script HTML Service blocks `getUserMedia()` inside its sandboxed iframe, so the Apps Script page must not attempt live scanning. Each scan action is a styled file input with `accept="image/*"` and `capture="environment"`. The user's click therefore opens the device's native camera UI directly. After capture, ZXing decodes the image and feeds the result into the existing LH Trip or incident-item workflow.

The native camera application owns focus, zoom, flash, and camera switching. The web page only receives the captured image. The same QR and barcode formats remain supported.

## Error Handling

Decode failures display a Vietnamese warning and leave the current form state unchanged. The file input value is reset after every attempt so the user can capture the same image again.

## Verification

- TypeScript/Vite production build succeeds.
- ESLint succeeds for the modified source.
- Opening the scanner maintains a live stream until scanning or explicit close.
- Closing, retrying, switching cameras, and Strict Mode effect replay stop only the session they own.
- Successful LH Trip scanning still fills the code, advances to item scanning, and closes the modal.
