# Station ID Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure all Hub/SOC IDs and build every loose-order route dynamically.

**Architecture:** Store names in existing fields plus ID lookup maps for backward compatibility. Focused parser/validator helpers own `Name | ID`; pages resolve selected route IDs and pass them through the hook/API/payload layers.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node test runner

## Global Constraints

- Packed TO `receiver` parameters remain station names.
- Loose-order station parameters use configured IDs.
- No `Pleiku SOC`, `1030`, or `1069` defaults remain in runtime source.
- Legacy name-only JSON loads without deletion but cannot be re-saved until IDs are supplied.

---

### Task 1: Station configuration model

**Files:**
- Create: `src/utils/stations.ts`
- Modify: `src/utils/config.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Test: `tests/stations.test.ts`

- [x] Parse and format `Name | ID` entries.
- [x] Validate missing and duplicate names/IDs.
- [x] Persist source, Hub, and SOC ID lookups.
- [x] Remove the fixed sample configuration action.

### Task 2: Dynamic loose-order route

**Files:**
- Modify: `src/utils/looseOrders.ts`
- Modify: `src/utils/looseOrdersApi.ts`
- Modify: `src/hooks/useLooseOrderCheck.ts`
- Modify: `tests/looseOrders.test.ts`

- [x] Replace the fixed payload with `createLooseOrderPayload(currentId, nextIds)`.
- [x] Pass route IDs from hook to API.
- [x] Test single and grouped destination IDs.

### Task 3: Page and summary integration

**Files:**
- Modify: `src/pages/CheckSotNoiTinhPage.tsx`
- Modify: `src/pages/CheckSotNgoaiTinhPage.tsx`
- Modify: `src/components/LooseOrderSummary.tsx`
- Modify: `src/layouts/MobileLayout.tsx`

- [x] Resolve selected route names and IDs.
- [x] Filter packed orders by configured source name.
- [x] Render configured route labels.
- [x] Validate, build, lint, and package Apps Script output.
