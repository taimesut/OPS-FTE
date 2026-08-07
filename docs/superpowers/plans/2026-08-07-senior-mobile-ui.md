# Senior Mobile UI Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with checkpoints. Steps use checkbox syntax for tracking.

**Goal:** Make the SPX operations app robust and senior-level on 320-390px screens with a scan-first field workflow, without changing routes or business behavior.

**Architecture:** Preserve the current React/Vite/DaisyUI structure. Improve the shared shell and global responsive primitives first, then update data-heavy pages, incident workflow, and feedback surfaces. Keep desktop table/print behavior and the reusable `EmbeddedQRScanner` session intact.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, DaisyUI, Lucide React, Vite.

## Global Constraints

- No page-level horizontal overflow at 320, 360, 390, 768, or desktop widths.
- Touch controls are at least 44px tall.
- Keep `SCANNER_URL` equal to `https://taimesut.net` and preserve iframe reuse.
- Preserve current routes, API behavior, and the user’s `SettingsPage.tsx` label change.
- Keep desktop TO tables and printable incident preview available from `md` upward.
- Respect safe-area insets, keyboard focus, and reduced-motion preferences.

---

### Task 1: Normalize the responsive shell

**Files:**
- Modify: `src/layouts/MobileLayout.tsx`
- Modify: `src/global.css`

**Produces:** A 56px shell header, bounded drawer, stable page padding, safe-area utilities, and no overflow from long SOC labels.

- [ ] **Step 1:** Add shared CSS variables/utilities for page gutters, safe-area bottom padding, and surface borders; keep existing theme colors intact.
- [ ] **Step 2:** Update the header title wrapper with `min-w-0`, `truncate`, and a compact SOC context label; keep menu and theme controls at 44px.
- [ ] **Step 3:** Set drawer width to `min(86vw, 20rem)` with safe-area-aware padding and close-on-navigation behavior.
- [ ] **Step 4:** Ensure the main content wrapper has bottom padding for mobile action docks and `overflow-x: clip` only at the shell boundary.
- [ ] **Step 5:** Run `npm run lint` and `node node_modules/typescript/lib/tsc.js -b`.

### Task 2: Refine check pages and mobile TO cards

**Files:**
- Modify: `src/pages/CheckSotNoiTinhPage.tsx`
- Modify: `src/pages/CheckSotNgoaiTinhPage.tsx`
- Modify: `src/components/TOTable.tsx`

**Produces:** Scan-readable page headers, stacked mobile filters, and TO cards with parity to desktop table fields/actions.

- [ ] **Step 1:** Give each check-page header a bounded title/copy column and stack filters full-width below `md`.
- [ ] **Step 2:** Extract/adjust the mobile `TransferOrderCard` outside the parent component; show TO number, route, package, quantity/weight, status, completion time, and QR action.
- [ ] **Step 3:** Keep column preferences, filtering, pagination, and QR modal behavior unchanged; render dense table only at `md` and above.
- [ ] **Step 4:** Bound long identifiers locally with wrapping or horizontal scrolling inside the identifier region.
- [ ] **Step 5:** Run `npx eslint src/pages/CheckSotNoiTinhPage.tsx src/pages/CheckSotNgoaiTinhPage.tsx src/components/TOTable.tsx`.

### Task 3: Rework the incident workflow for thumb-first mobile use

**Files:**
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`

**Produces:** Compact step hierarchy, prominent scan actions, readable incident cards, and a safe-area-aware preview action dock.

- [ ] **Step 1:** Add `min-w-0` and bounded text to the page header, LH TRIP banner, and preview headings.
- [ ] **Step 2:** Keep scan and image-capture actions full-width on narrow screens; make scan the first/primary action and preserve native capture fallback.
- [ ] **Step 3:** Keep reason choices at 44px minimum with concise wrapping and a visible selected state.
- [ ] **Step 4:** Ensure incident cards do not overflow on long tracking codes and keep remove controls touch-sized.
- [ ] **Step 5:** Convert preview toolbar to a mobile action dock with safe-area padding and reserve matching page bottom space; retain normal toolbar on desktop.
- [ ] **Step 6:** Bound the printable report table locally so print output remains unchanged while screen layouts stay within the viewport.
- [ ] **Step 7:** Run `npx eslint src/pages/TaoBienBanSuVuPage.tsx`.

### Task 4: Improve Settings, Home, modal, toast, and scanner surfaces

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/components/QRCodeModal.tsx`
- Modify: `src/components/Toast.tsx`
- Modify: `src/components/EmbeddedQRScanner.tsx`

**Produces:** Reliable narrow-screen surfaces with safe-area handling and clear action hierarchy.

- [ ] **Step 1:** Let Settings header utilities wrap below the title without squeezing it; keep one-column cards and reserve space for the save bar.
- [ ] **Step 2:** Make the Settings save action sticky only on mobile, with `safe-bottom`, readable label/icon spacing, and no content occlusion.
- [ ] **Step 3:** Keep the Home contact card within `100vw`, reduce decorative padding at 320px, and preserve contact tap targets.
- [ ] **Step 4:** Constrain QR modal width/height to dynamic viewport units, scale QR safely, and keep close action reachable.
- [ ] **Step 5:** Position toasts within viewport gutters and safe-area top inset; prevent close button/content collision.
- [ ] **Step 6:** Make scanner overlay controls safe-area aware and keep iframe mounted/reusable; preserve popup fallback and message validation.
- [ ] **Step 7:** Run focused lint on all modified files.

### Task 5: Verify, inspect, and commit

**Files:**
- Verify: all files from Tasks 1-4

- [ ] **Step 1:** Run `node node_modules/typescript/lib/tsc.js -b`.
- [ ] **Step 2:** Run `npm run lint`.
- [ ] **Step 3:** Run `npm run build` and `npm run build:scanner`.
- [ ] **Step 4:** Inspect source for page-level `overflow-x-auto`, missing `min-w-0`, unsafe fixed bars, and controls below 44px.
- [ ] **Step 5:** Run `git diff --check` and confirm `SettingsPage.tsx` retains the existing “Tên SOC” label.
- [ ] **Step 6:** Stage only the plan and implementation files, then commit with `feat: refine senior mobile UI`.
