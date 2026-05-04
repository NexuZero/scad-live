# SCAD MAP Live — Master Roadmap & Implementation Guide

**Generated:** 2026-05-03  
**Status:** Active Reference — update after completing each milestone  
**Purpose:** Single source of truth for where the project is, where it must go, and how to get there. Every task below is actionable, ordered by impact, and informed by UI/UX plugin analysis, codebase audit, and industry research.

---

## 1. Executive Snapshot

| Attribute | Current State |
|-----------|--------------|
| Completion | ~65–70% of intended design scope |
| Pages working | Dashboard, Live Map, Surveys, Enumerators, Users ✓ |
| Pages broken/partial | Chat (imports fixed ✓), Tasks (partial), Settings (partial) |
| Backend | None — full demo/mock mode via `src/api/index.js` |
| Real-time | WebSocket + WebRTC hooks exist but not wired to UI |
| Auth | JWT in `localStorage` — functional but insecure for prod |
| Design System | Custom CSS-in-JS, CSS variables, no design token library |
| Tests | Zero test files |

---

## 2. Design System (UI/UX Plugin Recommendations)

**Plugin Output — SCAD MAP Live Design System:**

### 2.1 Style
- **Primary Style:** Dark Mode (OLED) + Data-Dense  
- **Secondary Style:** Accessible & Ethical (government mandate)  
- **Anti-patterns to avoid:** decorative animations, low contrast, random mixed styles, emoji as icons

### 2.2 Color Tokens (Operations Room Dark Palette)

Apply these as CSS variables in `src/index.css`. The existing dark palette is close — align precisely to these values:

```css
:root[data-theme="dark"] {
  --color-bg-primary:     #020617;   /* deepest background */
  --color-bg-secondary:   #0F172A;   /* card background */
  --color-bg-card:        #0E1223;   /* elevated card */
  --color-bg-muted:       #1A1E2F;   /* subtle surface */
  --color-border:         #334155;
  --color-border-light:   #1E293B;
  --color-text-primary:   #F8FAFC;
  --color-text-secondary: #CBD5E1;
  --color-text-muted:     #94A3B8;
  --color-text-faint:     #475569;
  --color-accent-green:   #22C55E;   /* positive / online */
  --color-accent-blue:    #4FC3F7;   /* brand / info */
  --color-accent-amber:   #F59E0B;   /* warning */
  --color-accent-red:     #EF4444;   /* critical / error */
  --color-accent-teal:    #14B8A6;   /* milestone */
  --color-destructive:    #DC2626;
}

:root[data-theme="light"] {
  --color-bg-primary:     #F8FAFC;
  --color-bg-secondary:   #FFFFFF;
  --color-bg-card:        #FFFFFF;
  --color-bg-muted:       #E8ECF1;
  --color-border:         #E2E8F0;
  --color-border-light:   #F1F5F9;
  --color-text-primary:   #020617;
  --color-text-secondary: #334155;
  --color-text-muted:     #64748B;
  --color-text-faint:     #94A3B8;
  /* accents same in both themes */
}
```

### 2.3 Typography

Plugin recommendation: **Fira Code** (headings/labels/monospace data) + **Fira Sans** (body/UI text). This is optimised for data-dense dashboards and technical operations rooms.

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');

:root {
  --font-body:   'Fira Sans', -apple-system, sans-serif;
  --font-mono:   'Fira Code', 'SF Mono', monospace;
  --text-xs:     11px;
  --text-sm:     12px;
  --text-base:   13px;
  --text-md:     14px;
  --text-lg:     16px;
  --text-xl:     20px;
  --text-2xl:    24px;
  --text-3xl:    32px;
}
```

### 2.4 Spacing Scale (8pt grid)

```css
:root {
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --space-8: 32px; --space-10: 40px; --space-12: 48px;
}
```

### 2.5 Interactive State Rules (per plugin)

- All clickable elements: `cursor: pointer`
- Hover transitions: `transition: all 150ms ease-out`
- Touch targets: minimum `44px × 44px`
- Focus rings: `outline: 2px solid var(--color-accent-blue); outline-offset: 2px`
- Disabled: `opacity: 0.4; cursor: not-allowed`
- Skeleton loaders for any async >300ms (not blank screens)
- `prefers-reduced-motion`: wrap all CSS transitions

### 2.6 Component Elevation Scale

```
Level 0 — page background
Level 1 — sidebar, secondary panels
Level 2 — cards, tables
Level 3 — dropdowns, tooltips
Level 4 — modals, drawers
Level 5 — toasts, alerts
```

---

## 3. Project Manager Account & Portal

### 3.1 PM Account Definition

Create a dedicated demo account in `src/api/index.js` mock users array:

```
Name:     Fatima Al Zaabi  (already in mock data as usr-2)
Email:    fatima@scad.ae
Role:     project_manager
Password: (demo — any string triggers auto-login when dev mode)
Projects: All 4+ active demo projects assigned
```

### 3.2 PM Portal — What It Sees

When `user.role === 'project_manager'`, the Command Center must show a **Portfolio View** instead of the generic admin dashboard. Key UI patterns (from PM Portal research):

**Portfolio Dashboard Widget Row (top of CommandCenter):**
- Project cards: name, % complete, status pill, days remaining, researcher count
- Capacity indicator: assigned researchers / available slots
- Risk badge: Low / Medium / High (computed from overdue tasks, geofence breaches)
- Quick action: "View on Map" → opens LiveMap filtered to that project

**LiveMap Integration for PM:**
- On the LiveMap page, PM sees a project selector dropdown (top-left)
- Selecting a project filters researcher pins, trails, and geofence to that project only
- "Demo mode" label overlay in bottom-right corner on all demo data

**PM-specific sidebar items** (hide admin-only items):
- Command Center (portfolio view)
- Live Map (project-filtered)
- Tasks (assigned to PM's projects)
- Chat (conversations with their researchers)
- Settings

**Data needed in API demo layer:**
- `fetchProjectPortfolio()` → array of project summaries for PM role
- `fetchProjectRisk()` already exists — surface this visually

---

## 4. Critical Blocker Fixes (Do These First)

These must be resolved before any polish work. Each will cause a runtime crash if not fixed.

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `src/components/pages/ChatPage.jsx` | Imports 4 chat sub-components | Fixed ✓ — `chat/` folder exists |
| 2 | `src/api/index.js` | `fetchTasks`, `createTask`, `updateTask`, `deleteTask` not exported | Add demo fallbacks matching existing pattern |
| 3 | `src/components/pages/TasksPage.jsx` | References above missing functions | Will work once #2 is done |
| 4 | `src/components/layout/` | `AppSidebar.jsx`, `NavGroup.jsx`, `NavUser.jsx` exist but may not be wired | Verify App.jsx uses them or not |
| 5 | Dev bypass | Auto admin login leaks to all builds | Already gated by `NODE_ENV === 'development'` ✓ |

---

## 5. Implementation Phases (Ordered by Priority)

### PHASE A — Design System Foundation  
**Effort:** ~2–3 hours | **Impact:** Entire product looks professional

- [ ] **A1** Update `src/index.css` with full token set from §2.2 and §2.4
- [ ] **A2** Add Fira Code + Fira Sans Google Fonts import to `public/index.html`
- [ ] **A3** Apply `font-family: var(--font-body)` globally; `var(--font-mono)` to timestamps, KPI numbers, map coordinates
- [ ] **A4** Audit every `style={}` object in App.jsx — replace raw hex values with CSS vars
- [ ] **A5** Add `cursor: pointer` to every button/link that lacks it
- [ ] **A6** Add `transition: all 150ms ease-out` to all interactive elements (NavLink, buttons, pills)
- [ ] **A7** Add `@media (prefers-reduced-motion: reduce)` block disabling all transitions
- [ ] **A8** Verify all text contrast ≥4.5:1 in dark mode, ≥4.5:1 in light mode
- [ ] **A9** Skeleton loader component: `<Skeleton width height />` → use pulsing gradient
- [ ] **A10** Toast notification system: lightweight component, auto-dismiss 4s, aria-live="polite"

---

### PHASE B — Navigation & Layout Upgrade  
**Effort:** ~3–4 hours | **Impact:** Professional sidebar replaces current top navbar

The current horizontal nav bar in App.jsx is functional but does not match the intended shadcn-style sidebar design. The `AppSidebar.jsx`, `NavGroup.jsx`, `NavUser.jsx` components exist in `layout/` — they must be wired into the app.

- [ ] **B1** Audit `src/components/layout/AppSidebar.jsx` — check if it renders correctly
- [ ] **B2** Replace `NavBar` in `App.jsx` with vertical sidebar layout
  - Sidebar width: 220px expanded, 60px collapsed
  - Toggle: collapse button at bottom of sidebar
  - Logo at top, nav items in middle, user card (`NavUser`) at bottom
- [ ] **B3** Sidebar nav items (5 items per PHASES-PLAN Phase 3):
  1. Command Center → `/` (LayoutDashboard icon)
  2. Live Map → `/live` (Map icon)
  3. Tasks → `/tasks` (ListChecks icon) — roles: admin, project_manager, supervisor
  4. Chat → `/chat` (MessageCircle icon) — unread badge
  5. Users → `/users` (Users icon) — admin only
  6. Settings → `/settings` (Settings icon)
  7. Reports → disabled, tooltip "Coming soon"
- [ ] **B4** Move Surveys and Enumerators to Project-level navigation (accessible from project detail)
- [ ] **B5** NotificationBar height 36px, below header, above main content — wire to demo alert array
- [ ] **B6** Fix z-index stack: sidebar (z:20), modal (z:100), toast (z:200)
- [ ] **B7** `main` content area: `margin-left: 220px` (or flex) — must not be covered by sidebar
- [ ] **B8** Collapsible sidebar state persisted to `localStorage`

---

### PHASE C — Dashboard (Command Center) Enhancement  
**Effort:** ~4–5 hours | **Impact:** Core page becomes a real command center

- [ ] **C1** Header row: "Command Center" title + live clock (updates every second, `HH:mm:ss`) + "Abu Dhabi, UAE" label
- [ ] **C2** KPI cards — 4 equal-width cards, min-height 90px:
  1. Currently Online Researchers (number + delta vs yesterday, green arrow)
  2. Active Projects (number + "X completing soon" subtitle)
  3. Samples Completed Today (number + delta %)
  4. Alerts Today (number + delta, red if increased)
- [ ] **C3** KPI cards use `var(--font-mono)` for the large number, `var(--font-body)` for label
- [ ] **C4** Map embed: replace placeholder with `<LiveMap />` in embedded mode (no full-screen toggle, no sidebar controls), `flex-1` height
- [ ] **C5** Map overlay: "Abu Dhabi" label top-left, absolute positioned
- [ ] **C6** System Health panel (single card):
  - WebSocket status dot: green "Healthy" / red "Degraded"
  - Active researchers count
  - GPS signal quality: progress bar 0–100%
  - Data ingestion rate: N pings/min
- [ ] **C7** Activity feed: timestamp (mono) + event description, max 50 items, scrollable, "View all" link
- [ ] **C8** PM Portfolio View: when `role === 'project_manager'`, show project cards grid above KPI row
- [ ] **C9** Auto-refresh: 30s cycle with subtle "last updated" timestamp, no full-page flash

---

### PHASE D — Tasks Page Completion  
**Effort:** ~3–4 hours | **Impact:** Removes a broken page, adds core feature

Current state: UI exists in `TasksPage.jsx` (276 lines) and supporting components, but API functions missing.

- [ ] **D1** Add to `src/api/index.js`:
  ```js
  fetchTasks()     // GET /api/tasks  — demo: return mock tasks array
  createTask(data) // POST /api/tasks — demo: push to mock array, return with id
  updateTask(id, data) // PUT /api/tasks/:id — demo: merge update
  deleteTask(id)   // DELETE /api/tasks/:id — demo: filter from array
  ```
- [ ] **D2** Wire `TaskDetailPanel.jsx` to auth context: replace `// TODO: get from auth context` with `getStoredName()` / `getStoredRole()`
- [ ] **D3** Wire task save to API: replace `// TODO: persist to backend` with `updateTask()` call
- [ ] **D4** Task filters: project dropdown, status filter (Open/In Progress/Done), priority filter
- [ ] **D5** Task creation form validation: required title, required project, date picker
- [ ] **D6** Task list: skeleton loader on initial load, empty state when no tasks

---

### PHASE E — Settings Page Completion  
**Effort:** ~2–3 hours | **Impact:** User personalization, theme persistence

Current state: `SettingsPage.jsx` exists (249 lines) — check what sections are implemented.

- [ ] **E1** Audit current SettingsPage — identify what renders vs. what is stub
- [ ] **E2** Profile section: avatar initials (same as UsersPage pattern), name, email (read-only), role badge
- [ ] **E3** Appearance section: Light / Dark / System radio cards (connected to `setTheme()` in `tileConfig.js`)
- [ ] **E4** Notifications section: toggles for each alert type, persist to `localStorage`
- [ ] **E5** Font & Language section:
  - Interface language: English / Arabic (Arabic → `document.dir = 'rtl'`)
  - Font size: Small (12px) / Default (13px) / Large (15px) — apply to `--text-base`
  - Map labels: English / Arabic / Bilingual
- [ ] **E6** All settings persist to `localStorage` under `scad_user_prefs`
- [ ] **E7** Load settings on mount, apply immediately

---

### PHASE F — Chat Page Polish  
**Effort:** ~2 hours | **Impact:** Chat page is now functional, needs polish

Current state: `ChatPage.jsx` imports the 4 sub-components that now exist. Needs styling and UX pass.

- [ ] **F1** Run the page — verify it loads without crash
- [ ] **F2** ConversationList: verify status dots (green/orange/gray), unread badge count, timestamps
- [ ] **F3** MessageThread: verify alignment (sent = right, received = left), loading state
- [ ] **F4** ContactInfo panel: researcher details, "View on Map →" link
- [ ] **F5** ChatInput: send on Enter key, disabled while sending, character limit indicator
- [ ] **F6** Wire `useWebSocket` to chat: on new message event, push to messages array
- [ ] **F7** Unread count badge on Chat nav item: read from `localStorage` `chat_unread_count`

---

### PHASE G — Live Map Enhancements  
**Effort:** ~3 hours | **Impact:** Map becomes fully operational demo

- [ ] **G1** PM project filter: dropdown overlay on map to filter researchers by project
- [ ] **G2** "Demo" watermark badge: bottom-right corner, subtle opacity
- [ ] **G3** Cluster rendering: implement MapLibre cluster source for sample points >50 (use `cluster: true` on GeoJSON source)
- [ ] **G4** Researcher popup improvements: show assignment, sample progress bar, last contact time
- [ ] **G5** Geofence UI: draw geofence boundary when a project is selected
- [ ] **G6** Map embed mode: prop `embedded={true}` removes full-screen controls, disables pan outside Abu Dhabi bounds
- [ ] **G7** Performance: `maxParallelImageRequests: 6` (HTTP/2 optimisation per MapLibre research)

---

### PHASE H — Notification & Alert System  
**Effort:** ~2–3 hours | **Impact:** Real-time feel without a backend

- [ ] **H1** Wire `useWebSocket` into `NotificationBar` — replace static demo array
- [ ] **H2** Alert priority tiers: info (blue), warning (amber), critical (red)
- [ ] **H3** Acknowledgement: clicking an alert marks it acknowledged (removes it from bar, logs to activity feed)
- [ ] **H4** Alert persistence across page navigation: store acknowledged alerts in `localStorage`
- [ ] **H5** Simulated real-time: in demo mode, generate random realistic alerts every 45–90 seconds (geofence breach, researcher offline, sample milestone)
- [ ] **H6** Alert drawer: "View all" opens a drawer with full alert history, filterable by type/time

---

### PHASE I — Reports Placeholder  
**Effort:** ~30 minutes | **Impact:** Completes navigation, sets expectation

- [ ] **I1** Add Reports to sidebar nav: `BarChart3` icon, `opacity: 0.4`, `cursor: not-allowed`
- [ ] **I2** Clicking shows toast: "Reports coming in a future release"
- [ ] **I3** Route `/reports` renders a placeholder page with a "Coming Soon" illustration

---

### PHASE J — Security Hardening (Pre-Demo)  
**Effort:** ~1–2 hours | **Impact:** Safe to show to stakeholders

- [ ] **J1** Dev bypass already gated by `NODE_ENV === 'development'` ✓ — verify production build strips it
- [ ] **J2** Add `process.env.NODE_ENV !== 'production'` check around all dev shortcuts
- [ ] **J3** Document in `README.md`: "Never deploy without a backend — this is a frontend-only demo"
- [ ] **J4** Remove `dashboard-src/` stale duplicate directory

---

## 6. Architecture Decisions (When Backend Is Added)

Research findings (from online research, 2026):

### Auth
- **Use:** Short-lived access token in memory (React Context/state), refresh token in `HttpOnly` cookie
- **Why:** Protects against XSS token theft (no `localStorage` for tokens)
- **Pattern:** On page load → silent refresh via `/auth/refresh` → store access token in Context → attach to all API calls
- **Session expiry:** Auto-redirect to `/login` when refresh fails

### State Management
- **Use:** Zustand (lightweight) or React Context with `useReducer`
- **Scope:** Global state for: `currentUser`, `notifications`, `selectedProject`, `chatUnreadCount`
- **Why:** Current `localStorage`-based cross-component sharing breaks when multiple tabs are open

### Backend Stack (recommended)
- **Framework:** Node.js + Fastify (or Express) — matches existing JS/React stack
- **Database:** PostgreSQL + Prisma ORM (schema already implied by API client shapes)
- **Real-time:** Socket.io or native WebSocket server
- **Deployment:** Docker Compose — frontend + API + PostgreSQL + Redis (for WebSocket pub/sub)

### MapLibre Production
- **Tiles:** Host PMTiles files locally (eliminate dependency on OpenFreeMap for production)
- **Clustering:** Server-side via PostGIS `ST_ClusterDBSCAN` — 90% payload reduction
- **Offline:** Implement MapLibre offline manager for field tablets in low-connectivity zones
- **Glyphs:** Self-host to eliminate CORS delay on first load

---

## 7. PM Portal — Full Feature Specification

### Account
```
ID:         usr-2
Name:       Fatima Al Zaabi
Email:      fatima@scad.ae
Role:       project_manager
Projects:   All 4 active demo projects
Password:   scad2026 (demo login)
```

### PM Dashboard View Differences vs Admin
| Feature | Admin | Project Manager |
|---------|-------|----------------|
| All users table | ✓ | ✗ |
| User create/delete | ✓ | ✗ |
| All projects KPI | ✓ | Own projects only |
| Portfolio card grid | ✗ | ✓ |
| Live Map | All researchers | Project-filtered |
| Tasks | All | Own projects |
| Chat | All conversations | Own team |
| Settings | Full | Full |

### Portfolio Card Design
Each project card (min-width: 280px, in a responsive grid):
```
┌─────────────────────────────┐
│ [Status pill]  [Risk badge] │
│ Project Name                │
│ ────────────────────────    │
│ 142 / 156 researchers  91%  │
│ ████████████░░  Progress    │
│ 2,340 samples today         │
│ 12 days remaining           │
│ [View on Map →]  [Tasks →] │
└─────────────────────────────┘
```

---

## 8. Component Enhancement Checklist

Apply to every component during each Phase above:

- [ ] No raw hex in `style={}` — use CSS variables only
- [ ] All buttons: `cursor: pointer`, hover state, disabled state
- [ ] All async loads: skeleton loader, not empty screen
- [ ] All forms: visible labels (not placeholder-only), error message below field
- [ ] All destructive actions: confirmation dialog before execution
- [ ] All tables: sticky header, keyboard navigable (tabIndex), sortable columns
- [ ] All modals: `role="dialog"`, `aria-modal="true"`, close on Escape key, focus trap
- [ ] All toasts: `aria-live="polite"`, auto-dismiss 4s, manual dismiss ×
- [ ] All icons: SVG (Lucide), never emoji, `aria-hidden="true"` when decorative
- [ ] All status pills: never color-only — always include text label

---

## 9. Effort & Priority Matrix

| Phase | Description | Effort | Priority | Dependency |
|-------|-------------|--------|----------|------------|
| A | Design system tokens | 2h | CRITICAL | None |
| B | Sidebar navigation | 4h | CRITICAL | A |
| C | Dashboard enhancement | 5h | HIGH | A, B |
| D | Tasks page fix | 3h | HIGH | A |
| G | Live Map + PM filter | 3h | HIGH | A, C |
| E | Settings completion | 3h | MEDIUM | A |
| F | Chat page polish | 2h | MEDIUM | A |
| H | Notification system | 3h | MEDIUM | B |
| I | Reports placeholder | 0.5h | LOW | B |
| J | Security/cleanup | 2h | LOW | — |

**Total estimated effort: ~27.5 hours of focused implementation**

---

## 10. Success Criteria

The project is ready for stakeholder demo when:

- [ ] App loads without any console errors or React warnings
- [ ] Logging in as `project_manager` shows the PM portfolio view with real project cards
- [ ] Live Map shows researcher pins with project filter working
- [ ] Chat page opens with conversation list, messages load on selection
- [ ] Tasks page shows task list, creation modal works
- [ ] Settings saves theme choice and persists on reload
- [ ] Sidebar navigation works for all roles (admin sees Users, PM does not)
- [ ] NotificationBar shows ≥3 real-looking alert types
- [ ] Dark and light themes both look professional (no broken colors)
- [ ] Typography is consistent: Fira Sans body, Fira Code numbers/timestamps
- [ ] No horizontal scroll at any viewport width ≥1024px
- [ ] All buttons have `cursor: pointer` and visible hover state
- [ ] Demo data is clearly labelled as demo ("Simulation Mode" indicator on Live Map)

---

## 11. Files Index (Current State)

| File | Status | Next Action |
|------|--------|------------|
| `src/App.jsx` | Working — top navbar | Phase B: replace with sidebar layout |
| `src/index.css` | Partial CSS vars | Phase A: full token set |
| `src/api/index.js` | 2,214 lines, demo complete | Phase D: add task functions |
| `src/tileConfig.js` | Complete | Phase G: add embed mode prop |
| `src/hooks/useWebSocket.js` | Complete, unwired | Phase F+H: wire to chat + notifications |
| `src/hooks/useWebRTC.js` | Complete, unwired | Future: wire to CallControls |
| `src/components/ProjectDashboard.jsx` | Working | Phase C: PM portfolio view |
| `src/components/LiveMap.jsx` | Working/simulated | Phase G: project filter |
| `src/components/NotificationBar.jsx` | Partial/hardcoded | Phase H: dynamic alerts |
| `src/components/pages/ChatPage.jsx` | Fixed | Phase F: polish + WebSocket |
| `src/components/pages/TasksPage.jsx` | Partial | Phase D: add API + wire |
| `src/components/pages/UsersPage.jsx` | Working ✓ | None |
| `src/components/pages/SettingsPage.jsx` | Partial | Phase E: complete sections |
| `src/components/layout/AppSidebar.jsx` | Exists, unwired | Phase B: wire to App.jsx |
| `dashboard-src/` | Stale duplicate | Phase J: delete |

---

## 12. Skills Required for Each Phase

| Phase | Skill / Tool |
|-------|-------------|
| A — Design system | `ui-ux-pro-max` design tokens, CSS custom properties |
| B — Sidebar layout | `ui-ux-pro-max` navigation patterns, React layout patterns |
| C — Dashboard | React state, CSS Grid, real-time data patterns |
| D — Tasks | React CRUD patterns, form validation, API client pattern |
| E — Settings | React controlled forms, localStorage persistence |
| F — Chat | WebSocket integration, optimistic UI, React state |
| G — Map | MapLibre GL GeoJSON, clustering, layer management |
| H — Notifications | WebSocket pub/sub, React Context, escalation logic |
| I — Reports | React Router, disabled nav state, toast |
| J — Security | Build config, env vars, React Router guards |

---

*This roadmap is the implementation contract. Work top to bottom, complete each phase fully before advancing, and update checkboxes as each task is done.*
