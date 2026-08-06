# External Live Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live camera scanning to the Apps Script workflow through a separately hosted HTTPS popup.

**Architecture:** A standalone single-file scanner page owns `getUserMedia()` outside the Apps Script iframe. The Apps Script page opens it synchronously, passes a request ID and target origin, validates the returned `postMessage`, applies the scanned value, and retains native image capture as fallback.

**Tech Stack:** React 19, TypeScript 6, Vite 8, ZXing Browser, Window postMessage API

## Global Constraints

- Never trust a message without matching scanner origin and request ID.
- Open the popup synchronously from the user's click.
- Preserve native image capture when no scanner URL is configured.
- Stop all camera tracks before the scanner popup closes.

---

### Task 1: Standalone scanner artifact

**Files:**
- Create: `scanner.html`
- Create: `src/scanner.ts`
- Create: `vite.scanner.config.ts`
- Modify: `package.json`

- [x] **Step 1:** Build a rear-camera ZXing scanner with close, camera switch, torch, and zoom controls.
- [x] **Step 2:** Post `{ type, requestId, value }` only to the requested return origin and stop the stream.
- [x] **Step 3:** Produce a single-file `scanner-dist/scanner.html` artifact.

### Task 2: Apps Script integration

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/TaoBienBanSuVuPage.tsx`

- [x] **Step 1:** Add a persisted external scanner URL setting.
- [x] **Step 2:** Open the popup and record its request ID/origin.
- [x] **Step 3:** Validate incoming messages and apply LH Trip/item results.
- [x] **Step 4:** Keep native camera capture as the no-URL fallback.
- [x] **Step 5:** Build, lint, and synchronize the Apps Script artifact.
