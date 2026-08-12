# Internal Hub Overview Mobile Table and Per-Hub Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an independently rate-limited reload action for every internal Hub and replace the mobile Overview cards with a compact, readable table.

**Architecture:** Keep the existing Overview page and API contracts. Add a small localStorage-backed per-Hub cooldown helper beside the existing all-Hub cooldown helper, extract one guarded refresh path that both the global scheduler and targeted buttons use, and pass refresh state into the existing presentation component. On mobile, render a semantic table with grouped secondary DG/GTC values; desktop keeps its grouped table and gains the same Hub action.

**Tech Stack:** React 19, TypeScript 6, Vite, Tailwind CSS 4, daisyUI, lucide-react, Node test runner.

## Global Constraints

- The all-Hub action keeps its persisted `120_000` ms cooldown and max-three Hub workers.
- Each targeted Hub action has a persisted `15_000` ms cooldown keyed by station ID, falling back to Hub name when the ID is empty.
- Validation happens before either cooldown starts and before any request is issued.
- Loose and packed branches remain independent; failed refreshes preserve previous successful data as stale.
- Mobile uses a semantic table below the existing `md` breakpoint; no page-level horizontal overflow is allowed.
- Every reload and detail control has a minimum 44px touch target and an accessible Hub-specific label.
- Do not add dependencies or modify unrelated user changes. Preserve untracked `.superpowers/` and `scanner-dist/scanner-dist.zip`.

---

### Task 1: Add persisted per-Hub cooldown primitives

**Files:**
- Modify: `src/utils/internalHubOverview.ts`
- Modify: `tests/internalHubOverview.test.ts`

**Interfaces:**
- Produces `OVERVIEW_HUB_COOLDOWN_MS = 15_000` and `OVERVIEW_HUB_COOLDOWN_KEY = "internal-hub-overview:hub-last-start-v1"`.
- Produces `getOverviewHubCooldownRemaining(storage: StorageLike, hubKey: string, now: number): number`.
- Produces `startOverviewHubCooldown(storage: StorageLike, hubKey: string, now: number): void`.
- Existing `getOverviewCooldownRemaining`, `startOverviewCooldown`, and `StorageLike` remain compatible.

- [ ] **Step 1: Write failing cooldown tests**

Add these imports to `tests/internalHubOverview.test.ts`:

```ts
import {
  getOverviewHubCooldownRemaining,
  startOverviewHubCooldown,
} from "../src/utils/internalHubOverview.ts";
```

Add tests using the existing `createStorage` helper:

```ts
test("persists an independent 15-second cooldown per Hub", () => {
  const storage = createStorage();
  startOverviewHubCooldown(storage, "1069", 10_000);
  startOverviewHubCooldown(storage, "1070", 12_000);

  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 10_000), 15_000);
  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 20_000), 5_000);
  assert.equal(getOverviewHubCooldownRemaining(storage, "1070", 20_000), 7_000);
  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 25_000), 0);
});

test("ignores malformed, future, and blank per-Hub cooldown entries", () => {
  const malformed = createStorage({
    "internal-hub-overview:hub-last-start-v1": "not-json",
  });
  const future = createStorage({
    "internal-hub-overview:hub-last-start-v1": JSON.stringify({ "1069": 99_999 }),
  });
  const blankKey = createStorage({
    "internal-hub-overview:hub-last-start-v1": JSON.stringify({ "": 5_000 }),
  });

  assert.equal(getOverviewHubCooldownRemaining(malformed, "1069", 5_000), 0);
  assert.equal(getOverviewHubCooldownRemaining(future, "1069", 5_000), 0);
  assert.equal(getOverviewHubCooldownRemaining(blankKey, "", 5_000), 0);
});

test("per-Hub cooldown storage failures are safe", () => {
  const storage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };

  assert.equal(getOverviewHubCooldownRemaining(storage, "1069", 5_000), 0);
  assert.doesNotThrow(() => startOverviewHubCooldown(storage, "1069", 5_000));
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --experimental-strip-types --test tests/internalHubOverview.test.ts`

Expected: FAIL because the new per-Hub exports do not exist.

- [ ] **Step 3: Implement the minimal JSON-map cooldown helpers**

In `src/utils/internalHubOverview.ts`, add the constants and use a private parser so malformed entries never block a request:

```ts
export const OVERVIEW_HUB_COOLDOWN_MS = 15_000;
export const OVERVIEW_HUB_COOLDOWN_KEY =
  "internal-hub-overview:hub-last-start-v1";

const readHubCooldowns = (storage: StorageLike): Record<string, number> => {
  try {
    const raw = storage.getItem(OVERVIEW_HUB_COOLDOWN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => key.trim() !== "" && typeof value === "number" && Number.isFinite(value) && value >= 0,
      ),
    );
  } catch {
    return {};
  }
};

export const getOverviewHubCooldownRemaining = (
  storage: StorageLike,
  hubKey: string,
  now: number,
): number => {
  if (!hubKey.trim() || !Number.isFinite(now)) return 0;
  const startedAt = readHubCooldowns(storage)[hubKey];
  if (startedAt === undefined || startedAt > now) return 0;
  return Math.max(0, OVERVIEW_HUB_COOLDOWN_MS - (now - startedAt));
};

export const startOverviewHubCooldown = (
  storage: StorageLike,
  hubKey: string,
  now: number,
): void => {
  if (!hubKey.trim() || !Number.isFinite(now)) return;
  try {
    storage.setItem(
      OVERVIEW_HUB_COOLDOWN_KEY,
      JSON.stringify({ ...readHubCooldowns(storage), [hubKey]: now }),
    );
  } catch {
    // Storage may be unavailable; the in-memory request still proceeds.
  }
};
```

Keep the helper defensive against future timestamps and storage exceptions, matching the existing global cooldown behavior.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `node --experimental-strip-types --test tests/internalHubOverview.test.ts`

Expected: all existing Overview tests plus the three new cooldown tests pass.

- [ ] **Step 5: Commit the utility change**

```bash
git add src/utils/internalHubOverview.ts tests/internalHubOverview.test.ts
git commit -m "feat: add per-Hub overview cooldown"
```

### Task 2: Share guarded refresh logic and add targeted Hub actions

**Files:**
- Modify: `src/pages/InternalHubOverviewPage.tsx`
- Modify: `src/utils/internalHubOverview.ts` only if a small shared type/helper is required by the page

**Interfaces:**
- The page passes `onRefreshHub`, `hubCooldownRemaining`, `hubRunning`, and `allRunning` into `InternalHubOverviewTable`.
- The page keeps `fetchHubOverviewBranches`, `mergeHubBranchResult`, `finishHubRefresh`, and `packedResultGenerations` as the source of truth for one Hub update.
- Global refresh continues to return ordered results from `runWithConcurrency` and retains its existing success/warning toasts.

- [ ] **Step 1: Extract the common single-Hub request/merge path inside the page**

Create a callback with this behavior before wiring either event handler:

```ts
const refreshHubData = async (
  hub: HubDefinition,
  soc: string,
  socId: string,
  generation: number,
  isCurrentRun: () => boolean,
): Promise<{ hubName: string; branches: HubBranchResults }> => {
  if (isCurrentRun()) {
    setRows((currentRows) =>
      replaceHubRow(currentRows, hub, beginHubRefresh),
    );
  }

  let branches: HubBranchResults;
  try {
    branches = await fetchHubOverviewBranches(
      soc,
      socId,
      hub,
      Math.floor(Date.now() / 1_000),
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Không thể tải dữ liệu.";
    branches = failedBranches(message);
  }

  if (isCurrentRun()) {
    if (branches.packed.ok) {
      setPackedResultGenerations((current) => ({
        ...current,
        [hub.name]: (current[hub.name] ?? 0) + 1,
      }));
    }
    setRows((currentRows) =>
      replaceHubRow(currentRows, hub, (row) => {
        const withLoose = mergeHubBranchResult(row, "loose", branches.loose);
        const withPacked = mergeHubBranchResult(withLoose, "packed", branches.packed);
        return finishHubRefresh(withPacked, Date.now());
      }),
    );
  }

  return { hubName: hub.name, branches };
};
```

Capture `currentSoc`, `currentSocId`, and `cookies` in the event handler before creating the callback; do not read changing React state inside an in-flight request.

- [ ] **Step 2: Add per-Hub cooldown/running state and a one-second refresh tick**

Use the stable key `hub.id.trim() || hub.name` and initialize each Hub's remaining time with `getOverviewHubCooldownRemaining(localStorage, key, Date.now())`. Keep a `Record<string, boolean>` for targeted requests. Recompute global and per-Hub remaining time once per second only while at least one cooldown is active; remove expired entries from state after the value reaches zero.

The derived guards must be:

```ts
const targetedRunning = Object.values(hubRunning).some(Boolean);
const canRunAll = !running && !targetedRunning && cooldownRemaining <= 0;
const canRunHub = (hub: HubDefinition) =>
  !running && !hubRunning[hubKey(hub)] &&
  getOverviewHubCooldownRemaining(localStorage, hubKey(hub), Date.now()) <= 0;
```

When the configuration changes, reconcile the cooldown/running maps to the current Hub keys instead of retaining removed Hubs.

- [ ] **Step 3: Rewire the global scheduler to use the shared path**

Inside the existing `tasks` map, start the per-Hub cooldown when a Hub task begins, set its visible remaining time to `OVERVIEW_HUB_COOLDOWN_MS`, and call `refreshHubData(hub, generation, isCurrentRun)`. Keep `startOverviewCooldown` only at the successful global validation boundary, and retain `runWithConcurrency(tasks, OVERVIEW_HUB_CONCURRENCY)` and the existing aggregate toast.

The global action must return without starting any cooldown when `targetedRunning` is true. Its disabled state must use `canRunAll` plus the existing loading/cooldown label.

- [ ] **Step 4: Implement the targeted Hub handler**

The handler must re-read `getSoc`, `getSocId`, `getCookies`, and `readHubs`, validate the complete configuration, locate the requested Hub by name/id, check the current 15-second remaining value, then start only that Hub's cooldown and running state before calling the shared path:

```ts
const handleHubRefresh = async (requestedHub: HubDefinition) => {
  if (!canRunHub(requestedHub)) return;

  const currentSoc = getSoc();
  const currentSocId = getSocId();
  const cookies = getCookies();
  const currentHubs = readHubs();
  const validationError = validateOverviewConfig({
    soc: currentSoc,
    socId: currentSocId,
    cookies,
    hubs: currentHubs,
  });
  if (validationError) {
    showToast(`${validationError} Vui lòng kiểm tra lại trong Cài đặt.`, "error");
    return;
  }

  const hub = currentHubs.find(
    (candidate) => candidate.name === requestedHub.name || candidate.id === requestedHub.id,
  );
  if (!hub) return;

  const key = hubKey(hub);
  const startedAt = Date.now();
  startOverviewHubCooldown(localStorage, key, startedAt);
  setHubCooldownRemaining((current) => ({
    ...current,
    [key]: OVERVIEW_HUB_COOLDOWN_MS,
  }));
  setHubRunning((current) => ({ ...current, [key]: true }));

  const generation = generationRef.current + 1;
  generationRef.current = generation;
  const result = await refreshHubData(
    hub,
    generation,
    () => mountedRef.current && generationRef.current === generation,
  );
  if (mountedRef.current && generationRef.current === generation) {
    setHubRunning((current) => ({ ...current, [key]: false }));
    showToast(
      result.branches.loose.ok && result.branches.packed.ok
        ? `Đã cập nhật ${hub.name}.`
        : `Đã cập nhật ${hub.name}, nhưng có nhánh lỗi.`,
      result.branches.loose.ok && result.branches.packed.ok ? "success" : "warning",
    );
  }
};
```

Use `try/finally` around the request so the targeted running flag clears on thrown/unmounted paths, and keep the generation guard before every state update.

- [ ] **Step 5: Run typecheck/lint after page wiring**

Run: `npx eslint src/pages/InternalHubOverviewPage.tsx src/utils/internalHubOverview.ts` and `npx tsc -b`.

Expected: no lint or TypeScript errors.

- [ ] **Step 6: Commit the targeted refresh behavior**

```bash
git add src/pages/InternalHubOverviewPage.tsx src/utils/internalHubOverview.ts
git commit -m "feat: refresh individual overview hubs"
```

### Task 3: Replace mobile cards with the selected compact table

**Files:**
- Modify: `src/components/InternalHubOverviewTable.tsx`
- Modify: `src/pages/InternalHubOverviewPage.tsx` for the new component props

**Interfaces:**
- Extend `InternalHubOverviewTableProps` with:

```ts
onRefreshHub: (hub: HubOverviewRow) => void;
hubCooldownRemaining: Readonly<Record<string, number>>;
hubRunning: Readonly<Record<string, boolean>>;
allRunning: boolean;
```

- Preserve `rows`, `totals`, `selectedHubName`, and `onSelectHub`.

- [ ] **Step 1: Add focused table rendering helpers**

Add a stable key and countdown formatter:

```ts
const hubKey = (row: HubOverviewRow): string => row.id.trim() || row.name;

const formatCountdown = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `00:${String(seconds).padStart(2, "0")}`;
};
```

Render a `HubRefreshButton` with `min-h-11 min-w-11`, `RefreshCw`/spinner feedback, `aria-label={`Làm mới dữ liệu của ${row.name}`}`, and visible countdown text below or beside the icon. Disable it when `allRunning`, that Hub is running, or its remaining cooldown is positive.

- [ ] **Step 2: Replace only the `md:hidden` card branch with a semantic table**

Use one `table` with columns `Hub / trạng thái`, `Xá lẻ`, `Đóng bao`, `Kiện`, and `Thao tác`. Keep `aria-label="Tổng quan theo Hub trên mobile"`, compact `px-1.5` cells, safe wrapping, and an internal overflow fallback (`overflow-x-auto`) without allowing the page itself to overflow.

Each row must render:

```tsx
<tr key={row.id || row.name} className="align-top">
  <th scope="row">
    <span className="break-safe font-bold">{row.name}</span>
    <StatusBadge status={row.status} />
    <span className="block text-[11px] text-base-content/60">
      {formatUpdatedAt(row.updatedAt)}
    </span>
    <DetailButton compact row={row} selected={selected} onSelect={onSelectHub} />
  </th>
  <td>
    <strong>{formatMetric(row.loose.data?.total ?? 0, looseAvailable)}</strong>
    <span className="block text-[11px] text-base-content/60">
      DG {formatMetric(row.loose.data?.dgCount ?? 0, looseAvailable)} · GTC {formatMetric(row.loose.data?.highValueCount ?? 0, looseAvailable)}
    </span>
  </td>
  <td>
    <strong>{formatMetric(row.packed.orders.length, row.packed.hasData)} TO</strong>
    <span className="block text-[11px] text-base-content/60">
      DG {formatMetric(row.packed.metrics.dgBagCount, row.packed.hasData)} · GTC {formatMetric(row.packed.metrics.gtcBagCount, row.packed.hasData)}
    </span>
  </td>
  <td className="text-right font-black">
    {formatMetric(row.packed.metrics.totalQuantity, row.packed.hasData)}
  </td>
  <td>
    <HubRefreshButton ... />
  </td>
</tr>
```

Render `BranchMessages` in a following `<tr><td colSpan={5}>…</td></tr>` when a message exists, so error text does not squeeze the numeric columns. Keep a table footer row with the existing aggregate totals and secondary DG/GTC values.

- [ ] **Step 3: Add the same reload control to the desktop action cell**

Keep the existing grouped desktop columns unchanged, but render a flex action cell containing the new Hub reload control and the existing detail button. The reload control must use the same cooldown/running props and accessible label.

- [ ] **Step 4: Wire the page props and remove the mobile card-only helpers**

Pass the page state to `InternalHubOverviewTable`:

```tsx
<InternalHubOverviewTable
  rows={rows}
  totals={totals}
  selectedHubName={selectedHubName}
  onSelectHub={...}
  onRefreshHub={handleHubRefresh}
  hubCooldownRemaining={hubCooldownRemaining}
  hubRunning={hubRunning}
  allRunning={running}
/>
```

Delete unused `MobileMetric` code only after the new table compiles. Preserve selected-detail behavior and the `key` based on successful packed generations.

- [ ] **Step 5: Run focused checks for the presentation**

Run: `npx eslint src/components/InternalHubOverviewTable.tsx src/pages/InternalHubOverviewPage.tsx` and `npx tsc -b`.

Expected: no lint or TypeScript errors and no unused prop/helper warnings.

- [ ] **Step 6: Commit the compact mobile table**

```bash
git add src/components/InternalHubOverviewTable.tsx src/pages/InternalHubOverviewPage.tsx
git commit -m "feat: show overview as a compact mobile table"
```

### Task 4: Regression, browser QA, and handoff

**Files:**
- No source changes expected; only update tests if a regression discovered.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all existing tests plus the per-Hub cooldown tests pass (at least 90 tests after the new coverage).

- [ ] **Step 2: Run lint, build, and whitespace checks**

Run:

```bash
npm run lint
npm run build
git diff --check 72f87ed..HEAD
```

Expected: all commands exit 0.

- [ ] **Step 3: Perform browser QA at phone and desktop widths**

At 390×844 verify:

- mobile content is a table, not cards;
- Hub names/statuses wrap without page-level horizontal scroll;
- Xá lẻ and Đóng bao show primary totals plus DG/GTC sublines;
- each reload button is at least 44px, has a Hub-specific accessible label, shows spinner/countdown, and remains locked for 15 seconds;
- opening TO detail still works and does not issue a second request.

At 1024×900 verify:

- grouped desktop table remains intact;
- each row has reload and detail actions;
- all-Hub action remains locked for two minutes after a validated start;
- targeted refresh does not change the all-Hub countdown.

- [ ] **Step 4: Inspect final worktree and hand off**

Run: `git status --short` and confirm only the intentionally modified/committed source files are tracked; preserve `.superpowers/` and `scanner-dist/scanner-dist.zip` as untracked artifacts. Report commits, verification results, and any remaining local-only artifacts.
