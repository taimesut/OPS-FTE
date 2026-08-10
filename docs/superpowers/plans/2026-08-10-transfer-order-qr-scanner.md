# Transfer Order QR Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen QR scan action to the `Lấy mã TO` page that fills the shipment input without automatically submitting the lookup.

**Architecture:** Reuse `EmbeddedQRScanner` in `item` mode and keep scanner state local to `LayMaTOPage`. The scan callback only closes the scanner, trims the scanned value, updates the input, and shows a toast; the existing form submission remains the sole path that calls the Fleet Order API.

**Tech Stack:** React 19, TypeScript 6, EmbeddedQRScanner, Lucide React, Tailwind CSS/DaisyUI, Vite

## Global Constraints

- Only change `src/pages/LayMaTOPage.tsx` for feature source.
- Reuse `EmbeddedQRScanner`; do not modify scanner internals.
- Use `ScanMode` value `item`.
- Scanning must not call `fetchTransferOrderNumber`, submit the form, or open the TO result modal.
- A blank scanned value must not overwrite the current input.
- Closing the scanner must preserve input and the latest successful TO result.
- Disable the scan button while the TO request is loading.
- Preserve all unrelated dirty and untracked files.

---

### Task 1: Integrate the scanner into the lookup page

**Files:**
- Modify: `src/pages/LayMaTOPage.tsx`

**Interfaces:**
- Consumes: `EmbeddedQRScanner`, `ScanMode`, `showToast`, and the existing `shipmentId`, `loading`, and result states.
- Produces: Local `scannerMode` state, `handleScan(value, mode)`, and a `Quét QR` secondary action.

- [ ] **Step 1: Confirm the scanner contract is absent**

Run:

```powershell
rg -n "EmbeddedQRScanner|scannerMode|handleScan|Quét QR" src/pages/LayMaTOPage.tsx
```

Expected: No matches and exit code `1`.

- [ ] **Step 2: Add scanner imports**

Change the Lucide import to:

```tsx
import { PackageCheck, QrCode, ScanLine, Search } from "lucide-react";
```

Add:

```tsx
import EmbeddedQRScanner, {
  type ScanMode,
} from "../components/EmbeddedQRScanner";
```

- [ ] **Step 3: Add scanner state and a non-submitting scan handler**

After the existing modal state, add:

```tsx
const [scannerMode, setScannerMode] = useState<ScanMode | null>(null);
```

Before `handleLookup`, add:

```tsx
const handleScan = (value: string) => {
  const normalizedValue = value.trim();
  setScannerMode(null);
  if (!normalizedValue) return;

  setShipmentId(normalizedValue);
  showToast(`Đã nhận mã đơn: ${normalizedValue}`, "success");
};
```

The handler must contain no call to `fetchTransferOrderNumber`, `handleLookup`, `setQrOpen`, or form submission.

- [ ] **Step 4: Render the existing full-screen scanner**

Insert as the first child of the page wrapper:

```tsx
<EmbeddedQRScanner
  open={scannerMode !== null}
  mode={scannerMode}
  onScan={handleScan}
  onClose={() => setScannerMode(null)}
/>
```

- [ ] **Step 5: Replace the single action with a responsive action grid**

Replace the current submit button with:

```tsx
<div className="grid gap-2 sm:grid-cols-2">
  <button
    type="submit"
    disabled={loading}
    className="btn btn-primary min-h-12 w-full gap-2 rounded-xl shadow-xs"
  >
    {loading ? (
      <>
        <span className="loading loading-spinner loading-sm" />
        Đang lấy mã TO
      </>
    ) : (
      <>
        <Search className="h-4 w-4" aria-hidden="true" />
        Lấy mã TO
      </>
    )}
  </button>

  <button
    type="button"
    onClick={() => setScannerMode("item")}
    disabled={loading}
    className="btn btn-outline min-h-12 w-full gap-2 rounded-xl"
  >
    <ScanLine className="h-5 w-5" aria-hidden="true" />
    Quét QR
  </button>
</div>
```

- [ ] **Step 6: Audit the callback and compile the page**

Run:

```powershell
rg -n "EmbeddedQRScanner|scannerMode|handleScan|Quét QR|setScannerMode\(\"item\"\)" src/pages/LayMaTOPage.tsx
```

Expected: Imports, state, handler, scanner render, and button each appear.

Run: `npx eslint src/pages/LayMaTOPage.tsx`

Expected: PASS.

Run: `npm run build`

Expected: PASS without TypeScript or React errors.

- [ ] **Step 7: Commit the scanner integration**

```bash
git add src/pages/LayMaTOPage.tsx
git commit -m "feat: scan shipment QR for TO lookup"
```

### Task 2: Regression checks, packaging, and mobile QA

**Files:**
- Verify: `src/pages/LayMaTOPage.tsx`
- Modify mechanically but keep separate from source commit when unrelated source is dirty: `gas/index.html`

**Interfaces:**
- Consumes: Completed scanner integration and current production build.
- Produces: Verified mobile scan entry point and an Apps Script-ready bundle.

- [ ] **Step 1: Run repository checks**

Run: `npm test`

Expected: All tests PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Package the current app for Apps Script**

Run:

```powershell
Copy-Item -LiteralPath 'dist\index.html' -Destination 'gas\index.html' -Force
```

Expected: `gas/index.html` includes `Quét QR`, `LH_TRIP_SCANNER_START`, and `/lay-ma-to`.

Do not commit `gas/index.html` if its build also includes unrelated dirty source such as `HomePage.tsx`; report that it is deploy-ready but intentionally uncommitted.

- [ ] **Step 3: QA at a phone viewport**

Run: `npm run dev -- --host 127.0.0.1`

Open: `http://127.0.0.1:5173/#/lay-ma-to` at 390 × 844.

Verify:

```text
- Lấy mã TO and Quét QR are both 48px or taller and do not overflow.
- Quét QR opens the full-screen scanner in item mode.
- Closing the scanner returns to the unchanged input.
- A scan result fills the input and shows “Đã nhận mã đơn”.
- No API request starts merely because a value was scanned.
- The existing Lấy mã TO button remains the only lookup submit action.
```

- [ ] **Step 4: Confirm unrelated user files remain untouched**

Run: `git status --short`

Expected: The scanner source is committed; pre-existing changes in `gas/code.gs`, `gas/index.html`, `HomePage.tsx`, skill files, archives, and lock files remain separate.
