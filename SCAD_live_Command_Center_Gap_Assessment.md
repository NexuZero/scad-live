# SCAD_live — Field Operations Command Center: Gap Assessment

**Date:** 2026-05-03  
**Scope:** Full codebase audit — no files modified  
**Purpose:** Identify what exists, what is weak, and what is missing for SCAD_live to become a production-ready Field Operations Command Center

---

## 1. Executive Summary

SCAD_live is a React 18 single-page application targeting field research command-and-control for the Abu Dhabi Statistics Centre (SCAD). The project reaches approximately **65–70% of its intended design scope**. The map engine, project tracking, economic surveys, and enumerator registry are solid. Critical operational layers — real-time alerts, task management, team communication, user administration, and security hardening — are either partially built or missing entirely. Eight of ten planned implementation phases remain open. The system currently operates in a permanent **demo/mock mode** because no backend, database, or deployment pipeline is wired up.

---

## 2. Project Snapshot

| Attribute | Value |
|-----------|-------|
| Framework | React 18.2 + react-router-dom 6 |
| Build Tool | Create React App (react-scripts 5) |
| Map Engine | MapLibre GL 4.1 |
| UI Kit | Custom shadcn/ui components (no Tailwind listed in package.json) |
| Auth | JWT stored in `localStorage` |
| Real-time | WebSocket hook + WebRTC hook (both present, neither fully integrated) |
| Database | None — IndexedDB + `localStorage` fallback only |
| Backend | REST API client in `src/api/index.js` (2,214 lines) with full demo-mode fallback |
| Run port | 3005 (forced by `npm start` script) |
| Container | Dockerfile — Node 20 Alpine, `npm start` only |
| Source duplication | `src/` (active) and `dashboard-src/` (stale copy) both present |
| Documentation | `DESIGN.md` (design system), `PHASES-PLAN.md` (10-phase roadmap) |

---

## 3. What Exists and Works

### 3.1 Authentication

**File:** `src/components/Login.jsx`, `src/api/index.js`

JWT login form is complete. Token and role are stored in `localStorage`. All API calls attach `Authorization: Bearer <token>`. A developer auto-login shortcut activates when `REACT_APP_API_BASE_URL` is unset, writing a fake `dev_token` and `admin` role directly — adequate for development, dangerous if left in a production build.

**Role values in use:** `admin`, `project_manager`, `supervisor`, `viewer` (others implied by sidebar filters).

**What works:** login form, token attachment, role-gated sidebar items.  
**What is missing:** token expiry handling beyond a single refresh call, logout-on-expiry, server-side role validation (the frontend trusts localStorage), and any hardening to prevent the dev bypass reaching production.

---

### 3.2 Project Dashboard (Command Center)

**File:** `src/components/ProjectDashboard.jsx` (770 lines)

The main dashboard renders four KPI cards (active projects, field researchers, samples completed, overall progress), a project table, a 30-second auto-refresh cycle, and a generated alert list. Alert logic inspects project completion and researcher status to surface up to 50 contextual alerts. A velocity sparkline concept exists in the API layer (`fetchDailyVelocity`).

**What works:** KPI layout, project table, synthetic alert generation, auto-refresh, dark/light theme toggle.  
**What is weak:**
- Alert generation is entirely client-side synthetic logic. No backend pushes alerts — there is no escalation, no acknowledgement workflow, and no audit trail.
- The PHASES-PLAN explicitly marks Phase 4 (dashboard metric corrections) as pending.
- The `NotificationBar` component that should surface live alerts only renders hardcoded demo strings (see §4.1).
- No drill-down from a KPI card to the underlying data.
- No export or print function for management reporting.

---

### 3.3 Live Map & Field Tracking

**Files:** `src/components/LiveMap.jsx` (964 lines), `src/components/Map.jsx` (279 lines), `src/tileConfig.js` (638 lines), `src/components/ProjectDetail.jsx` (1,337 lines)

This is the most sophisticated part of the codebase. `tileConfig.js` initialises a MapLibre GL map with 3D buildings, real terrain elevation, a dynamic sun position calculated for Abu Dhabi (24.45°N, 54.38°E), satellite imagery toggle, Arabic RTL label support, and a building-height GeoJSON patch for landmark accuracy. A tile-server cascade falls back from an internal server to OpenFreeMap liberty, and terrain falls back from internal TileJSON to AWS Terrarium.

`LiveMap.jsx` renders up to 30 researcher pins with animated pulsing markers, trajectory trails, building outlines, and layer toggles. `ProjectDetail.jsx` embeds a project-scoped map with ETA overlays, geofence breach markers, sample heatmaps, and researcher popups.

**What works:** map initialisation, 3D buildings, terrain, dynamic lighting, satellite toggle, researcher pins, trails, geofence overlays, ETA display, Arabic labels, dark/light themes.  
**What is weak:**
- Researcher positions are **simulated** in `LiveMap.jsx` — there is no live GPS feed from field devices.
- The trajectory API (`fetchTrajectory`) and location API (`fetchResearcherLocation`) exist but call the demo fallback when the backend is absent.
- No geofence definition UI — boundaries appear to be hardcoded or inferred from sample coordinates.
- No cluster rendering for high-density sample maps (performance will degrade beyond a few hundred points).
- No offline map tile caching for field use in low-connectivity areas.
- Breach alerts fire from client-side polling, not a server-side event stream.

---

### 3.4 Project Management

**Files:** `src/components/ProjectList.jsx`, `ProjectCreate.jsx`, `ProjectDetail.jsx`

Full project lifecycle: list, create, detail view with stats, CSV upload for both sample points and researchers, geofence-breach detection, risk scoring (`fetchProjectRisk`), and ETA computation per researcher. The economic project track adds ISIC4 sector classification, stratified sampling allocation, staffing plans, and a complete UI in `EconomicProjectDetail.jsx` (2,106 lines — the largest file).

**What works:** project CRUD, sample upload, researcher assignment, map integration, risk and ETA APIs, economic project stratification.  
**What is weak:**
- `ProjectCreate.jsx` (256 lines) has a form structure but no visible inline validation or submission confirmation.
- Edit/update for standard (non-economic) projects has no dedicated UI.
- No bulk status change (e.g., pause all projects in a region).
- No project archival or soft-delete for completed projects.
- Risk scores are computed on the client from fetched stats — not a backend model.

---

### 3.5 Enumerator Registry

**File:** `src/components/EnumeratorList.jsx` (401 lines)

Complete CRUD (add, edit, delete), CSV batch upload, asset barcode as unique key. API endpoints for all operations are defined and have demo-mode fallbacks.

**What is weak:** no duplicate-barcode detection before submission, no audit log for deletions, no bulk export to CSV.

---

### 3.6 Real-time Infrastructure

**Files:** `src/hooks/useWebSocket.js` (112 lines), `src/hooks/useWebRTC.js` (254 lines)

`useWebSocket` provides connection with auto-reconnect (max 10 retries, 3 s delay), message parsing, and clean teardown. `useWebRTC` implements a full peer-connection lifecycle (idle → connecting → ringing → active → ended) with DTLS-SRTP enforcement, TURN server support, ICE candidate exchange, and auto-answer capability.

**What works:** both hooks are production-quality infrastructure code.  
**What is weak:** neither hook is wired into any UI component in a functioning way. The notification bar ignores WebSocket; the chat page imports components that do not exist; call controls have no hook reference.

---

## 4. What is Weak (Partial / Disconnected)

### 4.1 Notification Bar

**File:** `src/components/NotificationBar.jsx` (130 lines)

The bar renders up to 8 coloured alert pills with dismiss and expand actions. The alert array is populated from hardcoded demo strings — no call to `useWebSocket` or to the alert-generating API. The component accepts an `alerts` prop from the parent but the parent (`App.jsx`) passes a static list.

**Gap:** real-time server-push is never received by the notification bar. Dismissals are local only — they do not acknowledge to any backend. There is no persistence of alert state across page reload.

---

### 4.2 Tasks Page

**File:** `src/components/pages/TasksPage.jsx` (~200 lines)

The three-column task layout (list / detail / activity) is structurally rendered. `TaskCreateModal.jsx` and `TaskDetailPanel.jsx` provide form UIs. However:

- `fetchTasks()`, `createTask()`, `updateTask()` are **called in the component but not exported from `src/api/index.js`**. The page will throw at runtime.
- `TaskDetailPanel.jsx` has explicit `// TODO: get from auth context` and `// TODO: also persist to backend` comments — the task editor cannot save.
- No task filtering by project, assignee, or status.
- No task notifications or deadline alerts.
- No bulk assignment or import.

---

### 4.3 Chat Page

**File:** `src/components/pages/ChatPage.jsx` (34 lines)

The file is a skeleton that imports four components: `ConversationList`, `MessageThread`, `ContactInfo`, and `ChatInput`. **None of these files exist in the codebase.** The page will crash on load for any user who navigates to `/chat`.

`ChatWindow.jsx` (216 lines) and `CallControls.jsx` (167 lines) exist as UI-only widgets but are not integrated with `useWebSocket` or `useWebRTC`.

**Gap:** the entire chat and calling feature set is missing despite being a core command-center requirement.

---

### 4.4 Researcher Panel & Status

**File:** `src/components/ResearcherPanel.jsx` (176 lines)

Displays researcher name, phone, status, and assignment. Provides a "Call" button that references `CallControls`. No live status update feed — the panel renders a snapshot from the last API fetch.

---

### 4.5 Alert Escalation

No escalation chain exists anywhere in the codebase. Alerts are generated, displayed, and dismissable locally — there is no concept of:
- Alert priority tiers (info / warning / critical)
- Time-to-acknowledge tracking
- Escalation to supervisor if unacknowledged within N minutes
- Incident creation from an alert
- Notification to mobile/email

---

## 5. What is Missing

### 5.1 User Management Page

The sidebar navigation data (`sidebar-data.js`) defines a **Users** item visible to `admin` only. No `UsersPage` component exists. There is no UI to:
- Create, edit, deactivate, or delete system users
- Assign roles
- View login history
- Reset passwords
- Associate users with projects or regions

PHASES-PLAN Phase 7 specifies this page with country-flag emojis from ISO codes. Status: not started.

---

### 5.2 Settings Page

The sidebar includes a **Settings** item. No `SettingsPage` component exists. PHASES-PLAN Phase 8 specifies sections for appearance, language, and notification preferences. None of these are implemented.

---

### 5.3 Reports & Management Visibility

PHASES-PLAN Phase 9 marks Reports as a disabled navigation item only. No reporting engine, no export, no scheduled report delivery, no management summary view. For a command centre, this is a critical absence:
- No PDF/Excel export of project status
- No daily/weekly summary generation
- No SLA reporting (completion rate vs target date)
- No researcher performance report
- No audit log of system actions

---

### 5.4 Database & Backend

There is no database. The project ships with a 2,214-line API client that falls through to `localStorage`/IndexedDB demo data whenever the backend is unreachable. No Prisma schema, no SQL migrations, no ORM, no server-side code are present in the repository. The implied backend schema (inferred from API call shapes) is:

```
users, projects, researchers, samples, tasks,
chat_messages, enumerators, economic_projects,
companies, survey_targets, survey_households
```

Until a real backend exists, the system cannot be deployed for operational use. There is also no Docker Compose file to wire the frontend container to a backend service.

---

### 5.5 Security

| Concern | Current State |
|---------|--------------|
| JWT storage | `localStorage` — vulnerable to XSS token theft; `httpOnly` cookie not used |
| Dev bypass | Auto-login to admin written into production source; must be stripped for any deployment |
| Role enforcement | Frontend only — any user who edits `localStorage` can escalate their role |
| HTTPS | No TLS configuration in Dockerfile or deployment spec |
| CORS | Not configured (backend responsibility, but no guidance in codebase) |
| Input sanitisation | CSV uploads parsed client-side; no server-side validation layer present |
| Secrets in source | `.env` committed (contains `VITE_API_BASE_URL`); no `.gitignore` entry verified |
| Session expiry | Single refresh call exists; no automatic logout on token expiry or inactivity |
| Audit logging | No user-action audit trail anywhere |
| Rate limiting | No client-side back-off beyond WebSocket reconnect; no server-side configuration |

---

### 5.6 State Management

No global state management library (Redux, Zustand, Jotai, or React Context) is used. Component state is local (`useState`) with cross-component data sharing done through `localStorage` reads. As a consequence:
- A researcher selected on the Live Map cannot be surfaced in the chat sidebar without a page navigation.
- Alert dismissal in the notification bar does not propagate to the dashboard alert list.
- Task status changes do not update the dashboard KPI without a full page refresh.

---

### 5.7 Error Boundaries & Resilience

No React error boundary wraps any route or component. A runtime error in the missing ChatPage components (§4.3) or in the task API mismatch (§4.2) will crash the entire application, not just the affected panel.

---

### 5.8 TypeScript / Type Safety

The codebase is entirely plain JavaScript. There are no `.ts`, `.tsx`, or `.d.ts` files. No PropTypes declarations are used. API response shapes are undocumented in code — a data model change in the backend will produce silent runtime failures.

---

### 5.9 Testing

No test files are present. `react-scripts test` is in `package.json` but no `*.test.js` or `*.spec.js` files exist. There are no:
- Unit tests for API utilities
- Component render tests
- Integration tests for upload flows
- End-to-end tests for the operational workflows

---

### 5.10 CI/CD & Deployment

A basic Dockerfile exists. Beyond that:
- No Docker Compose (frontend + backend + database)
- No CI pipeline (GitHub Actions, GitLab CI, or otherwise)
- No environment-specific build configuration (staging vs production)
- No health check endpoint
- No production build optimisation (code splitting, lazy routes)
- The `dashboard-src/` directory is a stale duplicate of `src/` and will be included in the Docker image, inflating build size

---

## 6. Feature-by-Feature Status Matrix

| Feature Area | Exists | Functional | Real-time | Production-ready |
|---|:---:|:---:|:---:|:---:|
| Authentication (login/JWT) | ✓ | ✓ | — | ✗ (XSS exposure, dev bypass) |
| Role-based navigation | ✓ | ✓ | — | ✗ (client-only enforcement) |
| Project Dashboard (KPIs) | ✓ | ✓ | ✗ | ✗ |
| Alert display (notification bar) | ✓ | Partial | ✗ | ✗ |
| Alert escalation workflow | ✗ | ✗ | ✗ | ✗ |
| Live researcher map | ✓ | Simulated | ✗ | ✗ |
| GPS tracking (real device feed) | ✗ | ✗ | ✗ | ✗ |
| Geofence breach detection | ✓ | Demo data | ✗ | ✗ |
| Project list & detail | ✓ | ✓ | — | Partial |
| Project risk & ETA | ✓ | Demo data | — | ✗ |
| Sample upload (CSV) | ✓ | ✓ | — | Partial |
| Economic project management | ✓ | ✓ | — | Partial |
| Enumerator registry | ✓ | ✓ | — | Partial |
| Task management | Partial | ✗ | ✗ | ✗ |
| Chat (messaging) | ✗ | ✗ | ✗ | ✗ |
| Audio calls (WebRTC) | Partial | ✗ | — | ✗ |
| User management page | ✗ | ✗ | — | ✗ |
| Settings page | ✗ | ✗ | — | ✗ |
| Reports & exports | ✗ | ✗ | — | ✗ |
| Database / backend | ✗ | ✗ | — | ✗ |
| Security hardening | ✗ | — | — | ✗ |
| Error boundaries | ✗ | — | — | ✗ |
| Automated tests | ✗ | — | — | ✗ |
| CI/CD pipeline | ✗ | — | — | ✗ |

---

## 7. Critical Blockers (Must Fix Before Any Operational Use)

1. **Chat page crashes at load** — `ConversationList`, `MessageThread`, `ContactInfo`, `ChatInput` are imported but do not exist (`src/components/pages/ChatPage.jsx`).
2. **Tasks page crashes at runtime** — `fetchTasks()` called by `TasksPage.jsx` is not exported from `src/api/index.js`.
3. **No backend / no database** — the entire system runs on seeded mock data. There is no persistence between sessions beyond `localStorage`.
4. **Dev admin bypass in production source** — `Login.jsx` and `api/index.js` auto-grant admin access when `REACT_APP_API_BASE_URL` is unset.
5. **JWT in localStorage** — token is accessible to any injected script; move to `httpOnly` cookie when a backend is available.

---

## 8. Phased Completion Gaps (vs. PHASES-PLAN.md)

| Phase | Description | Plan Status | Audit Finding |
|-------|-------------|-------------|---------------|
| 1 | Layout fixes (KPI grid, map, health panel) | ✓ DONE | Confirmed complete |
| 2 | NotificationBar WebSocket integration | ⏳ PENDING | Not started — bar uses hardcoded demo array |
| 3 | Sidebar restructure (5 items, role-based) | ⏳ PENDING | Sidebar items exist; role filtering present but sidebar overlap bug unresolved per plan |
| 4 | Dashboard metric corrections | ⏳ PENDING | Dashboard renders but metric accuracy unverified |
| 5 | Tasks page (CRUD + detail panel) | ⏳ PENDING | UI skeleton only; API missing |
| 6 | Chat page (3-column + WebRTC) | ⏳ PENDING | Page skeleton only; 4 components missing |
| 7 | Users page (admin + country flags) | ⏳ PENDING | Not started |
| 8 | Settings page (appearance, language, notifications) | ⏳ PENDING | Not started |
| 9 | Reports (disabled nav placeholder) | ⏳ PENDING | Nav item only |
| 10 | Map improvements (3D, terrain, dynamic sun) | 🔄 ONGOING | Substantially complete in `tileConfig.js` |

---

## 9. Recommendations (Priority Order)

### Immediate (blocker fixes)
1. Create the four missing Chat sub-components or replace `ChatPage.jsx` with a placeholder that does not crash.
2. Add `fetchTasks`, `createTask`, `updateTask`, `deleteTask` to `src/api/index.js` with demo-mode fallbacks matching the existing pattern.
3. Add a React error boundary (`ErrorBoundary`) wrapping each route so one broken page cannot crash the whole app.
4. Gate the dev auto-login behind a build-time flag (`process.env.NODE_ENV === 'development'`).

### Short-term (core command-center completeness)
5. Wire `useWebSocket` into `NotificationBar` — replace the static demo array with the message stream.
6. Integrate `useWebRTC` into `CallControls` and the chat sidebar — the hook is complete; the wiring is not.
7. Complete `TaskDetailPanel` auth-context binding and backend persistence (marked TODO in code).
8. Build `UsersPage` — the admin navigation item points to nothing.
9. Build `SettingsPage` — the sidebar item points to nothing.

### Medium-term (operational hardening)
10. Define and deploy a backend (REST + WebSocket server) with a real relational database; remove `localStorage` as a data store.
11. Move JWT to `httpOnly` cookies and enforce HTTPS.
12. Add server-side role enforcement — the frontend role check in `sidebar-data.js` is not a security boundary.
13. Implement an alert escalation model: priority tiers, acknowledgement, time-to-acknowledge tracking.
14. Add real GPS ingestion: a device-reporting endpoint and a push mechanism to update `LiveMap.jsx` markers.
15. Remove or archive `dashboard-src/` — it is a stale duplicate that inflates Docker image size and creates confusion.

### Long-term (management visibility & compliance)
16. Build a reporting engine: daily summary PDFs, SLA dashboards, researcher performance exports.
17. Add an audit log for all destructive user actions (delete, role change, project closure).
18. Write unit and integration tests for the API client, upload flows, and allocation algorithm.
19. Create a Docker Compose file that wires frontend, backend, database, and a WebSocket broker.
20. Set up a CI pipeline with lint, test, build, and image-publish stages.

---

## 10. File Reference Index

| File | Role | State |
|------|------|-------|
| `src/api/index.js` | Unified API client (2,214 lines) | Partial — demo complete, real integration stubbed |
| `src/App.jsx` | Router + layout + theme | Complete |
| `src/tileConfig.js` | MapLibre GL initialisation | Complete — sophisticated |
| `src/hooks/useWebSocket.js` | WebSocket hook | Complete — not integrated |
| `src/hooks/useWebRTC.js` | WebRTC hook | Complete — not integrated |
| `src/components/Login.jsx` | Auth form | Complete — dev bypass present |
| `src/components/ProjectDashboard.jsx` | Main command-center page | Mostly complete — metrics synthetic |
| `src/components/LiveMap.jsx` | Researcher tracking map | Mostly complete — GPS simulated |
| `src/components/ProjectDetail.jsx` | Project + map detail | Complete |
| `src/components/EconomicProjectDetail.jsx` | Economic survey management | Complete |
| `src/components/NotificationBar.jsx` | Alert pill bar | Partial — hardcoded demo data |
| `src/components/pages/TasksPage.jsx` | Task management | Partial — API missing |
| `src/components/pages/ChatPage.jsx` | Chat layout | Broken — imports 4 missing files |
| `src/components/CallControls.jsx` | Call UI | Partial — no hook wiring |
| `src/components/ChatWindow.jsx` | Chat bubble UI | Partial — no state connection |
| `src/components/TaskDetailPanel.jsx` | Task editor | Partial — TODOs in code |
| `src/components/layout/data/sidebar-data.js` | Nav config + role filter | Complete |
| `DESIGN.md` | Design system spec | Reference |
| `PHASES-PLAN.md` | 10-phase roadmap | Reference — 8 phases open |
| `Dockerfile` | Container definition | Minimal — no compose, no TLS |
| `.env` | Environment config | Present — should not be committed |
| `dashboard-src/` | Stale app duplicate | Should be removed |
| `public/data/*.csv` | Demo seed data | Reference — not production data |

---

*Report generated by codebase audit — no files were modified.*
