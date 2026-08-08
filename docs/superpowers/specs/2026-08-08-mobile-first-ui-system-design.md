# Mobile-First UI System Design

## Goal

Rebuild the presentation layer of the entire OPS FTE app around a consistent mobile-first system. The update targets font instability, clipped Vietnamese copy, horizontal overflow, cramped controls, and inconsistent action surfaces while preserving all existing routes, API calls, scan behavior, form behavior, and business rules.

## Audience and Primary Job

The audience is SOC field staff using a phone while moving between operational tasks. The primary job is to identify the next action quickly, read shipment identifiers without guessing, and complete scanning, checking, logging, and settings flows with one hand.

## Scope

Apply the visual system to:

- `MobileLayout` and the shared shell.
- Home/contact page.
- Internal and external missing-check pages.
- Incident-report workflow.
- Settings page.
- `TOTable`, toast notifications, QR modal, embedded scanner, and native scanner.

Do not change API endpoints, request payloads, route paths, scanner protocols, QR values, incident-log format, or settings data semantics.

## Visual Direction

Use a field-operations interface: quiet surfaces, high legibility, and strong action hierarchy. The SPX orange remains the operational accent; it is reserved for primary actions and important statuses rather than every decorative surface.

### Palette

- SPX primary: `#F53D2D`.
- SPX secondary: `#FF6A00`.
- Success: existing DaisyUI success token for completed/packed states.
- Warning: existing DaisyUI warning token for DG and caution states.
- Error: existing DaisyUI error token for failures and high-value emphasis.
- Surfaces: existing `base-100`, `base-200`, and `base-300` tokens with subtle borders and low shadows.

### Typography

- Keep Be Vietnam Pro when available, with a stable Vietnamese-capable fallback stack: `system-ui`, `-apple-system`, `Segoe UI`, sans-serif.
- Disable synthetic font faces and use a consistent body line-height.
- Use a restrained type scale: page title 24px mobile/30px desktop, section title 17–18px, body 14–16px, metadata 11–13px.
- Use tabular numerals for metrics and mono text for shipment IDs, TO codes, LH TRIP codes, and generated incident strings.
- Long user/API values must use bounded containers with `min-width: 0`, `overflow-wrap: anywhere`, or intentional truncation with accessible full text.

### Signature element

Shipment identifiers and route contexts use a compact “waybill label” treatment: mono text, a small context label, and a clear route/status accent. This is the one distinctive visual device; surrounding cards remain quiet so field data stays dominant.

## Responsive Contract

- The default layout is designed for 320px wide screens and scales upward.
- No horizontal page overflow at 320px, 360px, 390px, 768px, or desktop widths.
- Remove the global `html` minimum-width behavior that creates a false horizontal canvas on narrow viewports; use `width: 100%`, `min-width: 0`, and local overflow boundaries instead.
- App content uses 12px horizontal gutters on mobile, 16px on tablet, and 24px on desktop.
- Interactive controls are at least 44px high/wide on touch layouts.
- Header, drawer, modal, toast, and sticky actions account for `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- A long label never pushes a sibling icon or button off-screen.
- Desktop tables remain available from the `md` breakpoint; mobile uses equivalent card content without requiring horizontal table scrolling.
- Light and dark themes use the same spacing and type rules and retain sufficient contrast.

## Shared Shell

`MobileLayout` becomes the single page frame:

- A 56px sticky top bar with a 44px menu button, bounded SOC context, and theme toggle.
- The SOC context truncates inside a `min-width: 0` flex region and exposes the full value through an accessible title/label.
- Drawer links remain touch-sized, use a clear active state, and close after navigation.
- Main content owns the responsive gutter and bottom safe-area padding; child pages do not need to recreate shell spacing.
- Shared page patterns are extracted where they reduce duplication: page header, section heading, surface/card, empty state, and mobile action bar.

## Screen Designs

### Home/contact

Keep the contact actions prominent but remove unnecessary rainbow/aura decoration that competes with the action. Use a bounded single-column card with readable Zalo, hotline, and email rows. Each action remains full-width and touch-sized, and the email wraps safely.

### Missing-check pages

The page order is:

```text
Page header
Destination selector
Primary search action
Loose-order summary
Packed-TO section
```

- Selectors and search stack full-width on mobile; they become a compact row at `md`.
- The loose-order summary keeps the fixed route context, three metrics, loading, empty, and inline error states readable at 320px.
- The packed-TO section has its own heading so users can distinguish loose orders from packed TOs.
- `TOTable` uses cards on mobile and preserves the current full table on desktop.
- The mobile toolbar places search, column selection, and page-size controls in separate rows or bounded flex groups; no control is squeezed below a readable width.
- TO cards use the waybill-label pattern for the TO code and wrap route/operator/package fields.
- Pagination buttons remain full-width or evenly sized on mobile and do not create an overflow row.

### Incident report

- Keep the three workflow states (`lhtrip`, `scan_items`, `preview`) but add a compact step indicator and a clear current-step heading.
- LH TRIP and tracking inputs are full-width, high-contrast, and mono.
- Live scan and image capture actions are full-width stacked buttons on mobile.
- Reason choices use a one-column list below narrow widths and two columns only when each option remains readable.
- Incident items are cards with a bounded code, readable reason, and 44px remove action.
- Preview/send/print/copy actions use a safe-area-aware bottom action surface only where needed; it must not cover the last content row.
- Printed preview retains a dedicated print layout and an intentional local horizontal scroll only inside the print table if required.

### Settings

- Use one-column sections with consistent label, description, field, and validation spacing.
- Inputs and textareas are full-width and never rely on placeholder text as the only label.
- Long cookie, webhook, and group configuration values wrap in their fields without widening the page.
- Header utilities wrap cleanly; no button competes with the page title.
- The save action is a mobile bottom action surface with enough page padding below the final field; on desktop it returns to normal document flow.
- Reset, import, and export controls remain discoverable but secondary to save.

### QR modal and scanners

- QR modal width is bounded by the viewport, its title and description wrap, and its close action remains visible above the safe-area inset.
- Embedded scanner is a full-screen dialog with a 44px close control, bounded status pill, and error actions that stack on narrow screens.
- Native scanner controls use touch-sized targets and a bounded control strip; zoom presets may scroll locally but never widen the page.
- Scanner overlays respect reduced-motion preferences and preserve the existing camera lifecycle.

### Toasts and shared states

- Toasts use a viewport-bounded container, safe-area padding, readable wrapping, and a 44px close target.
- Empty states explain the next action in one short sentence.
- Errors name the failed action and the next recovery step; they do not rely on clipped text or vague copy.
- Loading states preserve layout dimensions to avoid content jumps.

## Component Boundaries

- Add shared layout primitives only where at least two screens need the same behavior.
- Keep data fetching and business state in existing pages/hooks; UI primitives accept data and callbacks.
- Keep repeated static components outside parent render functions.
- Prefer CSS utility classes and a small set of global tokens over page-specific ad hoc CSS.
- Preserve the existing `TOTable` column preference storage and QR modal contract.

## Accessibility and Interaction

- Every icon-only action has an accessible label.
- Focus-visible outlines remain clear in light and dark themes.
- Buttons, selects, inputs, and drawer links are keyboard reachable and touch-sized.
- Status changes use appropriate `aria-live` regions without duplicating announcements.
- Text remains readable at increased browser font size without horizontal page overflow.

## Validation

- Run TypeScript compilation, ESLint, production app build, and scanner build.
- Manually inspect every route at 320px, 390px, 768px, and desktop widths.
- Check long Vietnamese headings, long SOC/Hub names, long TO/LH TRIP codes, long incident reasons, cookie/webhook values, and error messages.
- Verify light/dark theme contrast.
- Verify QR modal open/close, embedded scanner open/close/error, native scanner controls, drawer navigation, table pagination, column selection, settings save/reset/import/export, incident preview, copy, send, and print.
- Confirm no API request or business behavior changes beyond the existing loose-order feature already implemented.

## Non-goals

- No station-ID mapping changes.
- No API redesign or backend changes.
- No replacement of the existing scanner protocol.
- No new navigation information architecture.
- No new visual assets required.
