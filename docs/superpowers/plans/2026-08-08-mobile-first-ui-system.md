# Mobile-First UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the OPS FTE presentation layer around a consistent mobile-first system that eliminates font instability, clipped Vietnamese copy, horizontal overflow, and cramped controls across every route.

**Architecture:** Add a small set of shared page/header/action primitives and a global responsive contract, then migrate the shell, TO table, pages, and overlays to those primitives. Keep all existing route, API, scanner, QR, form, and storage contracts intact; validate each visual subsystem with builds and browser QA at the specified mobile widths.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, DaisyUI 5, Lucide React, Vite 8, existing Node test runner.

## Global Constraints

- The default layout is designed for 320px wide screens and scales upward.
- No horizontal page overflow at 320px, 360px, 390px, 768px, or desktop widths.
- Remove the global `html` minimum-width behavior that creates a false horizontal canvas on narrow viewports.
- App content uses 12px horizontal gutters on mobile, 16px on tablet, and 24px on desktop.
- Interactive controls are at least 44px high/wide on touch layouts.
- Keep Be Vietnam Pro when available, with a stable Vietnamese-capable fallback stack.
- Do not change API endpoints, request payloads, route paths, scanner protocols, QR values, incident-log format, or settings data semantics.
- Desktop tables remain available from the `md` breakpoint; mobile uses equivalent card content without requiring horizontal table scrolling.
- Preserve existing `TOTable` column preference storage and QR modal contract.
- Run TypeScript compilation, ESLint, production app build, scanner build, and browser QA before completion.

---

## File Map

- Create: `src/components/PageHeader.tsx` — shared page title, icon, description, and optional action layout.
- Create: `src/components/SectionHeading.tsx` — shared section title/description/icon treatment.
- Create: `src/components/MobileActionBar.tsx` — safe-area-aware mobile action surface.
- Modify: `src/global.css` — typography, width/overflow reset, responsive tokens, shared page utility classes, and safe-area rules.
- Modify: `src/layouts/MobileLayout.tsx` — shell/header/drawer spacing and bounded SOC context.
- Modify: `src/components/TOTable.tsx` — mobile toolbar, cards, table boundary, pagination, and empty state.
- Modify: `src/components/Toast.tsx` — bounded mobile toast stack and readable close action.
- Modify: `src/components/QRCodeModal.tsx` — viewport-safe modal layout.
- Modify: `src/components/EmbeddedQRScanner.tsx` — mobile overlay controls and status wrapping.
- Modify: `src/components/QRScanner.tsx` — native scanner controls and narrow-width handling.
- Modify: `src/pages/HomePage.tsx` — remove decorative overflow-prone wrapper and use shared shell patterns.
- Modify: `src/pages/CheckSotNoiTinhPage.tsx` — migrate to shared page/header/filter/section patterns.
- Modify: `src/pages/CheckSotNgoaiTinhPage.tsx` — migrate to shared page/header/filter/section patterns.
- Modify: `src/pages/TaoBienBanSuVuPage.tsx` — step indicator, mobile forms/cards, action bar, and preview boundaries.
- Modify: `src/pages/SettingsPage.tsx` — mobile section layout, field labels, utilities, and save action bar.

## Task 1: Global responsive contract and shared primitives

**Files:**
- Create: `src/components/PageHeader.tsx`
- Create: `src/components/SectionHeading.tsx`
- Create: `src/components/MobileActionBar.tsx`
- Modify: `src/global.css`
- Modify: `src/layouts/MobileLayout.tsx`

**Interfaces:**
- `PageHeader({ icon, title, description, actions, tone })` accepts `LucideIcon`, string/ReactNode title and description, optional ReactNode actions, and a tone union.
- `SectionHeading({ icon, title, description, tone })` accepts the same icon/tone model without page-level action placement.
- `MobileActionBar({ children, className })` renders a safe-area-aware action container and preserves its children’s existing callbacks.

- [ ] **Step 1: Establish the shared primitive DOM contract**

The project has no React mount-test dependency, so use explicit DOM contract attributes for browser QA: `[data-ui="page-header"]`, `[data-ui="section-heading"]`, and `[data-ui="mobile-action-bar"]`. The implementation in the next step must emit these attributes; Task 6 verifies their presence and layout at every route. Do not add a new test dependency for presentation-only primitives.

- [ ] **Step 2: Implement shared primitives**

Use a static tone map so Tailwind can see every class and keep icon components outside render loops:

```tsx
const TONES = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
} as const;

export interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: keyof typeof TONES;
}

export const PageHeader = ({ icon: Icon, title, description, actions, tone = "primary" }: PageHeaderProps) => (
  <header data-ui="page-header" className="app-page-header">
    <div className="flex min-w-0 items-start gap-3">
      <span className={`app-icon-badge shrink-0 ${TONES[tone]}`}><Icon aria-hidden="true" /></span>
      <div className="min-w-0">
        <h1 className="app-page-title">{title}</h1>
        {description && <p className="app-page-description">{description}</p>}
      </div>
    </div>
    {actions && <div className="app-page-actions">{actions}</div>}
  </header>
);
```

`SectionHeading` uses the same tone map and `data-ui="section-heading"`; `MobileActionBar` uses `data-ui="mobile-action-bar"`, `safe-bottom`, and `md:static` so it becomes normal flow on desktop.

- [ ] **Step 3: Replace global width/font rules**

Update `src/global.css` so the root contract is explicit:

```css
html,
body,
#root {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

html { overflow-x: clip; }

body {
  margin: 0;
  font-family: "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-synthesis: none;
  line-height: 1.45;
  text-rendering: optimizeLegibility;
}

.app-page {
  width: 100%;
  max-width: 80rem;
  min-width: 0;
  margin-inline: auto;
  padding: 1rem 0.75rem calc(1.5rem + env(safe-area-inset-bottom));
}

.app-page-title { min-width: 0; overflow-wrap: anywhere; font-size: 1.5rem; line-height: 1.15; font-weight: 900; letter-spacing: -0.025em; }
.app-page-description { margin-top: 0.375rem; max-width: 60rem; color: color-mix(in srgb, currentColor 62%, transparent); font-size: 0.8125rem; line-height: 1.45; }
.app-page-header { display: flex; min-width: 0; flex-direction: column; gap: 0.875rem; border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding-bottom: 1rem; }
.app-page-actions { display: flex; min-width: 0; flex-direction: column; gap: 0.5rem; }
.app-icon-badge { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border-radius: 0.875rem; }
.app-icon-badge svg { width: 1.25rem; height: 1.25rem; }
.break-safe { overflow-wrap: anywhere; word-break: break-word; }

@media (min-width: 640px) {
  .app-page { padding-inline: 1rem; }
  .app-page-header { flex-direction: row; align-items: center; justify-content: space-between; }
  .app-page-actions { flex-direction: row; align-items: center; justify-content: flex-end; }
}

@media (min-width: 768px) {
  .app-page { padding: 1.5rem 1.5rem 2rem; }
  .app-page-title { font-size: 1.875rem; }
}
```

Keep the existing theme variables and focus-visible rules, but remove the `html { min-width: 320px; }` declaration and avoid a global `overflow-x: hidden` that would hide real local defects.

- [ ] **Step 4: Migrate `MobileLayout` to the shared shell**

Use `app-page` spacing at the page boundary, make the navbar content `min-w-0`, add a `title={currentSoc}` to the truncated SOC text, and keep drawer links at `min-h-11`. Preserve routes, active matching, theme toggle, and checkbox drawer behavior. Ensure `main` only supplies global bottom safe-area space once.

- [ ] **Step 5: Run the first validation checkpoint**

Run: `npm run build`

Expected: TypeScript and Vite build pass with the new primitives and CSS.

Run: `npm run lint`

Expected: no lint errors.

- [ ] **Step 6: Commit shared foundation**

```bash
git add src/components/PageHeader.tsx src/components/SectionHeading.tsx src/components/MobileActionBar.tsx src/global.css src/layouts/MobileLayout.tsx
git commit -m "refactor: establish mobile-first UI foundation"
```

## Task 2: Rebuild the TO table for narrow screens

**Files:**
- Modify: `src/components/TOTable.tsx`

**Interfaces:**
- Preserve `TransferOrder`, `TABLE_COLUMNS`, `TOTableProps`, `storageKey`, column localStorage, QR modal props, pagination state, and visible column semantics.

- [ ] **Step 1: Add narrow-width DOM assertions to the QA checklist**

The mobile table must expose one card per `currentOrders`, the search input, the column button, and page-size select without requiring a horizontal page scroll. The desktop table must remain under a local `overflow-x-auto` boundary.

- [ ] **Step 2: Refactor the toolbar layout**

Replace the single flex toolbar with a mobile-first grid:

```tsx
<div className="grid gap-2 border-b border-base-200 bg-base-200/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:p-4">
  <div className="relative min-w-0">
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40" />
    <input className="input input-bordered min-h-11 w-full min-w-0 rounded-xl pl-9" />
  </div>
  <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
    {/* column picker and page size */}
  </div>
</div>
```

Keep the column picker bounded by `max-w-[calc(100vw-1.5rem)]`, make labels wrap safely, and keep the page-size select `min-h-11`.

- [ ] **Step 3: Refine mobile TO cards**

Use `app-waybill-label`-style classes for the TO code, keep the QR button `min-h-11 min-w-11`, and add `break-safe` to route/operator/package/reason values. Preserve every visible column condition; when a user hides a field, that field remains absent on both mobile and desktop.

- [ ] **Step 4: Bound desktop table and pagination**

Wrap the desktop table with `max-w-full overflow-x-auto`, set the table’s minimum width locally, and keep `whitespace-nowrap` only inside the table. Change the pagination footer to `grid` on mobile so labels and buttons do not force a single overflowing row; retain the current page behavior and button callbacks.

- [ ] **Step 5: Validate TO table changes**

Run: `npm run lint && npm run build`

Expected: both pass and the table remains type-safe.

- [ ] **Step 6: Commit TO table**

```bash
git add src/components/TOTable.tsx
git commit -m "refactor: make TO table mobile-first"
```

## Task 3: Migrate home and missing-check pages

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/CheckSotNoiTinhPage.tsx`
- Modify: `src/pages/CheckSotNgoaiTinhPage.tsx`

**Interfaces:**
- Preserve `useLooseOrderCheck`, existing packed/loose request concurrency, selected Hub/SOC state, toasts, and `TOTable` storage keys.
- Consume `PageHeader`, `SectionHeading`, and `app-page` from Task 1.

- [ ] **Step 1: Simplify Home into a bounded contact surface**

Remove the rainbow aura wrapper and use an `app-page`-bounded single-column contact surface. Keep exact Zalo, hotline, and email destinations/copy; use full-width buttons with `min-h-11`, `break-safe`, and an email row that can wrap without pushing its icon out.

- [ ] **Step 2: Migrate internal missing-check page**

Replace the page-local title/header wrapper with `PageHeader`. Put Hub select and search button in `app-page-actions` so they stack on mobile and align horizontally at `sm`/`md`. Render `LooseOrderSummary`, then a `SectionHeading` for packed orders, then `TOTable`. Do not touch request construction, filters, or toast copy.

- [ ] **Step 3: Migrate external missing-check page**

Apply the same shared structure to the grouped SOC receiver page. Keep `getGroupSocsBySOC`, deduplication, route labels, and storage key unchanged. Ensure the selected SOC text can wrap in the description without widening the page.

- [ ] **Step 4: Validate home and missing-check routes**

Start local QA with `npm run dev -- --host 127.0.0.1`, then inspect `/#/`, `/#/check-sot/noi-tinh`, and `/#/check-sot/ngoai-tinh` at 320px and 390px. Verify page headers, selectors, loose-order panel, packed TO section, empty states, and no horizontal page overflow.

- [ ] **Step 5: Commit page migration**

```bash
git add src/pages/HomePage.tsx src/pages/CheckSotNoiTinhPage.tsx src/pages/CheckSotNgoaiTinhPage.tsx
git commit -m "refactor: align home and missing checks to mobile shell"
```

## Task 4: Rework incident workflow and settings

**Files:**
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Preserve incident steps, scanner callbacks, `IncidentItem` data, reason values, copy/send/print behavior, config keys, import/export JSON behavior, and reset/save semantics.
- Consume: `PageHeader`, `SectionHeading`, `MobileActionBar`.

- [ ] **Step 1: Add incident step indicator**

Render a compact three-state indicator derived directly from `step` (`lhtrip`, `scan_items`, `preview`) with accessible current-state text. Do not add a second state variable. The indicator must wrap or use three equal bounded cells at 320px.

- [ ] **Step 2: Refactor incident forms for mobile**

Use shared `PageHeader`, full-width input/action groups, and one-column reason buttons below `sm`. Add `min-w-0 break-safe` to LH TRIP and tracking code display. Preserve scanner mode callbacks and image capture inputs.

- [ ] **Step 3: Replace preview action stack with `MobileActionBar`**

Keep “Quay lại thêm đơn”, “Gửi Log”, “In biên bản”, and “Sao chép chuỗi” callbacks exactly as they are. Render the action surface in normal flow on desktop and safe-area-aware at the bottom on mobile; retain sufficient page padding so the final preview row is never covered.

- [ ] **Step 4: Refactor settings sections and save action**

Use `PageHeader`, consistent field label/description spacing, full-width controls, and `MobileActionBar` for reset/save. Keep all input values and config keys unchanged. Add explicit visible labels where a placeholder is currently doing the only explanatory work, while retaining helpful placeholders.

- [ ] **Step 5: Validate incident and settings flows**

At 320px and 390px, verify: step 1 scan/capture controls, step 2 reason list and item cards, preview action bar, print preview, settings textarea wrapping, import/export controls, reset confirmation, and save bar. Confirm no horizontal page overflow.

- [ ] **Step 6: Commit incident/settings migration**

```bash
git add src/pages/TaoBienBanSuVuPage.tsx src/pages/SettingsPage.tsx
git commit -m "refactor: optimize incident and settings for mobile"
```

## Task 5: Fix shared overlays and feedback surfaces

**Files:**
- Modify: `src/components/Toast.tsx`
- Modify: `src/components/QRCodeModal.tsx`
- Modify: `src/components/EmbeddedQRScanner.tsx`
- Modify: `src/components/QRScanner.tsx`

**Interfaces:**
- Preserve toast listener API and `showToast` signature.
- Preserve QR modal `open`, `value`, `title`, `description`, and `onClose` props.
- Preserve scanner callback contracts, camera lifecycle, popup fallback, zoom, torch, and camera-switch behavior.

- [ ] **Step 1: Bound toast stack**

Use `inset-inline` rather than a fixed right-only width on mobile, add safe-area top padding, keep `max-w-sm`, and ensure each close button is at least 44px. Make message text `min-w-0 break-words leading-snug` and keep the icon/button from shrinking.

- [ ] **Step 2: Fit QR modal to the viewport**

Use a dialog box width of `min(100%, 28rem)` inside viewport-safe padding, constrain QR size with `min(220px, 68vw)`, wrap title/description, and keep the close button above bottom safe-area padding. Preserve the exact QR value and callback.

- [ ] **Step 3: Refine embedded scanner overlay**

Keep the full-screen fixed dialog and iframe unchanged functionally. Bound the status pill by the viewport, keep the close control 44px, stack error actions at narrow widths, and use safe-area bottom padding. Ensure error copy can wrap without overlaying the iframe controls.

- [ ] **Step 4: Refine native scanner controls**

Keep video/camera behavior unchanged. Make the target responsive with `min(84vw, 18rem)` bounds, keep controls in a local bounded strip, allow zoom presets to scroll locally if necessary, and preserve reduced-motion behavior.

- [ ] **Step 5: Validate overlay states**

Run the app and inspect toast success/error, QR open/close, embedded scanner open/error/close, and native scanner control layout at 320px and 390px. Confirm modal/scanner layers do not create document-level horizontal overflow.

- [ ] **Step 6: Commit overlays**

```bash
git add src/components/Toast.tsx src/components/QRCodeModal.tsx src/components/EmbeddedQRScanner.tsx src/components/QRScanner.tsx
git commit -m "refactor: make overlays safe on mobile"
```

## Task 6: Full validation and final QA

**Files:**
- Modify only files required by validation findings.

- [ ] **Step 1: Run automated checks**

Run in order:

```bash
npm test
npm run lint
npm run build
npm run build:scanner
```

Expected: all commands exit successfully.

- [ ] **Step 2: Run responsive browser QA**

At each viewport width `320x760`, `390x844`, `768x900`, and `1280x900`, inspect all routes:

```text
/#/
/#/check-sot/noi-tinh
/#/check-sot/ngoai-tinh
/#/tao-bien-ban-su-vu
/#/cai-dat
```

For each route, read `document.documentElement.scrollWidth` and `clientWidth`; they must match after accounting for the browser’s vertical scrollbar, and no horizontal scrollbar may be visible. Check light and dark themes.

- [ ] **Step 3: Exercise interaction checklist**

Open/close drawer, navigate every link, select filters, run missing checks with empty and error states, search/filter TO cards, toggle columns, paginate, open/close QR, move through incident steps, invoke scanner overlay, save/reset/import/export settings, and verify print preview. Confirm existing API calls and data remain unchanged.

- [ ] **Step 4: Fix only verified QA regressions**

If a specific route/viewport fails, patch the smallest shared primitive or page class that owns that behavior, rerun the failing check, then rerun the full automated checks. Do not add new API/business logic while fixing visual regressions.

- [ ] **Step 5: Final commit**

```bash
git status --short
git diff --check
git commit -am "fix: polish mobile-first UI across app"
```

The final working tree must be clean and the final response must report the exact validation commands and any known limitations.

## Self-Review

- Global typography/overflow, shell, TO table, home/check pages, incident/settings, overlays, accessibility, themes, and validation each have an explicit task.
- No task changes API contracts or business state.
- Shared primitive interfaces are named before page tasks consume them.
- All steps contain concrete files, classes, commands, or interaction checks; no placeholder steps remain.
- `MobileActionBar` is used only for incident/settings actions where safe-area behavior is required; it is not introduced into unrelated pages.
