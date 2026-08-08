# Default Station Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a safe default configuration sample from the supplied station JSON without embedding authentication secrets.

**Architecture:** A typed source constant contains station names, IDs, and groups only. Settings loads it into form state after overwrite confirmation; it never auto-saves.

**Tech Stack:** React 19, TypeScript 6, Node test runner

## Global Constraints

- Never include the supplied SPX Cookie in source or build artifacts.
- Keep Cookie and Google Sheet URL empty in the sample.
- Loading the sample requires a separate explicit Save action.

---

### Task 1: Safe sample and Settings integration

**Files:**
- Create: `src/config/defaultStationConfig.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `tests/stations.test.ts`

- [x] Add the sanitized station sample.
- [x] Validate all sample names, IDs, and group members.
- [x] Restore a confirmation-protected “Tải mẫu” action.
- [x] Test, lint, build, and package the Apps Script artifact.
