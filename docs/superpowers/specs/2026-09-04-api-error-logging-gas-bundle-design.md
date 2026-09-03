# API Error Logging and GAS Bundle Design

**Date:** 2026-09-04

## Goal

Provide detailed, correlated Console diagnostics for failed SPX API calls without exposing credentials, and add a deterministic `npm run bundle:gas` command that combines every Apps Script `.gs` source under `gas/` into `gas-dist/code.gs`.

## Scope

- Improve diagnostics for requests made through the shared Axios client in browser, custom proxy, and Google Apps Script environments.
- Add matching server-side error logs to `fetchShopeeApi` for SPX HTTP failures and `UrlFetchApp` exceptions.
- Preserve all existing user-facing toast behavior and response contracts.
- Bundle only `.gs` source files. Do not build the frontend, copy `dist/index.html`, modify `gas/index.html`, or deploy Apps Script.
- Keep `gas-dist/` as a generated, ignored local artifact.

## Structured Error Record

Every failed request produces a normalized diagnostic record with these fields where available:

- `timestamp`: ISO timestamp at the point the error is recorded.
- `requestId`: one identifier shared by browser and GAS logs for the same request.
- `method`: uppercase HTTP method.
- `endpoint`: requested SPX path or final request URL.
- `status`: numeric HTTP status, or `null` for transport/setup failures.
- `durationMs`: non-negative elapsed milliseconds.
- `payload`: sanitized request data.
- `response`: sanitized error response data.
- `error`: normalized error name and message.
- `stack`: stack text when available, truncated to the configured limit.
- `source`: identifies `frontend` or `gas`.

The logger records error diagnostics only. Successful calls keep their current behavior and do not emit new error records.

## Frontend Data Flow

The Axios request interceptor creates a request ID and captures the start time before the adapter or network request runs. The metadata is stored on the Axios config through a typed internal extension and is not sent as an SPX HTTP header.

For the GAS adapter, the same request ID is passed as an optional final argument to `fetchShopeeApi`. Existing callers remain compatible because the new argument is optional.

The response error interceptor constructs and writes the structured record before evaluating `suppressErrorToast`. Therefore:

- every rejected API call is logged, including intentionally toast-suppressed per-item calls;
- `suppressErrorToast` continues to suppress only the user-facing toast;
- status-specific toast copy remains unchanged;
- network errors, timeouts, GAS execution failures, adapter errors, and request-setup errors share one logging path;
- the logger never serializes the full Axios config, request object, browser global, or response object.

The browser Console presentation uses `console.groupCollapsed` when available, prints one sanitized record, and closes the group. It falls back to `console.error` when grouping is unavailable. Logger failures are caught so diagnostics can never replace or swallow the original API rejection.

## GAS Data Flow

`fetchShopeeApi(endpoint, cookie, method, bodyData, requestId)` remains the single GAS proxy entry point.

- Capture a start time before authorization and `UrlFetchApp.fetch` work.
- Do not include the Cookie value or complete request headers in any record.
- For an SPX HTTP status outside `200..299`, write a structured GAS error record containing the shared request ID, sanitized payload, parsed/truncated response, status, method, endpoint, and duration.
- When `UrlFetchApp.fetch` throws, log the same fields with `status: null`, normalized message, and stack when available.
- Access-denied responses remain status `403`; their log contains no allowlist, Cookie, or internal authorization data.
- Continue returning the existing `{ status, data }` or `{ status, error }` shape, with optional non-sensitive diagnostic metadata permitted only if required by the frontend adapter.

GAS logging uses one-line `console.error(JSON.stringify(record))` output so Apps Script Execution logs remain searchable by `requestId`.

## Sanitization and Size Limits

Sanitization is shared conceptually between frontend and GAS implementations but written in syntax native to each runtime.

- Sensitive key matching is case-insensitive and covers `cookie`, `set-cookie`, `authorization`, `proxy-authorization`, `token`, `access_token`, `refresh_token`, `x-shopee-cookie`, `api-key`, and `apikey`.
- A sensitive value is replaced with `[REDACTED]` at any nesting depth.
- Arrays and plain objects are traversed defensively with circular-reference protection in the frontend.
- Functions, DOM/network instances, and unsupported values are converted to short descriptive strings instead of being recursively serialized.
- Individual strings and serialized payload/response content are bounded. The implementation uses a single documented limit of 4,000 characters per large text field and appends `[TRUNCATED]` when exceeded.
- Sanitization and Console output are wrapped in `try/catch`; failure falls back to a minimal record containing request ID, method, endpoint, and error message.

Shipment IDs, TO numbers, station IDs, and endpoint query values remain visible because they are required to diagnose the failed operation and are not authentication credentials.

## GAS Bundler

Add a cross-platform Node ESM script at `bundle-gas.mjs` and expose it through:

```json
{
  "scripts": {
    "bundle:gas": "node bundle-gas.mjs"
  }
}
```

Bundling behavior:

1. Resolve the repository root from `import.meta.url` rather than the current shell directory.
2. Recursively enumerate regular files below `gas/` whose extension is exactly `.gs`, case-insensitively.
3. Sort inputs by normalized repository-relative path using deterministic ordinal comparison.
4. Read every source as UTF-8, remove an optional UTF-8 BOM, and normalize CRLF/CR to LF.
5. Remove only trailing blank space at the end of each whole file; do not reformat source code.
6. Prefix each section with `// ===== SOURCE: gas/<relative-path> =====`.
7. Separate sections with exactly one blank line and terminate the bundle with one LF.
8. Create `gas-dist/` when absent and atomically replace `gas-dist/code.gs` through a temporary sibling file plus rename.
9. Print the ordered source list, source count, output path, and byte size.
10. Exit non-zero with a clear message if `gas/` is missing, no `.gs` file exists, a source cannot be read, or output cannot be written.

Because output lives outside `gas/`, it can never become an input. Add `gas-dist/` to `.gitignore`; generated content is not committed.

The current repository contains only `gas/code.gs`, so the first real bundle will contain one named section. The recursive behavior is designed for future split GAS modules.

## Module Boundaries

- `src/utils/apiErrorLog.ts`: frontend request metadata, redaction, truncation, normalized error-record creation, and safe Console output.
- `src/utils/apiClient.ts`: Axios integration, metadata attachment, GAS request-ID propagation, rejection logging, and unchanged toast decisions.
- `gas/code.gs`: GAS-native sanitization/log helpers and proxy instrumentation.
- `bundle-gas.mjs`: reusable pure input ordering/content assembly plus CLI filesystem orchestration.
- Focused tests cover frontend utilities, Axios source contract, GAS behavior, and bundler output.

## Error Handling

- Logging never changes a request's resolved/rejected outcome.
- Logging never causes an additional toast.
- Missing metadata is regenerated or represented safely; it does not prevent error handling.
- If `console.groupCollapsed`, `console.error`, or JSON serialization throws, the logger catches it and returns.
- GAS logging failures are caught independently from the proxy request and response return.
- Bundling fails before replacing the existing output whenever input discovery or reading fails.
- Atomic output replacement prevents a partially written `gas-dist/code.gs` after a write failure.

## Testing

Add focused tests that verify:

- case-insensitive redaction at the root and nested levels;
- circular-safe frontend sanitization;
- 4,000-character truncation markers;
- normalized records contain request ID, method, endpoint, status, duration, payload, response, message, stack, and source;
- safe Console logging falls back and never throws;
- Axios error logging occurs before the `suppressErrorToast` return and request IDs reach the GAS call;
- GAS logs non-2xx responses and thrown fetch exceptions without Cookie values;
- existing GAS return shapes and access behavior remain unchanged;
- the bundler recursively discovers `.gs` files, applies deterministic ordering, normalizes line endings, emits source banners, and excludes its output;
- CLI execution writes `gas-dist/code.gs` and reports meaningful failures;
- the real bundle contains representative functions from `gas/code.gs`.

Run focused tests, the full repository test command, lint, production build, and `npm run bundle:gas`. The two existing `gasAccessControl.test.ts` failures caused by the current intentional `allowed: true` override are baseline failures and must not be expanded.

## Acceptance Criteria

- A failed API call produces a searchable detailed record in browser Console without exposing Cookie/token values.
- A GAS-proxied failure can be correlated between browser and Apps Script logs using the same request ID.
- Toast suppression affects only toasts, not diagnostic logging.
- User-facing API behavior remains unchanged.
- `npm run bundle:gas` deterministically creates `gas-dist/code.gs` from every `gas/**/*.gs` source.
- Re-running the bundler without source changes produces byte-identical output.
- `gas/index.html` and all `.gs` source files remain unchanged by bundling.
- Existing unrelated local edits in `src/layouts/MobileLayout.tsx` and `src/pages/HomePage.tsx` remain untouched and unstaged.
