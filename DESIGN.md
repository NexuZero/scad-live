# SCAD MAP — Design System

**Version:** 1.0  
**Last Updated:** 2026-04-07  
**Scope:** Researcher Tracking System Dashboard (Command Center, Map, Operations)

---

## 1. Design Principles

- **Dark-first:** Ops room environment, low-light conditions, reduced eye strain
- **Functional clarity:** Information density without clutter, metric-first design
- **SCAD brand identity:** Navy/blue palette, professional government aesthetic
- **Arabic-ready:** RTL support, bilingual labels where needed
- **Map integration:** 3D MapLibre GL tiles with Arabic labels option

---

## 2. Color Tokens

### CSS Custom Properties (index.css)

```css
/* Light Theme (default) */
:root {
  --bg-primary: #f5f5f5;
  --bg-secondary: #ffffff;
  --bg-tertiary: #fafafa;
  --bg-card: #ffffff;
  --bg-hover: #f0f0f0;
  --bg-input: #ffffff;
  --bg-sidebar: #1a1a2e;

  --text-primary: #1a1a2e;
  --text-secondary: #333333;
  --text-muted: #666666;
  --text-faint: #888888;
  --text-disabled: #aaaaaa;
  --text-inverse: #ffffff;

  --border-default: #e0e0e0;
  --border-strong: #cccccc;
  --border-light: #eeeeee;

  --accent-blue: #1976d2;
  --accent-blue-light: #e3f2fd;
  --accent-green: #2e7d32;
  --accent-green-light: #e8f5e9;
  --accent-orange: #e65100;
  --accent-orange-light: #fff3e0;
  --accent-red: #c62828;
  --accent-red-light: #fce4ec;
  --accent-purple: #7b1fa2;
  --accent-purple-light: #f3e5f5;

  --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.15);

  --map-overlay-bg: rgba(255, 255, 255, 0.92);
  --map-overlay-border: rgba(0, 0, 0, 0.1);

  /* Status colors */
  --status-setup-bg: #f5f5f5;
  --status-setup-fg: #666666;
  --status-active-bg: #e8f5e9;
  --status-active-fg: #2e7d32;
  --status-in-progress-bg: #fff3e0;
  --status-in-progress-fg: #e65100;
  --status-completed-bg: #e3f2fd;
  --status-completed-fg: #1565c0;
  --status-paused-bg: #fce4ec;
  --status-paused-fg: #c62828;

  /* Metrics */
  --metric-good: #43a047;
  --metric-warn: #ff9800;
  --metric-bad: #e53935;

  --transition-theme: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

/* Dark Theme (for ops room) */
[data-theme="dark"] {
  --bg-primary: #0a1118;
  --bg-secondary: #0f1923;
  --bg-tertiary: #141e2b;
  --bg-card: #1a2535;
  --bg-hover: #1e2d40;
  --bg-input: #1a2535;
  --bg-sidebar: #0a0f18;

  --text-primary: #e8eaf0;
  --text-secondary: #c0c8d4;
  --text-muted: #8899aa;
  --text-faint: #667788;
  --text-disabled: #556677;
  --text-inverse: #0f1923;

  --border-default: #2a3a4e;
  --border-strong: #3a4e66;
  --border-light: #1e2d40;

  --accent-blue: #42a5f5;
  --accent-blue-light: #1a3050;
  --accent-green: #66bb6a;
  --accent-green-light: #1a2e1a;
  --accent-orange: #ffa726;
  --accent-orange-light: #2e1f0a;
  --accent-red: #ef5350;
  --accent-red-light: #2e1414;
  --accent-purple: #ab47bc;
  --accent-purple-light: #2a1a32;

  --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);

  --map-overlay-bg: rgba(15, 25, 35, 0.92);
  --map-overlay-border: rgba(255, 255, 255, 0.08);

  --status-setup-bg: #1e2d40;
  --status-setup-fg: #8899aa;
  --status-active-bg: #1a2e1a;
  --status-active-fg: #66bb6a;
  --status-in-progress-bg: #2e1f0a;
  --status-in-progress-fg: #ffa726;
  --status-completed-bg: #1a3050;
  --status-completed-fg: #42a5f5;
  --status-paused-bg: #2e1414;
  --status-paused-fg: #ef5350;

  --metric-good: #66bb6a;
  --metric-warn: #ffa726;
  --metric-bad: #ef5350;
}
```

### Tailwind Color Mapping (tailwind.config.js)

```js
colors: {
  border: "hsl(var(--border))",
  background: "hsl(var(--background))", // deprecated, use bg-primary
  foreground: "hsl(var(--foreground))",
  primary: { DEFAULT: "hsl(var(--primary))" },
  muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
  accent: { DEFAULT: "hsl(var(--accent))" },
  card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
  // SCAD-specific operational colors
  ops: {
    teal: '#14b8a6',    // Online, active
    green: '#22c55e',   // Healthy, good
    amber: '#f59e0b',   // Warning, offline
    red: '#ef4444',     // Critical, alerts
    blue: '#3b82f6',    // Info, projects
  }
}
```

---

## 3. Typography Scale

| Element | Font | Size | Weight | Line Height | Letter Spacing |
|---------|------|------|--------|-------------|----------------|
| Page Title | Inter | 24px (text-2xl) | 700 (bold) | 1.2 | normal |
| Section Header | Inter | 18px (text-lg) | 600 (semibold) | 1.3 | tracking-wide |
| Card Title | Inter | 14px (text-base) | 600 (semibold) | 1.4 | none |
| KPI Label | Inter | 11px | 500 (medium) | 1.4 | tracking-[0.08em] uppercase |
| KPI Value | JetBrains Mono | 28px | 500 (medium) | 1 | none |
| Delta Text | Inter | 11px | 400 (normal) | 1 | none |
| Body text | Inter | 14px (text-sm) | 400 (normal) | 1.5 | none |
| Caption | Inter | 12px (text-xs) | 400 (normal) | 1.4 | none |
| Timestamp | JetBrains Mono | 10px | 400 (normal) | 1 | none |

**Mono usage:** All numbers, timestamps, metrics use JetBrains Mono for tabular alignment.

---

## 4. Spacing & Layout

### Command Center Grid (per spec)

```
Container: flex flex-col h-full
  ├─ [Notification Bar] (if implemented) h-9 (36px)
  ├─ KPI Row: grid grid-cols-4 gap-4 min-h-[90px] items-stretch
  ├─ Content Row: flex flex-1 gap-4 min-h-0
  │    ├─ Map Panel: flex-[2] flex-col
  │    └─ Health Panel: flex-1 min-w-[280px] flex-col
  └─ Activity Row: Card h-[120px] flex flex-col flex-shrink-0
```

### Sidebar
- Width: 220px (w-[220px])
- Collapsed: 60px (w-[60px])
- Inset padding: p-4 (16px)

### Cards
- Border radius: var(--radius) (8px default)
- Border: 1px solid hsl(var(--border))
- Padding: p-4 (16px), except KPI cards (p-4)
- Shadow: var(--shadow-sm) on hover (optional)

---

## 5. Component Patterns

### KPI Card (CommandCenter)

```jsx
<Card className="h-full flex flex-col p-4">
  <div className="flex items-center justify-between mb-2">
    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
      {label}
    </p>
    <Icon className="h-4 w-4 text-muted-foreground" />
  </div>
  <div className="mt-auto">
    <div className="text-[28px] font-bold font-mono leading-none">{value}</div>
    {change && (
      <div className={`flex items-center text-[11px] mt-1 ${changeTypeColor}`}>
        <ArrowIcon className="h-3 w-3 mr-0.5" />
        {change}
      </div>
    )}
  </div>
  <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
</Card>
```

### Status Pill (Health Metric)

```jsx
<div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border/50 bg-card/60">
  <div className={`flex h-6 w-6 items-center justify-center rounded bg-ops-${color}/10`}>
    <Icon className={`h-3 w-3 text-ops-${color}`} />
  </div>
  <div className="flex flex-col justify-center">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
    <p className="text-sm font-semibold font-mono leading-none">{value}</p>
  </div>
</div>
```

### ScrollArea (Offline List)

```jsx
<ScrollArea className="max-h-[120px]">
  {/* list items */}
</ScrollArea>
```

---

## 6. Status Colors

| Status | Token | Hex (Dark) | Usage |
|--------|-------|------------|-------|
| Ops Teal | `ops-teal` | #14b8a6 | Online, active, success |
| Ops Green | `ops-green` | #22c55e | Healthy, good metrics |
| Ops Amber | `ops-amber` | #f59e0b | Warning, offline, degraded |
| Ops Red | `ops-red` | #ef4444 | Critical, alerts, errors |
| Ops Blue | `ops-blue` | #3b82f6 | Info, projects, links |

---

## 7. Dark Theme Default

**Default ops room mode:** Dark theme auto-enabled on first load.

Toggle storage: `localStorage.getItem('theme')` → `'dark'` | `'light'` | `'system'`

Apply to `<html className="dark">` or `<html data-theme="dark">`

---

## 8. Accessibility

- **Contrast ratios:** All text meets WCAG AA (4.5:1 for normal, 3:1 for large text)
- **Focus states:** Use `ring` utilities from Tailwind for focus-visible
- **Keyboard navigation:** All interactive elements (buttons, links, dropdowns) must be keyboard accessible
- **ARIA labels:** Icon-only buttons have `aria-label`
- **Skip links:** Not needed (single-page app)

---

## 9. Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| sm | 640px | Mobile (sidebar hidden/overlay) |
| md | 768px | Tablet (sidebar collapsible) |
| lg | 1024px | Desktop (sidebar 220px, full layout) |
| xl | 1280px | Wide desktop (larger map) |
| 2xl | 1536px | Max container width 1400px |

**Command Center responsive behavior:**
- KPI grid: `md:grid-cols-2 lg:grid-cols-4` (2 cols on tablet, 4 on desktop)
- Sidebar: Always visible on lg+, collapsible on mobile via overlay

---

## 10. Map Integration

**MapLibre GL JS container:**
```jsx
<div className="w-full h-full">
  <div id="map" className="w-full h-full" />
</div>
```

**Style selection:**
- Light theme: `scad-style.json`
- Dark theme: `scad-style-dark.json`

Source: `/tiles/styles/` served by tileserver-gl

---

## 11. Animation & Transitions

- **Theme transition:** `transition-colors duration-300` on body/html
- **Hover states:** `transition-colors duration-150` on interactive elements
- **Page transitions:** Not used (SPA routing)
- **Map interactions:** CSS-based, no heavy animations
- **Notification bar pills:** Fade in from right, slide out on dismiss

---

## 12. Component Checklist (To Build)

- [x] CommandCenter (partial, needs metric corrections)
- [ ] NotificationBar (new)
- [ ] AppSidebar (restructure to 5 items)
- [ ] TasksPage (new)
- [ ] TasksDetailPanel (slide-in)
- [ ] ChatPage (3-column)
- [ ] UsersPage (table with flags)
- [ ] SettingsPage (4 sections)
- [ ] ReportsNavPlaceholder (disabled)

---

## 13. Design Consistency Rules

1. **Never use arbitrary hex colors** — always use CSS variables or Tailwind palette
2. **Always use Inter + JetBrains Mono** — no other fonts
3. **Dark theme only for ops room** — light theme allowed for user-facing reports
4. **Cards always have border** — `border border-border/50`
5. **Text hierarchy strictly followed** — no size deviations
6. **Status colors limited to ops-* palette** — no custom colors
7. **Icons from lucide-react only** — size 16px standard, exceptions: KPI (4px icons)
8. **Scrollbars styled globally** (index.css) — width 6px, border-radius 3px

---

## 14. References

- **Shadcn Admin Template**: `examples/New Template/shadcn-admin-main.zip`
- **Spec Document**: `examples/New Template/shadcn-template.md`
- **Design Reference PDF**: `examples/New Template/project information.pdf`

---

**Document Maintainer:** Claude Code  
**Next Review:** After Phase 4 completion
