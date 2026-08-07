# Senior Mobile UI Design

## Goal

Improve the existing SPX operations app for 320-390px mobile screens with a scan-first field workflow, while preserving current routes, data behavior, desktop presentation, and the hardcoded scanner URL `https://taimesut.net`.

## Design Direction

Use a disciplined field-operations interface: compact navigation, strong text hierarchy, quiet surfaces, and one high-contrast scan action. Keep the existing Be Vietnam Pro typography and SPX orange palette, but reduce the repeated rounded-card treatment by separating page background, content panels, and primary actions.

## Responsive Contract

- No page-level horizontal overflow at 320, 360, 390, 768, or desktop widths.
- All interactive controls are at least 44px tall on touch layouts.
- Long titles, identifiers, and labels use bounded containers (`min-w-0`, truncation, or local wrapping) instead of pushing siblings off-screen.
- Sticky action areas include `env(safe-area-inset-bottom)` and never cover the last form control.
- Desktop tables remain available from the `md` breakpoint upward; mobile uses readable cards with equivalent fields and actions.

## Screen Behavior

### Shared shell

The top bar stays 56px tall with a menu control, truncated SOC context, and theme toggle. The drawer remains the navigation boundary, uses a viewport-relative width capped at 320px, and closes after navigation. Page content has consistent horizontal padding and bottom safe-area space.

### Check TO pages

Headers use a compact icon eyebrow, title, and supporting copy. Select and search controls stack full-width below `md`, then become a horizontal row on larger screens. TO results render as cards on mobile, grouping identity, route, package, quantity/weight, status, completion time, and QR action without forcing table scroll.

### Incident workflow

The LH TRIP and incident-item forms make scanning the primary action, keep image capture visible as a fallback, and use a compact step banner. Reason choices remain touch-sized and readable. Added incidents render as cards on phones. Preview actions use a safe-area-aware mobile action dock; the document preview remains printable and bounded on narrow screens.

### Settings

Settings remain one-column panels on mobile. Header utilities wrap without squeezing the title. The save action is fixed only where it helps completion, with safe-area padding and enough page bottom space. The scanner URL is informational/read-only and continues to display `https://taimesut.net`.

### Modal and feedback surfaces

QR modals and the embedded scanner are constrained to the viewport, preserve focus visibility, and account for top/bottom safe areas. Toasts use a bounded mobile width, readable line wrapping, and a close target that remains reachable at the screen edge.

## Component and Performance Boundaries

- Keep the iframe scanner mounted for session reuse.
- Extract mobile TO cards and other repeated static UI outside parent render functions.
- Avoid new global listeners per item and avoid inline component definitions.
- Derive display state during render where possible; use stable callbacks for scanner and item actions.

## Validation

Run TypeScript, ESLint, app build, and scanner build. Manually inspect the responsive contract at 320/360/390/768px and desktop, including scanner open/close, QR modal, settings save bar, pagination, and print preview.
