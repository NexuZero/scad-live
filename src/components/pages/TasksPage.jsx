import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchTasks, createTask, updateTask, deleteTask,
  fetchTaskThread, addTaskComment, addTaskActivity,
  fetchProjects, fetchUsers,
  getStoredRole, getStoredName, TASK_CATEGORIES,
} from '../../api';

/* ── Constants ───────────────────────────────────────────────────── */
const PRIORITY = {
  high:   { label: 'High',   bg: 'rgba(239,68,68,0.15)',   fg: '#F87171', border: 'rgba(239,68,68,0.3)' },
  medium: { label: 'Medium', bg: 'rgba(245,158,11,0.15)',  fg: '#FCD34D', border: 'rgba(245,158,11,0.3)' },
  low:    { label: 'Low',    bg: 'rgba(34,197,94,0.12)',   fg: '#4ADE80', border: 'rgba(34,197,94,0.25)' },
};
const STATUS = {
  open:          { label: 'Open',        bg: 'var(--status-setup-bg)',       fg: 'var(--status-setup-fg)' },
  'in-progress': { label: 'In Progress', bg: 'var(--status-in-progress-bg)', fg: 'var(--status-in-progress-fg)' },
  done:          { label: 'Done',        bg: 'var(--status-active-bg)',      fg: 'var(--status-active-fg)' },
};
const CAT_MAP = Object.fromEntries((TASK_CATEGORIES || []).map(c => [c.id, c]));

function fmt(iso) {
  if (!iso) return '—';
  const diff = new Date(iso) - new Date();
  if (Math.abs(diff) < 86400000) {
    return diff < 0 ? `${Math.round(-diff / 3600000)}h overdue` : `in ${Math.round(diff / 3600000)}h`;
  }
  const days = Math.round(diff / 86400000);
  return days < 0 ? `${-days}d overdue` : `${days}d left`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
}
function initials(name = '') { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'; }
function avatarColor(name = '') { return `hsl(${[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360},40%,35%)`; }

function Avatar({ name, size = 28 }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{initials(name)}</div>;
}

function PriorityBadge({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.low;
  return <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backgroundColor: p.bg, color: p.fg, border: `1px solid ${p.border}`, whiteSpace: 'nowrap' }}>{p.label}</span>;
}

function StatusBadge({ status, onClick }) {
  const st = STATUS[status] || STATUS.open;
  return <span onClick={onClick} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '10px', backgroundColor: st.bg, color: st.fg, whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default' }}>{st.label}</span>;
}

function CategoryBadge({ category }) {
  const cat = CAT_MAP[category];
  if (!cat) return null;
  return <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', backgroundColor: `${cat.color}18`, color: cat.color, border: `1px solid ${cat.color}30`, whiteSpace: 'nowrap' }}>{cat.label}</span>;
}

/* ── Thread Entry ────────────────────────────────────────────────── */
function ThreadEntry({ entry }) {
  if (entry.type === 'activity') {
    return (
      <div style={ts.actRow}>
        <div style={ts.actDot} />
        <span style={ts.actText}><b style={{ color: 'var(--text-secondary)' }}>{entry.author}</b> {entry.action}</span>
        <span style={ts.entryTime}>{fmtTime(entry.created_at)}</span>
      </div>
    );
  }
  return (
    <div style={ts.cmtRow}>
      <Avatar name={entry.author} size={28} />
      <div style={ts.cmtBody}>
        <div style={ts.cmtMeta}>
          <span style={ts.cmtAuthor}>{entry.author}</span>
          <span style={ts.entryTime}>{fmtDate(entry.created_at)} {fmtTime(entry.created_at)}</span>
        </div>
        {entry.text && <div style={ts.cmtText}>{entry.text}</div>}
        {entry.attachments?.length > 0 && (
          <div style={ts.attachList}>
            {entry.attachments.map((a, i) => (
              <div key={i} style={ts.attachCard}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={ts.attachName}>{a.name}</span>
                {a.size && <span style={ts.attachSize}>{Math.round(a.size / 1024)}KB</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Task Detail + Thread ────────────────────────────────────────── */
function TaskDetail({ task, onUpdate, onClose, users, projects, role }) {
  const [thread, setThread] = useState([]);
  const [comment, setComment] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const myName = getStoredName();
  const canEdit = role === 'admin' || role === 'project_manager' || task.assigned_to_name === myName;

  useEffect(() => { fetchTaskThread(task.id).then(setThread).catch(() => {}); }, [task.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  const cycleStatus = { open: 'in-progress', 'in-progress': 'done', done: 'open' };

  const handleStatus = async () => {
    if (!canEdit) return;
    const next = cycleStatus[task.status];
    const updated = await updateTask(task.id, { status: next });
    const act = { id: Date.now() + '', type: 'activity', author: myName, action: `changed status to "${STATUS[next]?.label}"`, created_at: new Date().toISOString() };
    await addTaskActivity(task.id, act.action);
    setThread(p => [...p, act]);
    onUpdate(updated);
  };

  const handleField = async (field, val, displayVal) => {
    const updated = await updateTask(task.id, { [field]: val });
    const act = { id: Date.now() + '', type: 'activity', author: myName, action: `updated ${field} to "${displayVal || val}"`, created_at: new Date().toISOString() };
    await addTaskActivity(task.id, act.action);
    setThread(p => [...p, act]);
    onUpdate(updated);
    setEditing(null);
  };

  const handleSend = async () => {
    if (!comment.trim() && attachments.length === 0) return;
    setSending(true);
    try {
      const entry = await addTaskComment(task.id, { text: comment.trim(), attachments });
      setThread(p => [...p, entry]);
      setComment('');
      setAttachments([]);
    } finally { setSending(false); }
  };

  const handleFiles = (e) => {
    setAttachments(p => [...p, ...Array.from(e.target.files).map(f => ({ name: f.name, size: f.size, type: f.type }))]);
    e.target.value = '';
  };

  const assignable = role === 'admin' ? users : users.filter(u => u.role === 'supervisor' || u.name === myName);
  const overdue = new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <div style={ts.panel}>
      {/* Panel header */}
      <div style={ts.panelHdr}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '7px' }}>
            <CategoryBadge category={task.category} />
            <StatusBadge status={task.status} onClick={canEdit ? handleStatus : undefined} />
            {canEdit && <span style={ts.cycleHint}>Click status to cycle</span>}
          </div>
          <h2 style={ts.panelTitle}>{task.title}</h2>
          <div style={ts.panelMeta}>
            <span style={ts.metaSpan}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>
              {task.project_name}
            </span>
            <span style={{ ...ts.metaSpan, color: overdue ? '#F87171' : 'var(--text-muted)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {fmtDate(task.due_date)} · {fmt(task.due_date)}
            </span>
            <PriorityBadge priority={task.priority} />
          </div>
        </div>
        <button style={ts.closeBtn} onClick={onClose} aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      <div style={ts.panelBody}>
        {/* Description */}
        <div style={ts.sec}>
          <div style={ts.secLbl}>Description</div>
          <div style={ts.descTxt}>{task.description || <span style={{ color: 'var(--text-faint)' }}>No description</span>}</div>
        </div>

        {/* Fields grid */}
        <div style={ts.fieldsGrid}>
          {[
            { label: 'Assigned to', key: 'assigned_to', renderVal: () => <div style={ts.fVal}><Avatar name={task.assigned_to_name || '?'} size={20} /><span>{task.assigned_to_name || 'Unassigned'}</span></div>,
              renderEdit: () => <select style={ts.fSelect} autoFocus defaultValue={task.assigned_to}
                onChange={e => { const u = assignable.find(u => u.id === e.target.value); handleField('assigned_to_name', u?.name || e.target.value, u?.name); }}
                onBlur={() => setEditing(null)}>
                <option value="">Unassigned</option>
                {assignable.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select> },
            { label: 'Priority', key: 'priority', renderVal: () => <PriorityBadge priority={task.priority} />,
              renderEdit: () => <select style={ts.fSelect} autoFocus defaultValue={task.priority}
                onChange={e => handleField('priority', e.target.value)} onBlur={() => setEditing(null)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select> },
            { label: 'Category', key: 'category', renderVal: () => <CategoryBadge category={task.category} />,
              renderEdit: () => <select style={ts.fSelect} autoFocus defaultValue={task.category}
                onChange={e => handleField('category', e.target.value)} onBlur={() => setEditing(null)}>
                {(TASK_CATEGORIES || []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select> },
            { label: 'Created by', key: null, renderVal: () => <div style={ts.fVal}><Avatar name={task.created_by_name || '?'} size={20} /><span style={{ color: 'var(--text-secondary)' }}>{task.created_by_name || '—'}</span></div> },
            { label: 'Project', key: null, renderVal: () => <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{task.project_name}</span> },
            { label: 'Due date', key: null, renderVal: () => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: overdue ? '#F87171' : 'var(--text-secondary)' }}>{fmtDate(task.due_date)}</span> },
          ].map(({ label, key, renderVal, renderEdit }) => (
            <div key={label} style={ts.fieldItem}>
              <span style={ts.fieldLbl}>{label}</span>
              <div style={{ cursor: (key && canEdit) ? 'pointer' : 'default' }}
                onClick={() => key && canEdit && setEditing(key)}>
                {editing === key && renderEdit ? renderEdit() : renderVal()}
              </div>
            </div>
          ))}
        </div>

        {/* Thread */}
        <div style={ts.sec}>
          <div style={ts.secLbl}>Thread · Activity</div>
          <div style={ts.thread}>
            {thread.length === 0 && <div style={ts.threadEmpty}>No activity yet — start the thread below</div>}
            {thread.map(e => <ThreadEntry key={e.id} entry={e} />)}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Comment input */}
        <div style={ts.cmtInput}>
          <Avatar name={myName || 'Me'} size={26} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <textarea
              style={ts.textarea}
              placeholder="Add a comment, share a file, or post an update… (Ctrl+Enter to send)"
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
              rows={2}
              aria-label="Add comment"
            />
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {attachments.map((a, i) => (
                  <div key={i} style={ts.attachChip}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span>{a.name}</span>
                    <button style={{ background: 'none', border: 'none', color: '#4FC3F7', cursor: 'pointer', padding: 0, fontSize: '13px' }} onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} aria-label="Remove">×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input type="file" ref={fileRef} style={{ display: 'none' }} multiple onChange={handleFiles} aria-label="Attach file" />
              <button style={ts.attachBtn} onClick={() => fileRef.current?.click()} aria-label="Attach file">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                Attach file
              </button>
              <button style={{ ...ts.sendBtn, opacity: (!comment.trim() && !attachments.length) || sending ? 0.5 : 1 }}
                onClick={handleSend} disabled={(!comment.trim() && !attachments.length) || sending} aria-label="Send">
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Create Task Modal ───────────────────────────────────────────── */
function CreateModal({ onClose, onCreated, projects, users, role }) {
  const myName = getStoredName();
  const [form, setForm] = useState({ title: '', description: '', project_id: projects[0]?.project_id || '', assigned_to: '', assigned_to_name: '', created_by_name: myName, due_date: '', priority: 'medium', category: 'normal', status: 'open' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const assignable = role === 'admin' ? users : users.filter(u => u.role === 'supervisor' || u.name === myName);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required'); return; }
    if (!form.project_id) { setErr('Select a project'); return; }
    setSaving(true);
    try {
      const proj = projects.find(p => p.project_id === form.project_id);
      const task = await createTask({ ...form, project_name: proj?.project_name || form.project_id });
      await addTaskActivity(task.id, 'created this task');
      onCreated(task);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={m.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={m.modal} role="dialog" aria-modal="true" aria-label="Create new task">
        <div style={m.hdr}>
          <h2 style={m.title}>New Task</h2>
          <button style={m.closeBtn} onClick={onClose} aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <form onSubmit={submit} style={m.form}>
          <div style={m.field}><label style={m.lbl}>Title *</label><input style={m.input} value={form.title} onChange={e => set('title', e.target.value)} placeholder="What needs to be done?" required /></div>
          <div style={m.field}><label style={m.lbl}>Description</label><textarea style={{ ...m.input, resize: 'vertical', minHeight: '72px' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Context, acceptance criteria, links…" rows={3} /></div>
          <div style={m.row}>
            <div style={{ ...m.field, flex: 1 }}><label style={m.lbl}>Project *</label>
              <select style={m.sel} value={form.project_id} onChange={e => set('project_id', e.target.value)} required>
                <option value="">Select project…</option>
                {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
              </select></div>
            <div style={{ ...m.field, flex: 1 }}><label style={m.lbl}>Assign to</label>
              <select style={m.sel} value={form.assigned_to} onChange={e => { const u = users.find(u => u.id === e.target.value); set('assigned_to', e.target.value); set('assigned_to_name', u?.name || ''); }}>
                <option value="">Unassigned</option>
                {assignable.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role.replace('_', ' ')}</option>)}
              </select></div>
          </div>
          <div style={m.row}>
            <div style={{ ...m.field, flex: 1 }}><label style={m.lbl}>Category</label>
              <select style={m.sel} value={form.category} onChange={e => set('category', e.target.value)}>
                {(TASK_CATEGORIES || []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select></div>
            <div style={{ ...m.field, flex: 1 }}><label style={m.lbl}>Priority</label>
              <select style={m.sel} value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div style={{ ...m.field, flex: 1 }}><label style={m.lbl}>Due date</label>
              <input style={m.input} type="date" value={form.due_date?.slice(0, 10) || ''} onChange={e => set('due_date', e.target.value ? new Date(e.target.value).toISOString() : '')} /></div>
          </div>
          {err && <div style={m.err} role="alert">{err}</div>}
          <div style={m.footer}>
            <button type="button" style={m.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...m.saveBtn, opacity: saving ? 0.7 : 1 }} disabled={saving}>{saving ? 'Creating…' : 'Create Task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */
export default function TasksPage() {
  const role = getStoredRole();
  const myName = getStoredName();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p, u] = await Promise.allSettled([
        fetchTasks(),
        fetchProjects().catch(() => []),
        typeof fetchUsers === 'function' ? fetchUsers() : Promise.resolve([]),
      ]);
      setTasks(t.status === 'fulfilled' ? (Array.isArray(t.value) ? t.value : []) : []);
      const pv = p.status === 'fulfilled' ? p.value : [];
      setProjects(Array.isArray(pv) ? pv : pv?.projects || []);
      setUsers(u.status === 'fulfilled' ? (Array.isArray(u.value) ? u.value : []) : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = tasks.filter(t => role === 'supervisor' ? t.assigned_to_name === myName : true);

  const filtered = visible.filter(t => {
    const q = search.toLowerCase();
    return (!q || [t.title, t.project_name, t.assigned_to_name].some(s => s?.toLowerCase().includes(q)))
      && (statusFilter === 'all' || t.status === statusFilter)
      && (priorityFilter === 'all' || t.priority === priorityFilter);
  });

  const counts = {
    all: visible.length,
    open: visible.filter(t => t.status === 'open').length,
    'in-progress': visible.filter(t => t.status === 'in-progress').length,
    done: visible.filter(t => t.status === 'done').length,
  };

  const handleUpdate = (u) => { setTasks(p => p.map(t => t.id === u.id ? u : t)); setSelected(u); };
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    await deleteTask(id);
    setTasks(p => p.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const canCreate = ['admin', 'project_manager'].includes(role);
  const canDelete = ['admin', 'project_manager'].includes(role);

  if (loading) return <div style={pg.center}>Loading tasks…</div>;

  return (
    <div style={pg.root}>
      {/* Header */}
      <div style={pg.hdr}>
        <div>
          <h1 style={pg.title}>Tasks</h1>
          <p style={pg.sub}>
            {counts.all} total · {counts.open} open · {counts['in-progress']} in progress
            {role === 'supervisor' && <span style={{ color: 'var(--accent-blue)', marginLeft: '8px' }}>· Your assigned tasks</span>}
          </p>
        </div>
        {canCreate && <button style={pg.newBtn} onClick={() => setShowCreate(true)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Task</button>}
      </div>

      {/* Filters */}
      <div style={pg.filterRow}>
        {[['all', 'All'], ['open', 'Open'], ['in-progress', 'In Progress'], ['done', 'Done']].map(([v, l]) => (
          <button key={v} style={{ ...pg.pill, ...(statusFilter === v ? pg.pillOn : {}) }} onClick={() => setStatusFilter(v)}>
            {l} <span style={pg.pillN}>{counts[v] ?? 0}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <select style={pg.sel} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="Filter by priority">
          <option value="all">All Priorities</option>
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Search */}
      <div style={pg.searchWrap}>
        <svg style={pg.searchIco} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input style={pg.searchInput} placeholder="Search tasks, assignees, projects…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search tasks" />
      </div>

      {/* Body: list + detail */}
      <div style={{ ...pg.body, gridTemplateColumns: selected ? '1fr 440px' : '1fr' }}>
        {/* List */}
        <div style={pg.listWrap}>
          {filtered.length === 0
            ? <div style={pg.empty}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg><p style={{ color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>No tasks match your filters</p></div>
            : (
              <div style={pg.table}>
                <div style={pg.thead}>
                  <span style={{ ...pg.th, flex: 3, paddingLeft: '40px' }}>Task</span>
                  <span style={pg.th}>Project</span>
                  <span style={pg.th}>Assigned to</span>
                  <span style={pg.th}>Due</span>
                  <span style={pg.th}>Priority</span>
                  <span style={pg.th}>Status</span>
                  {canDelete && <span style={{ ...pg.th, width: '36px', flexShrink: 0 }}></span>}
                </div>
                {filtered.map(task => {
                  const sel = selected?.id === task.id;
                  const overdue = new Date(task.due_date) < new Date() && task.status !== 'done';
                  return (
                    <div key={task.id}
                      style={{ ...pg.row, ...(sel ? pg.rowSel : {}), ...(task.status === 'done' ? { opacity: 0.55 } : {}) }}
                      onClick={() => setSelected(sel ? null : task)}
                      role="button" tabIndex={0} aria-pressed={sel}
                      onKeyDown={e => e.key === 'Enter' && setSelected(sel ? null : task)}>

                      {/* Checkbox */}
                      <div style={{ flexShrink: 0, width: '36px', display: 'flex', justifyContent: 'center' }}
                        onClick={e => { e.stopPropagation(); updateTask(task.id, { status: task.status === 'done' ? 'open' : 'done' }).then(u => setTasks(p => p.map(t => t.id === u.id ? u : t))); }}>
                        <div style={{ ...pg.chk, ...(task.status === 'done' ? pg.chkDone : {}) }}>
                          {task.status === 'done' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>

                      {/* Task name */}
                      <div style={{ flex: 3, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <CategoryBadge category={task.category} />
                          <span style={{ ...pg.taskTitle, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</span>
                        </div>
                        <div style={pg.taskDesc}>{task.description?.slice(0, 80)}{task.description?.length > 80 ? '…' : ''}</div>
                      </div>

                      <div style={pg.cell}><span style={pg.cellTxt}>{task.project_name}</span></div>
                      <div style={pg.cell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {task.assigned_to_name && <Avatar name={task.assigned_to_name} size={18} />}
                          <span style={pg.cellTxt}>{task.assigned_to_name || '—'}</span>
                        </div>
                      </div>
                      <div style={pg.cell}><span style={{ ...pg.cellTxt, fontFamily: 'var(--font-mono)', fontSize: '11px', color: overdue ? '#F87171' : 'var(--text-muted)' }}>{fmt(task.due_date)}</span></div>
                      <div style={pg.cell}><PriorityBadge priority={task.priority} /></div>
                      <div style={pg.cell}><StatusBadge status={task.status} /></div>
                      {canDelete && (
                        <div style={{ width: '36px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                          <button style={pg.delBtn} onClick={e => handleDelete(task.id, e)} aria-label="Delete task">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Detail panel */}
        {selected && (
          <TaskDetail task={selected} onUpdate={handleUpdate} onClose={() => setSelected(null)} users={users} projects={projects} role={role} />
        )}
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={t => { setTasks(p => [t, ...p]); setShowCreate(false); setSelected(t); }} projects={projects} users={users} role={role} />
      )}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */
const pg = {
  root: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 72px)', overflow: 'hidden', backgroundColor: 'var(--bg-primary)', padding: '20px 24px 0' },
  center: { padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' },
  hdr: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' },
  title: { fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)' },
  newBtn: { display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', backgroundColor: '#4FC3F7', color: '#020617', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 12px rgba(79,195,247,0.3)', fontFamily: 'var(--font-body)' },
  filterRow: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' },
  pill: { display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border-default)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 150ms', fontFamily: 'var(--font-body)' },
  pillOn: { backgroundColor: 'rgba(79,195,247,0.12)', color: '#4FC3F7', borderColor: 'rgba(79,195,247,0.35)', fontWeight: 700 },
  pillN: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1px 6px', fontSize: '11px', fontFamily: 'var(--font-mono)' },
  sel: { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' },
  searchWrap: { position: 'relative', marginBottom: '14px' },
  searchIco: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' },
  searchInput: { width: '100%', padding: '10px 12px 10px 36px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '10px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' },
  body: { display: 'grid', gap: '14px', flex: 1, overflow: 'hidden', minHeight: 0 },
  listWrap: { overflow: 'auto', flex: 1 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px' },
  table: { display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-default)', overflow: 'hidden' },
  thead: { display: 'flex', alignItems: 'center', padding: '10px 16px', gap: '12px', borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 2 },
  th: { fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1, minWidth: 0 },
  row: { display: 'flex', alignItems: 'center', padding: '11px 16px', gap: '12px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background-color 120ms' },
  rowSel: { backgroundColor: 'rgba(79,195,247,0.05)', borderLeft: '3px solid #4FC3F7', paddingLeft: '13px' },
  chk: { width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 150ms', cursor: 'pointer' },
  chkDone: { backgroundColor: '#22C55E', borderColor: '#22C55E', color: '#fff' },
  taskTitle: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  taskDesc: { fontSize: '11px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' },
  cell: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' },
  cellTxt: { fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  delBtn: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-default)', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' },
};

const ts = {
  panel: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-default)', overflow: 'hidden' },
  panelHdr: { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px 18px', borderBottom: '1px solid var(--border-default)', flexShrink: 0, backgroundColor: 'var(--bg-secondary)' },
  panelTitle: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', lineHeight: 1.3 },
  panelMeta: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  metaSpan: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' },
  cycleHint: { fontSize: '9px', color: 'var(--text-faint)', letterSpacing: '0.04em' },
  closeBtn: { flexShrink: 0, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', cursor: 'pointer' },
  panelBody: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  sec: { padding: '14px 18px', borderBottom: '1px solid var(--border-light)' },
  secLbl: { fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
  descTxt: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 },
  fieldsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '4px 18px', borderBottom: '1px solid var(--border-light)' },
  fieldItem: { display: 'flex', flexDirection: 'column', gap: '3px', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  fieldLbl: { fontSize: '10px', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  fVal: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', minHeight: '22px' },
  fSelect: { padding: '4px 8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--accent-blue)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-body)', width: '100%' },
  thread: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 18px', minHeight: '80px' },
  threadEmpty: { fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', padding: '20px 0' },
  actRow: { display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' },
  actDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--border-strong)', flexShrink: 0 },
  actText: { fontSize: '11px', color: 'var(--text-muted)', flex: 1 },
  entryTime: { fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
  cmtRow: { display: 'flex', gap: '10px', alignItems: 'flex-start' },
  cmtBody: { flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '0 10px 10px 10px', padding: '10px 12px', border: '1px solid var(--border-light)' },
  cmtMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' },
  cmtAuthor: { fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' },
  cmtText: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  attachList: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' },
  attachCard: { display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', backgroundColor: 'var(--bg-muted)', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '11px', color: 'var(--text-secondary)' },
  attachName: { maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  attachSize: { color: 'var(--text-faint)' },
  cmtInput: { display: 'flex', gap: '10px', padding: '12px 18px', borderTop: '1px solid var(--border-default)', flexShrink: 0, backgroundColor: 'var(--bg-secondary)', alignItems: 'flex-start' },
  textarea: { width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)', lineHeight: 1.5, boxSizing: 'border-box' },
  attachChip: { display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', backgroundColor: 'rgba(79,195,247,0.1)', border: '1px solid rgba(79,195,247,0.25)', borderRadius: '6px', fontSize: '11px', color: '#4FC3F7' },
  attachBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '7px', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' },
  sendBtn: { padding: '7px 18px', backgroundColor: '#4FC3F7', color: '#020617', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
};

const m = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(2,6,23,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal,100)', padding: '24px' },
  modal: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '16px', width: '100%', maxWidth: '580px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' },
  hdr: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)' },
  title: { fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  closeBtn: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', cursor: 'pointer' },
  form: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' },
  field: { display: 'flex', flexDirection: 'column', gap: '5px' },
  row: { display: 'flex', gap: '12px' },
  lbl: { fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' },
  input: { padding: '10px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-body)' },
  sel: { padding: '10px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-body)' },
  err: { padding: '10px 12px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '12px' },
  footer: { display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border-default)' },
  cancelBtn: { padding: '9px 18px', backgroundColor: 'transparent', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' },
  saveBtn: { padding: '9px 22px', backgroundColor: '#4FC3F7', border: 'none', borderRadius: '8px', color: '#020617', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
};
