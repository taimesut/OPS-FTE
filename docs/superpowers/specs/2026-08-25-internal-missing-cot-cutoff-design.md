# Internal Missing Check COT Cutoff Design

**Date:** 2026-08-25

## Goal

Add an optional, locally persisted COT cutoff to the internal missing-check page. When enabled, loose-order queries are bounded to the selected COT and the preceding calendar month, while packed transfer orders are retained only when the latest tracking event with status `882` occurred at or before the selected COT.

## Scope

This feature applies only to the `Check sót nội tỉnh` page.

- Preserve the current search behavior when COT is disabled.
- Persist both the enabled state and selected local date/time in `localStorage`.
- Apply COT independently to the loose-order and packed-TO branches.
- Do not change the external missing-check page, internal overview pages, TO lookup page, or Google Apps Script proxy contract.

## User Interface

Add a COT control surface below the page header and before the result sections.

- The switch label is `Cắt COT`.
- On first enable, if no valid saved time exists, initialize the input to the current local date and time, at minute precision.
- When disabled, the date/time input is hidden or disabled and the supporting text states `Đang kiểm tra toàn bộ dữ liệu`.
- When enabled, show a `datetime-local` input and a Vietnamese-formatted summary of the active cutoff.
- Desktop lays out the switch, input, and supporting text on one row where space permits.
- Mobile stacks the switch above a full-width date/time input.
- While a search is running, disable the COT switch, date/time input, Hub selector, and search button so one run cannot mix multiple criteria.
- During packed-TO cutoff work, show progress as `Đang kiểm tra COT: processed/total TO`.
- On completion, report `Giữ lại retained/total TO trước COT` and render only retained TOs.

The storage record is versioned so malformed or future values can fall back safely. It contains the enabled boolean and the selected local date/time value. A valid stored value is restored when the page opens.

## Time Semantics

The input represents local wall-clock time on the user's device and is converted to Unix seconds for API requests and comparisons.

- COT is inclusive: a TO with latest status-`882` timestamp equal to the cutoff is retained.
- Loose-order range end is the selected COT.
- Loose-order range start is one calendar month before the selected COT, preserving local time.
- Calendar-month subtraction clamps to the last valid day of the target month. For example, subtracting one month from March 31 produces the last valid day in February rather than overflowing into March.
- Search is blocked with a warning when COT is enabled but the date/time is empty or invalid.

## Loose-Order Data Flow

The existing POST request remains:

```text
/api/fleet_order/order/tracking_list/search
```

When COT is disabled, preserve the current payload exactly. When COT is enabled, add:

```json
{
  "current_station_received_time": "<one-calendar-month-before-cot>,<cot>"
}
```

Both values are integer Unix seconds. The existing `current_station_ids`, `next_station_ids`, `order_status`, `page_no`, and `count` fields remain unchanged.

## Packed-TO Data Flow

First fetch and station-filter packed TOs exactly as the page does now:

```text
GET /api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=<hub>&status=2&ctime=<seven-days-ago>,<now>
```

When COT is disabled, publish that filtered list without additional requests.

When COT is enabled, process the station-filtered list with a concurrency limit of five TOs. Each TO uses this pipeline:

1. Request its detail:

   ```text
   GET /api/in-station/general_to/detail/search?to_number=<to_number>&pageno=1&count=10
   ```

2. Read the first entry in `response.data.data.list` and normalize its `fleet_order_id` as the representative shipment ID. The API contract guarantees at least one order.
3. Request tracking information:

   ```text
   GET /api/fleet_order/order/detail/tracking_info?shipment_id=<fleet_order_id>
   ```

4. Traverse every entry in `response.data.data.tracking_list`, recursively including each entry's `children` and `event_children` arrays.
5. Among all entries whose numeric status is `882`, select the greatest valid integer `timestamp`. The API contract guarantees at least one such event.
6. Retain the TO when `latest882Timestamp <= cotTimestamp`; exclude it otherwise.

The worker pool must never run more than five TO pipelines concurrently. The returned retained list preserves the original outbound-search order even though pipelines finish out of order. Progress advances once per completed TO pipeline.

## Component and Module Boundaries

Keep pure domain work outside the page component:

- A cutoff utility owns local date/time parsing, calendar-month subtraction, payload range formatting, and versioned local-storage parsing/serialization.
- A transfer-order COT utility owns response parsing, recursive status-`882` extraction, inclusive filtering, and the concurrency-limited mapper.
- An API utility owns the two GET requests needed for one TO's latest `882` timestamp.
- `useLooseOrderCheck` accepts an optional received-time range and passes it to the existing loose-order API utility.
- `CheckSotNoiTinhPage` owns UI state, persistence, progress presentation, branch orchestration, and user notifications.

Each pure utility accepts unknown API data defensively and returns normalized values or a descriptive error. The page does not duplicate response-shape knowledge.

## Error Handling and Consistency

- Do not silently exclude a TO when its detail or tracking request fails.
- If any packed-TO COT pipeline fails, fail the packed branch as a whole, include the affected TO number in the error, and leave the previous successful TO result visible.
- Do not publish an uncut or partially cut TO list while a COT-enabled packed search is running.
- The loose-order and packed-TO branches remain independent through settled-promise orchestration. One branch may succeed and update while the other reports an error.
- Existing global cookie and network error behavior remains in place. Per-request COT errors are normalized so the page can add TO context without emitting a misleading partial-success message.
- Disable mutable search criteria during a run to prevent stale or mixed results.

## Testing

Add focused tests for:

- preserving the existing loose-order payload when COT is disabled;
- adding `current_station_received_time` when enabled;
- local calendar-month subtraction, including end-of-month clamping;
- rejecting empty or invalid enabled COT values;
- safe parsing and restoration of versioned local-storage values;
- finding status `882` at the tracking-list root, in `children`, and in `event_children`;
- selecting the greatest status-`882` timestamp;
- retaining equality and excluding timestamps after COT;
- enforcing a maximum concurrency of five;
- preserving outbound-list order despite out-of-order completion;
- rejecting a packed branch with the failing TO number rather than returning partial results;
- source-level UI contracts for the switch, local date/time input, progress, and disabled search controls.

Run the targeted tests, the repository test suite, TypeScript/build checks, lint, and desktop/mobile visual verification. Preserve the two unrelated uncommitted user edits currently present in `src/layouts/MobileLayout.tsx` and `src/pages/HomePage.tsx`.

## Acceptance Criteria

- With COT off, internal missing checks behave as before and make no per-TO detail/tracking requests.
- With COT on, loose-order search uses the selected inclusive end and one-calendar-month start.
- With COT on, packed results contain only TOs whose latest recursive status-`882` timestamp is at or before the selected COT.
- No more than five TO pipelines run concurrently, progress is visible, and result order is stable.
- COT enabled state and time survive reloads.
- Invalid inputs and API failures never produce a silently incomplete packed result.
- The control is usable and readable on both desktop and mobile.
