# Internal Hub Overview: mobile table and per-Hub refresh

## Goal

Make the internal Hub overview easier to scan on a phone and allow an operator to refresh one Hub without reloading every Hub. The existing all-Hub check remains available with its two-minute cooldown.

## Approved interaction

- The existing **Kiểm tra toàn bộ** action continues to fetch every configured Hub, with the persisted two-minute cooldown.
- Every Hub row gets its own reload action. A targeted reload:
  - validates the current SOC, cookie, and Hub configuration before starting;
  - fetches only that Hub's loose-order and packed-order branches in parallel;
  - updates only that Hub row, preserving the other rows and stale branch data;
  - has an independent persisted 15-second cooldown keyed by Hub station ID (with the Hub name as a fallback when no ID exists);
  - shows a spinner while running, then a countdown such as `Làm mới sau 00:09` while locked;
  - reports success or partial branch failure without changing the all-Hub cooldown.
- Targeted reload is disabled while the all-Hub run is active, and the all-Hub action is disabled while a targeted reload is active. This prevents two refresh modes from racing over the same row state. Other Hub rows remain readable during a targeted refresh.
- Opening TO detail continues to use the latest successful packed result and does not trigger another request.

## Mobile presentation (selected mockup C)

At widths below the existing `md` breakpoint, the overview becomes a compact semantic table rather than a stack of cards:

| Hub / trạng thái | Xá lẻ | Đóng bao | Kiện | Thao tác |
| --- | ---: | ---: | ---: | --- |
| Hub name, status, last update, detail action | total + DG/GTC subline | TO + DG/GTC subline | quantity | per-Hub reload |

- The Hub column wraps long names safely and includes status, last update, and the existing TO-detail action.
- Xá lẻ shows the total as the primary value and `DG · GTC` as a compact secondary line.
- Đóng bao shows `TO` as the primary value and `DG · GTC` as a compact secondary line.
- Unavailable branch data remains `—`; stale/error messages remain visible below the relevant row.
- The reload control has an accessible Hub-specific label, a minimum 44px touch target, and a visible spinner/countdown state.
- The table uses compact spacing and fixed semantic column headers, with no horizontal page overflow. Long text wraps inside cells; the table may use a narrow internal overflow fallback only if the viewport cannot fit the minimum action target.
- Desktop (`md` and above) keeps the existing grouped table layout and gains the same per-Hub reload action in its action area.
- The total footer remains available on both breakpoints.

## State and data flow

1. Extract a shared single-Hub refresh path from the existing page-level all-Hub task.
2. The shared path calls `fetchHubOverviewBranches`, merges `loose` and `packed` independently, finishes the row, and increments the packed result generation only when packed succeeds.
3. The all-Hub scheduler uses the shared path with its current max-three worker limit. Each task also starts the 15-second per-Hub cooldown so an immediate duplicate targeted request is blocked.
4. Targeted refresh uses the same path for one Hub and does not change the two-minute all-Hub timestamp.
5. A per-Hub cooldown helper stores a small JSON map in localStorage, ignores malformed/future entries, and tolerates storage failures like the existing global cooldown helper.
6. Cooldown state is derived from current time on a one-second tick; no interval runs when no cooldown is active.

## Error handling

- Validation errors do not start either cooldown and do not issue requests.
- Packed and loose failures remain independent. A failed branch shows an error and preserves a previous successful branch as stale data.
- A targeted request failure leaves other Hub rows unchanged.
- Unmount/generation guards prevent late requests from mutating the page.
- All refresh buttons expose disabled/loading feedback and do not silently accept a click during their respective lockout.

## Verification

- Add utility tests for the 15-second per-Hub cooldown: persistence, exact expiry, malformed/future values, and storage failures.
- Preserve and extend existing Overview model/API tests for branch isolation and scheduler behavior.
- Run focused tests, the full test suite, ESLint, TypeScript/Vite production build, and `git diff --check`.
- Perform mobile and desktop browser QA at the existing breakpoints, checking no page-level horizontal overflow, readable rows, accessible reload labels, and correct cooldown feedback.
