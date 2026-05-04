# SCAD MAP Redesign — Implementation Plan (Phases 1-9)

**Status:** In Progress  
**Started:** 2026-04-07  
**Skills Applied:** design-system, frontend-design, frontend-patterns, tdd-workflow, documentation-lookup  
**Reference:** `examples/New Template/shadcn-template.md`

---

## Phase 1: Layout Alignment Fix (COMPLETED ✓)

**Goal:** Fix CSS Grid structure in CommandCenter

- [x] KPI cards: equal width, `min-h-[90px]`, stretch alignment
- [x] Map container: `flex-1` to fill available space
- [x] System Health: single panel (not two separate cards)
- [x] Activity feed: fixed `h-[120px]`, scrollable
- [x] KPI card styling: `p-4`, value `text-[28px]`, label `text-[11px] uppercase tracking-[0.08em]`
- [x] StatusPill: `h-9` (36px) row height

**Files Modified:**
- `src/components/pages/CommandCenter.jsx`

**Notes:**
- Map container uses `flex-[2]` ratio
- System Health now contains both metrics and offline list in one card with divider
- Activity feed converted from "Recent Alerts" to "Recent Activity" per spec

---

## Phase 2: Header Notification Bar (PENDING)

**Goal:** Add notification bar below nav, above KPI cards

**Tasks:**
- [ ] Create `NotificationBar.jsx` component
  - Height: 36px fixed (`h-9`)
  - Background: `bg-background/60` or `rgba(255,255,255,0.04)` in dark
  - Border-bottom: `border-b border-border/30`
  - Flex row layout, overflow-x auto, hide scrollbar
- [ ] Notification pill styling:
  - Types: started (blue), ending (orange), completed (green), offline (red), breach (red), milestone (teal)
  - Left border: `2px solid` color
  - Background: `bg-${color}/10`
  - Dismiss × button (10px)
  - Timestamp: right-aligned `text-[10px]`
  - Max 8 visible, auto-dismiss 10min
- [ ] "View all →" link at far right (opens drawer - future)
- [ ] WebSocket integration: subscribe to alert feed
  - Use existing `useWebSocket` hook or create one
  - Push new notifications to state (array, newest on right)
- [ ] Update `Layout.jsx` to include NotificationBar between Header and main content
- [ ] Dismiss functionality: click × removes pill
- [ ] Test: simulate notifications, verify max count, auto-dismiss

**Files to Create/Modify:**
- `src/components/NotificationBar.jsx` (new)
- `src/components/layout/Layout.jsx` (modify to include NotificationBar)
- `src/hooks/use-notifications.js` (new, WebSocket listener)
- `src/api/index.js` (add notification endpoint if needed)

**Design Tokens to Use:**
- `bg-background`, `text-muted`, `border-border`
- Notification colors: `ops-teal`, `ops-green`, `ops-amber`, `ops-red`, `ops-blue`
- Font: `text-xs` (12px), `font-mono` for timestamp

---

## Phase 3: Sidebar Navigation Restructure (PENDING)

**Goal:** Reduce to exactly 5 items, role-based visibility

**Tasks:**
- [ ] Update `data/sidebar-data.js` to contain only these items:
  1. Command Center (`/dashboard`, icon: LayoutDashboard)
  2. Tasks (`/tasks`, icon: ListChecks) — new page
  3. Chat (`/chat`, icon: MessageCircle) — new page, badge unread count
  4. Users (`/users`, icon: Users) — admin only
  5. Settings (`/settings`, icon: Settings)
- [ ] Remove: Live Map, Research Projects, Enumerators Registry, Economic Projects, Alert Feed from main nav (they'll move elsewhere or be accessible via other means)
- [ ] Add ` NavUser` user card at bottom (already exists)
- [ ] Ensure sidebar width 220px, collapsible to 60px (already shadcn-ui supports this)
- [ ] Add unread badge logic to Chat nav item:
  - Small circle, `h-4 w-4`, `bg-ops-red`, text white `text-[10px]`
  - Position: absolute top-0 right-0 or inline badge
- [ ] Role-based visibility:
  - Users nav: `if (user.role === 'admin')`
  - Tasks nav: `if (['admin', 'project_manager', 'supervisor'].includes(user.role))`
- [ ] Active state styling: filled background pill (already shadcn pattern)
- [ ] Verify sidebar doesn't overlap content (z-index fix if needed)

**Files to Modify:**
- `src/components/layout/data/sidebar-data.js`
- `src/components/layout/NavGroup.jsx` (if badge support needed)
- `src/components/layout/NavUser.jsx` (ensure proper display)

**Spec Compliance:**
- Icons: `lucide-react` size 16px
- Label: 13px, weight 500 active / 400 inactive
- Separator lines between sections: 0.5px opacity

---

## Phase 4: Dashboard Page — SCAD Specific Content (PENDING)

**Goal:** Make Command Center metrics field-survey specific

**Tasks:**
- [ ] **Header row**:
  - Title: "Command Center"
  - Date: e.g., "Apr 7, 2026"
  - Location: "Abu Dhabi, UAE"
  - Live clock: update every second, format "HH:mm:ss"
  - Layout: `flex justify-between items-center`
- [ ] **KPI cards** — correct metrics:
  1. Currently Online researchers (number, delta vs yesterday)
  2. Active Projects (number, subtitle "X completing soon")
  3. Total Samples Completed today (number, delta %)
  4. Alerts Today (number, delta, red if increased)
- [ ] **Map embed**:
  - Replace placeholder with actual `ProjectDetail.jsx` map component
  - Overlay label: "Abu Dhabi" (top-left corner, `absolute`)
  - Map must fill `flex-1` container exactly
- [ ] **System Health panel** (single card):
  - WebSocket status: green dot + "Healthy" or red "Degraded"
  - Active researchers count: number
  - GPS signal quality: percentage with progress ring or text
  - Data ingestion rate: pings/min (from Redis stream metrics)
- [ ] **Activity feed**:
  - Row: `timestamp (10px mono)` + `event description (12px)`
  - Types: geofence exit, sample completion, researcher login/logout, project status change
  - Max 50 items, scrollable
  - Link: "View all activity →" (future Alerts page)

**Files to Modify:**
- `src/components/pages/CommandCenter.jsx` (metric updates)
- `src/components/ProjectDetail.jsx` (make embeddable)
- `src/api/index.js` (ensure API returns correct data structure)

**API Data Structure Required:**
```js
{
  total_researchers: 156,
  online: 142,
  online_pct: 91,
  active_projects: 12,
  samples_completed_today: 2340,
  samples_delta_pct: 12.5,
  alerts_today: 5,
  alerts_delta: -3,
  recent_activity: [
    { id, timestamp, type, description }
  ],
  system_health: {
    websocket_status: 'healthy', // or 'degraded'
    active_researchers: 142,
    gps_signal_quality: 94, // %
    ingestion_rate: 2450 // pings/min
  }
}
```

---

## Phase 5: Tasks Page (PENDING)

**Goal:** Full task management interface

**Tasks:**
- [ ] Create `TasksPage.jsx`
  - Left: task list (table or list view)
  - Right: detail panel (drawer, 320px, slides in on selection)
- [ ] Task list columns:
  - Checkbox (select), Title, Project, Assigned to, Due date, Priority pill, Status pill
- [ ] Filters above list:
  - Search input (title+description)
  - Project dropdown, Assignee dropdown, Status select (Open/In Progress/Done), Priority select, Due date range
- [ ] "+ New Task" button (top right) → opens modal
- [ ] Task creation modal:
  - Fields: title, description, project (dropdown from API), assign to (user search), due date (date picker), priority (High/Medium/Low)
- [ ] Task detail panel:
  - Inline edit for all fields
  - Activity log (who changed what, when)
  - Comments thread (plain text, no rich text)
  - "Mark Complete" button (green)
- [ ] API integration: `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`

**Files to Create:**
- `src/components/pages/TasksPage.jsx`
- `src/components/TaskList.jsx`
- `src/components/TaskDetailPanel.jsx`
- `src/components/TaskCreateModal.jsx`

**Database:** Requires `tasks` table (if not exists)

---

## Phase 6: Chat Page (PENDING)

**Goal:** 3-column chat interface with WebRTC

**Tasks:**
- [ ] Create `ChatPage.jsx`
  - Layout: grid `grid-cols-[280px_1fr_260px]` or flex with fixed widths
- [ ] Conversation list (280px):
  - Search bar: "Search chats..."
  - Each row: avatar (initials circle, status dot), name, last message preview, timestamp, unread badge
  - Active conversation highlight
  - Status dot colors: green (online), orange (in-field), gray (offline)
- [ ] Message thread (flex 1):
  - Header: researcher name + FW-ID + status
  - Call button (top right, initiates WebRTC via existing signaling)
  - Messages: sender right (blue bg, white text), receiver left (dark surface, muted text)
  - Input at bottom with send button
- [ ] Contact info panel (260px):
  - Avatar + name EN/AR
  - FW-ID, phone, email, region, shift
  - Current location (coords, last updated X min ago)
  - Assigned project name
  - Sample progress: X / Y completed
  - "View on map →" link
- [ ] Unread count integration: total badge on Chat nav item
- [ ] WebSocket integration: real-time message delivery
- [ ] Mark conversation as read on open

**Files to Create:**
- `src/components/pages/ChatPage.jsx`
- `src/components/chat/ConversationList.jsx`
- `src/components/chat/MessageThread.jsx`
- `src/components/chat/ContactInfo.jsx`
- `src/components/chat/ChatInput.jsx`

**API Endpoints:**
- `GET /api/chat/conversations` (list with last message, unread count)
- `GET /api/chat/conversations/:id/messages`
- `POST /api/chat/conversations/:id/messages`
- `POST /api/chat/conversations/:id/read` (mark read)

---

## Phase 7: Users Page (Admin Only) (PENDING)

**Goal:** User management with country flags

**Tasks:**
- [ ] Create `UsersPage.jsx` (admin role check, redirect if not admin)
- [ ] Page header:
  - Title: "User List"
  - Subtitle: "Manage your users and their classifications"
  - Buttons: "Invite User" (secondary), "Add User" (primary)
- [ ] Filter bar:
  - Search: "Filter users..."
  - Status dropdown: All / Active / Invited / Suspended / Inactive
  - Role dropdown: All / Admin / Project Manager / Project Supervisor / Enumerator / Controller / Viewer
- [ ] User table columns:
  - Checkbox (select all via row checkbox)
  - Username
  - Name (full name)
  - Email
  - Phone Number
  - Country: **flag emoji + country name** (from ISO 3166-1 alpha-2 code)
  - Status pill: Active (green), Invited (blue), Suspended (red), Inactive (gray)
  - Role pill: with icon (match shadcn admin style)
  - Actions: three-dot menu → Edit, Suspend, Remove, Reset Password
- [ ] Row interactions:
  - Click row → opens user detail drawer (right, 320px)
  - Drawer: profile, role history, assigned projects, last active
- [ ] "Add User" modal:
  - Fields: full name (EN), full name (AR optional), email, phone, username, role, country (searchable dropdown with flags), shift (if enumerator/controller), region
  - Send invite by email checkbox
- [ ] **Country flag rendering utility:**
  - `utils/country-flags.js`: `getFlagEmoji(isoCode)` function

**Files to Create:**
- `src/components/pages/UsersPage.jsx`
- `src/components/users/UserTable.jsx`
- `src/components/users/UserDetailDrawer.jsx`
- `src/components/users/UserCreateModal.jsx`
- `src/utils/country-flags.js`

**Database:** `users` table must have `country_code` (VARCHAR(2), ISO alpha-2)

---

## Phase 8: Settings Page (PENDING)

**Goal:** 4-section settings with language/theme toggles

**Tasks:**
- [ ] Create `SettingsPage.jsx`
- [ ] Left sidebar tabs: Profile, Appearance, Notifications, Font & Language
- [ ] **Section 1: Profile**
  - Avatar upload (circle crop, 96px display)
  - Full name (EN), Full name (AR)
  - Email (read-only, change via separate flow)
  - Phone number
  - Role (read-only, badge)
  - Country (flag + name, editable dropdown)
  - Save button
- [ ] **Section 2: Appearance**
  - Theme: Light / Dark / System — radio cards with preview thumbnails
  - Default for ops room: Dark (pre-selected)
  - Map style: auto-switch based on theme (`scad-style.json` vs `scad-style-dark.json`)
  - Sidebar: Expanded / Collapsed default toggle
- [ ] **Section 3: Notifications**
  - Channels toggles:
    - Email notifications (on/off) → URL field for webhook if on
    - Teams/Slack webhook (on/off + URL input)
    - Browser push notifications (on/off)
  - Notification types toggles (individual):
    - Project started, Project ending (3d), Project completed,
    - Researcher offline (>10min), Geofence breach,
    - Sample milestone (50%, 100%), New chat message (tab inactive),
    - System health degraded
  - All toggles persist to user preferences API
- [ ] **Section 4: Font & Language**
  - Interface language: Arabic / English (radio, default English)
    - Arabic selected → apply `dir="rtl"` to body, RTL Tailwind classes
  - Font size: Small (13px) / Default (14px) / Large (16px)
  - Map label language: Arabic first / English first / Bilingual (controls name field priority in MapLibre)
  - Number format: Western (1,234) / Arabic-Indic (١٬٢٣٤)
- [ ] Persist settings to `localStorage` or API `PATCH /api/user/preferences`
- [ ] Load settings on mount, apply immediately

**Files to Create:**
- `src/components/pages/SettingsPage.jsx`
- `src/components/settings/SettingsProfile.jsx`
- `src/components/settings/SettingsAppearance.jsx`
- `src/components/settings/SettingsNotifications.jsx`
- `src/components/settings/SettingsFontLanguage.jsx`
- `src/hooks/use-user-preferences.js` (new)

**API Endpoints:**
- `GET /api/user/preferences`
- `PATCH /api/user/preferences`

---

## Phase 9: Reports Placeholder (PENDING)

**Goal:** Disabled nav item only

**Tasks:**
- [ ] Add "Reports" to sidebar nav (between Chat and Users? or at end?)
  - Icon: `BarChart3` or `FileText`
  - Disabled state: `opacity-50 cursor-not-allowed`
  - Tooltip on hover: "Coming soon"
- [ ] No actual reports functionality
- [ ] Clicking shows toast: "Reports coming in future release"

**Files to Modify:**
- `src/components/layout/data/sidebar-data.js` (add Reports nav item with disabled flag)

---

## Phase 10: Map Integration Fixes (ONGOING)

**Ongoing from Phase 1:**
- [ ] Ensure `ProjectDetail.jsx` can be embedded (remove full-screen styles)
- [ ] Pass Abu Dhabi center coords automatically
- [ ] Show live researcher pins with proper styling (larger pins per spec)
- [ ] 3D buildings visible on zoom
- [ ] Arabic labels toggle (based on Settings)

---

## Testing Strategy (TDD)

**Component Tests (Jest + React Testing Library):**
- NotificationBar: render pills, dismiss, max count
- Sidebar: role-based item visibility, collapse/expand
- CommandCenter: KPI count, layout structure
- TasksPage: task list renders, selection triggers drawer
- ChatPage: message bubble alignment, unread count
- UsersPage: flag renders correctly, admin-only access
- SettingsPage: each section saves, RTL toggles

**E2E Tests (Playwright):**
- Login → Command Center → layout correct
- Notification bar appears, dismiss works
- Sidebar navigation (5 items only, admin sees Users)
- Tasks page CRUD
- Chat send/receive
- Settings save & theme changes

**Coverage Target:** 80%+

---

## Development Order

**Strict Execution Order (Do not skip):**
1. Fix sidebar overlap bug (before anything else)
2. Phase 2: Notification Bar
3. Phase 3: Sidebar restructure (5 items only)
4. Phase 4: Complete Command Center metrics
5. Phase 5: Tasks page
6. Phase 6: Chat page
7. Phase 7: Users page
8. Phase 8: Settings page
9. Phase 9: Reports placeholder

---

## Validation Checklist

- [ ] All 4 KPI cards equal height and aligned
- [ ] Map embed has explicit height, never collapses
- [ ] Notification bar shows >=3 types, max 8 pills
- [ ] Sidebar shows exactly 5 nav items, Users hidden for non-admin
- [ ] Dashboard shows only SCAD MAP metrics (no revenue/sales)
- [ ] Chat shows researcher list with status dots + unread counts
- [ ] Users table shows **country flag emoji + name** for every row
- [ ] Settings saves preferences, switches theme/map style
- [ ] Reports shows disabled nav item only
- [ ] All pages work in light and dark mode
- [ ] Arabic RTL applies correctly when language = Arabic
- [ ] Sidebar does NOT overlap content (z-index fixed)

---

## Notes

- **Do NOT change color scheme** — keep existing dark theme palette
- **Do NOT rebuild map** — only embed existing `ProjectDetail` component
- **Reuse WebSocket infrastructure** for chat and notifications
- **JWT auth + roles** already in place — use `getStoredRole()` for visibility
- **Country flags:** Use Unicode emoji flags from ISO codes (not images)

---

**Ready to implement phases in order with skills applied.**
