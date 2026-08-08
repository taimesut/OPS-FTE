# Loose-Order Missing Check Design

## Goal

Extend both missing-check pages so one search reports unpacked loose orders in addition to the existing packed Transfer Order results. The loose-order section shows the API total and separate counts for dangerous-goods and high-value orders.

## Scope

- Apply to `CheckSotNoiTinhPage` and `CheckSotNgoaiTinhPage`.
- Preserve the existing packed-TO request, filtering, table, QR actions, and user settings.
- Add a shared loose-order request and a shared summary presentation.
- Do not display a loose-order detail list in this iteration.
- Do not add station-ID settings in this iteration.

## Request Contract

Send a `POST` request through the existing `apiClient` to:

```text
/api/fleet_order/order/tracking_list/search
```

Use this temporary fixed payload on both pages:

```json
{
  "count": 1000,
  "current_station_ids": "1030",
  "next_station_ids": "1069",
  "order_status": "8",
  "page_no": 1
}
```

`1030` represents Pleiku SOC and `1069` represents 44-GLI An Khe Hub. Until a complete station-name-to-ID mapping is available, the loose-order result does not follow the selected Hub or SOC. Both pages therefore show the same fixed-route loose-order summary.

## Data Model and Counting Rules

Treat a successful response as `retcode === 0` with a `data` object. Normalize absent or non-array `data.list` values to an empty list.

The summary contains three independent values:

- **Total loose orders:** use `data.total`; fall back to the normalized list length only when `data.total` is not a finite number.
- **DG orders:** count list items whose numeric `dg_type !== 0`.
- **High-value orders:** count list items whose numeric `high_value !== 0`.

DG and high-value counts are independent. An order satisfying both conditions contributes to both counters. Zero and missing values do not contribute to either specialized counter.

The endpoint is requested with `count: 1000` and `page_no: 1`. This iteration does not add pagination; the specialized counts are calculated from the returned list, while the displayed total follows the API's `data.total`.

## UI Design

Add clear labels separating the two kinds of checks:

- **Hàng xá lẻ:** a compact summary panel above the existing table, containing cards or metrics for total, DG, and high-value counts. It also identifies the temporary route as `Pleiku SOC → 44-GLI An Khe Hub` so users do not mistake it for the selected destination.
- **Hàng đã đóng bao:** a heading immediately above the existing `TOTable`; the table behavior remains unchanged.

Before the first search, the loose-order panel shows an idle prompt instead of zeroes. During a search it shows a loading state. After success it shows the three counters, including legitimate zero values.

## Data Flow

When the user passes the page's current Hub/SOC, SOC-name, and cookie validation and presses **Tìm kiếm**:

1. Start the existing packed-TO request and the new loose-order request concurrently.
2. Process and render each result independently.
3. Continue using the existing packed-TO toast as the overall search feedback.
4. Store loose-order state separately from the existing `orders` state so one result cannot overwrite the other.

A shared utility owns the endpoint, fixed payload, response validation, normalization, and counting. A shared presentational component owns the idle, loading, success, and error states. Both pages consume the same interfaces.

## Error Handling

- A loose-order request failure must not discard or hide a successful packed-TO result.
- A packed-TO request failure must not discard a successful loose-order summary.
- The loose-order panel displays a localized inline error with a retry instruction when its request fails.
- Existing `apiClient` authentication and connection toasts remain in effect; do not add duplicate error toasts for the loose-order panel.
- A response with nonzero `retcode` is treated as a loose-order failure using its message when available.

## Validation

- Unit-test the loose-order response normalization and all three counting rules, including overlap between DG and high-value orders, missing lists, and total fallback.
- Verify both pages issue the exact POST path and fixed payload after their existing validation succeeds.
- Verify a loose-order failure does not block packed-TO rendering, and the inverse.
- Run TypeScript compilation, ESLint, and the production build.
- Manually inspect both pages on narrow mobile and desktop widths for idle, loading, zero, nonzero, and error states.

## Deferred Work

Once all station IDs are available, extend configuration to map station names to IDs and build `current_station_ids` and `next_station_ids` from the selected route. That dynamic mapping is explicitly outside this iteration.
