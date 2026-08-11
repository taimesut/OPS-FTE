# TO Sender Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the response `sender` value in mobile TO cards and the desktop table, make it searchable, and migrate existing saved column preferences so Sender appears by default exactly once.

**Architecture:** Add pure, browser-independent helpers for Sender-aware search and one-time column migration, with Node unit tests. `TOTable` remains the shared renderer and consumes those helpers while adding a Sender column and a two-ended route block; no page-level or API changes are needed.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, DaisyUI 5, Node built-in test runner, Vite 8.

## Global Constraints

- Use `item.sender` directly from the existing `TransferOrder` response.
- Label the desktop column and column option `Điểm gửi (Sender)`.
- Place Sender immediately before `Điểm đến (Des)` in the desktop table.
- Put `Điểm gửi` and `Điểm đến` in the same primary route block on mobile.
- Show `---` when Sender is empty.
- Sender must be visible by default for new and migrated existing preferences, but a later explicit hide must persist.
- Search Sender case-insensitively together with the existing TO fields.
- Do not change requests, response mapping, pagination, metrics, QR behavior or dependencies.

## File Map

- Create `src/utils/toTable.ts`: pure search matcher and storage-backed column migration helper.
- Create `tests/toTable.test.ts`: tests for Sender search, migration and malformed storage.
- Modify `package.json`: append the new test file to the explicit test command.
- Modify `src/components/TOTable.tsx`: add Sender to columns, preferences, card, table and search.

---

### Task 1: Sender search and column migration utilities

**Files:**
- Create: `src/utils/toTable.ts`
- Create: `tests/toTable.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: a minimal `StorageLike`, table key, ordered column keys and a structurally typed searchable TO.
- Produces: `loadToTableColumns(storage, storageKey, allColumnKeys): string[]` and `matchesTransferOrderSearch(order, rawQuery): boolean`.

- [ ] **Step 1: Write failing unit tests**

Create `tests/toTable.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  getSenderColumnMigrationKey,
  loadToTableColumns,
  matchesTransferOrderSearch,
} from "../src/utils/toTable.ts";

const columns = ["to_number", "operator", "sender", "route", "action"];

const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    value: (key: string) => values.get(key) ?? null,
  };
};

test("new preferences include Sender and mark migration complete", () => {
  const storage = createStorage();
  assert.deepEqual(loadToTableColumns(storage, "table-a", columns), columns);
  assert.equal(storage.value(getSenderColumnMigrationKey("table-a")), "1");
});

test("migrates Sender before route once while preserving hidden columns", () => {
  const storage = createStorage({
    "table-a": JSON.stringify(["to_number", "route", "action"]),
  });
  assert.deepEqual(loadToTableColumns(storage, "table-a", columns), [
    "to_number",
    "sender",
    "route",
    "action",
  ]);
  assert.equal(storage.value(getSenderColumnMigrationKey("table-a")), "1");

  storage.setItem("table-a", JSON.stringify(["to_number", "route", "action"]));
  assert.deepEqual(loadToTableColumns(storage, "table-a", columns), [
    "to_number",
    "route",
    "action",
  ]);
});

test("falls back to all columns for malformed saved preferences", () => {
  for (const saved of ["not-json", JSON.stringify({ sender: true }), JSON.stringify([1])]) {
    const storage = createStorage({ "table-a": saved });
    assert.deepEqual(loadToTableColumns(storage, "table-a", columns), columns);
  }
});

test("search matches Sender case-insensitively and keeps existing fields", () => {
  const order = {
    to_number: "TO202608101XKVD",
    operator: "Nguyễn Thị Hải Yến",
    sender: "BD A Mega SOC",
    receiver: "44-GLI An Khe Hub",
    pack_name: "Bao 90x70",
  };
  assert.equal(matchesTransferOrderSearch(order, "mega soc"), true);
  assert.equal(matchesTransferOrderSearch(order, "an khe"), true);
  assert.equal(matchesTransferOrderSearch(order, "to202608101xkvd"), true);
  assert.equal(matchesTransferOrderSearch(order, "không tồn tại"), false);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
node --experimental-strip-types --test tests/toTable.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/toTable.ts`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/utils/toTable.ts`:

```ts
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SearchableTransferOrder {
  to_number: string;
  operator?: string;
  sender?: string;
  receiver?: string;
  pack_name?: string;
}

const SENDER_COLUMN_MIGRATION_SUFFIX = ":sender-column-v1";

export const getSenderColumnMigrationKey = (storageKey: string): string =>
  `${storageKey}${SENDER_COLUMN_MIGRATION_SUFFIX}`;

const setMigrationMarker = (storage: StorageLike, key: string) => {
  try {
    storage.setItem(key, "1");
  } catch {
    // Column preferences still work for this session when storage is unavailable.
  }
};

export const loadToTableColumns = (
  storage: StorageLike,
  storageKey: string,
  allColumnKeys: readonly string[],
): string[] => {
  const migrationKey = getSenderColumnMigrationKey(storageKey);
  try {
    const savedRaw = storage.getItem(storageKey);
    if (!savedRaw) {
      setMigrationMarker(storage, migrationKey);
      return [...allColumnKeys];
    }

    const saved: unknown = JSON.parse(savedRaw);
    if (!Array.isArray(saved) || !saved.every((key) => typeof key === "string")) {
      setMigrationMarker(storage, migrationKey);
      return [...allColumnKeys];
    }

    if (storage.getItem(migrationKey) === "1" || saved.includes("sender")) {
      setMigrationMarker(storage, migrationKey);
      return [...saved];
    }

    const routeIndex = saved.indexOf("route");
    const migrated = [...saved];
    migrated.splice(routeIndex >= 0 ? routeIndex : migrated.length, 0, "sender");
    setMigrationMarker(storage, migrationKey);
    return migrated;
  } catch {
    setMigrationMarker(storage, migrationKey);
    return [...allColumnKeys];
  }
};

export const matchesTransferOrderSearch = (
  order: SearchableTransferOrder,
  rawQuery: string,
): boolean => {
  const query = rawQuery.toLowerCase().trim();
  if (!query) return true;
  return [
    order.to_number,
    order.operator,
    order.sender,
    order.receiver,
    order.pack_name,
  ].some((value) => value?.toLowerCase().includes(query));
};
```

- [ ] **Step 4: Append the new test to the project test command**

Add `tests/toTable.test.ts` at the end of the existing `package.json` `test` script. Keep every existing test entry unchanged.

- [ ] **Step 5: Run focused and full tests**

```powershell
node --experimental-strip-types --test tests/toTable.test.ts
npm test
```

Expected: focused tests PASS and the full suite reports 72 passing tests.

- [ ] **Step 6: Commit the utility slice**

```powershell
git add src/utils/toTable.ts tests/toTable.test.ts package.json
git commit -m "feat: migrate and search TO sender columns"
```

---

### Task 2: Render Sender in cards and table

**Files:**
- Modify: `src/components/TOTable.tsx`

**Interfaces:**
- Consumes: `loadToTableColumns`, `matchesTransferOrderSearch`, existing `TransferOrder.sender` and `storageKey`.
- Produces: Sender-aware column configuration, mobile route block, desktop cell and filtered results.

- [ ] **Step 1: Import the helpers and register the Sender column**

Add:

```ts
import {
  loadToTableColumns,
  matchesTransferOrderSearch,
} from "../utils/toTable";
```

Insert Sender immediately before Route:

```ts
{ key: "sender", label: "Điểm gửi (Sender)" },
{ key: "route", label: "Điểm đến (Des)" },
```

- [ ] **Step 2: Use the migration helper for initial visible columns**

Replace the current `visibleColumns` initializer with:

```ts
const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
  loadToTableColumns(
    localStorage,
    storageKey,
    TABLE_COLUMNS.map((column) => column.key),
  ),
);
```

Keep the existing effect that saves `visibleColumns` to `storageKey`.

- [ ] **Step 3: Make the mobile route block Sender-aware**

Derive these booleans inside `TransferOrderCard`:

```ts
const showSender = visibleColumns.includes("sender");
const showReceiver = visibleColumns.includes("route");
const showRoute = showSender || showReceiver;
```

Keep `showRoute` in `showBody` and `showDetailSeparator`. Replace the current single Receiver block with:

```tsx
{showRoute && (
  <dl className="space-y-2 rounded-xl border border-primary/15 bg-primary/5 p-3">
    {showSender && (
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wide text-primary/70">
          Điểm gửi
        </dt>
        <dd className="break-safe mt-0.5 font-semibold text-base-content">
          {item.sender || "---"}
        </dd>
      </div>
    )}
    {showReceiver && (
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wide text-primary/70">
          Điểm đến
        </dt>
        <dd className="break-safe mt-0.5 font-semibold text-base-content">
          {item.receiver || "---"}
        </dd>
      </div>
    )}
  </dl>
)}
```

- [ ] **Step 4: Add the desktop Sender cell before Receiver**

Inside each desktop row, immediately before the existing Route cell, add:

```tsx
{visibleColumns.includes("sender") && (
  <td className="font-semibold text-sm">{item.sender || "---"}</td>
)}
```

Do not change the existing Receiver cell or any other desktop cell.

- [ ] **Step 5: Search Sender through the pure matcher**

Replace the inline filter predicate with:

```ts
const filteredOrders = useMemo(() => {
  if (!searchQuery.trim()) return orders;
  return orders.filter((item) => matchesTransferOrderSearch(item, searchQuery));
}, [orders, searchQuery]);
```

Update the search placeholder to:

```tsx
placeholder="Tìm mã TO, người đóng, điểm gửi/đến..."
```

- [ ] **Step 6: Run static verification**

```powershell
npx eslint src/components/TOTable.tsx src/utils/toTable.ts tests/toTable.test.ts
npm test
npm run build
```

Expected: ESLint exits 0, 72 tests pass and the production build completes.

- [ ] **Step 7: Perform responsive browser QA**

At approximately 390 px width with sample orders containing `sender: "BD A Mega SOC"`, verify:

- card route block shows `Điểm gửi` above `Điểm đến`;
- each field can be independently hidden without an empty route block;
- a long Sender wraps and the page has no horizontal overflow;
- searching `mega soc` retains the two supplied sample TOs and recalculates metrics.

At 768 px or wider, verify `Điểm gửi (Sender)` appears immediately before `Điểm đến (Des)`, uses `---` for an empty Sender, and table horizontal scrolling remains contained.

Verify a saved pre-Sender column array gains Sender once, then uncheck Sender, reload, and confirm it remains hidden.

- [ ] **Step 8: Commit the UI slice**

```powershell
git add src/components/TOTable.tsx
git commit -m "feat: display sender in TO results"
```

---

### Task 3: Final regression review

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the two implementation commits from Tasks 1–2.
- Produces: a verified Sender display with no unrelated staged files.

- [ ] **Step 1: Run the complete quality gates**

```powershell
npm test
npm run lint
npm run build
git diff --check HEAD~2..HEAD
git status --short
```

Expected: 72 tests pass, lint/build exit 0, no whitespace errors, and only pre-existing unrelated files may remain untracked.

- [ ] **Step 2: Review the scoped final diff**

```powershell
git diff HEAD~2..HEAD -- package.json src/utils/toTable.ts tests/toTable.test.ts src/components/TOTable.tsx
```

Confirm the diff contains only Sender search/migration, Sender card/table rendering and the new tests; confirm no request, response mapping, metrics, QR or pagination code changed.
