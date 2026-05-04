import React, { useState } from 'react';
import { updateTask, getStoredName } from '../api';

const PRIORITY_COLORS = {
  high: { bg: 'var(--status-paused-bg)', fg: 'var(--status-paused-fg)' },
  medium: { bg: 'var(--status-in-progress-bg)', fg: 'var(--status-in-progress-fg)' },
  low: { bg: 'var(--status-active-bg)', fg: 'var(--status-active-fg)' },
};

export default function TaskDetailPanel({ task, onClose, onUpdate }) {
  const userName = getStoredName() || 'Operations';
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || '');
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [activityLog, setActivityLog] = useState([
    { id: 1, timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), user: userName, action: 'Opened task' },
    { id: 2, timestamp: new Date(Date.now() - 86400000).toISOString(), user: userName, action: 'Task created' },
  ]);

  const prColors = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.low;

  const addActivity = (action, details = '') => {
    setActivityLog(prev => [{ id: Date.now(), timestamp: new Date().toISOString(), user: userName, action, details }, ...prev]);
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = { title: editTitle.trim(), description: editDescription.trim() };
    await onUpdate(updates);
    addActivity('Updated task details');
    setIsEditing(false);
    setSaving(false);
  };

  const handleStatusChange = async (newStatus) => {
    await onUpdate({ status: newStatus });
    addActivity(`Status → ${newStatus}`);
  };

  const handleAddComment = async () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    addActivity('Comment', trimmed);
    setNewComment('');
  };

  const isOverdue = task.status !== 'done' && new Date(task.due_date) < new Date();

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Task Details</span>
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close panel">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div style={styles.body}>
        {/* Title / Description */}
        <div style={styles.section}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input style={styles.editInput} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Task title" aria-label="Task title" />
              <textarea style={styles.editTextarea} value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description..." rows={3} aria-label="Task description" />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                <button style={styles.cancelEditBtn} onClick={() => setIsEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <h3 style={{ ...styles.taskTitle, textDecoration: task.status === 'done' ? 'line-through' : 'none', opacity: task.status === 'done' ? 0.6 : 1 }}>{task.title}</h3>
                <button style={styles.editBtn} onClick={() => setIsEditing(true)}>Edit</button>
              </div>
              {task.description && <p style={styles.taskDesc}>{task.description}</p>}
            </div>
          )}
        </div>

        <div style={styles.divider} />

        {/* Metadata */}
        <div style={styles.section}>
          <MetaRow label="Priority">
            <span style={{ ...styles.badge, backgroundColor: prColors.bg, color: prColors.fg }}>{task.priority}</span>
          </MetaRow>
          <MetaRow label="Due Date">
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: isOverdue ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: 500 }}>
              {isOverdue && '⚠ '}{new Date(task.due_date).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </MetaRow>
          <MetaRow label="Assigned To"><span style={styles.metaValue}>{task.assigned_to_name}</span></MetaRow>
          <MetaRow label="Project"><span style={styles.metaValue}>{task.project_name}</span></MetaRow>
        </div>

        <div style={styles.divider} />

        {/* Status Buttons */}
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Status</p>
          <div style={styles.statusGrid}>
            {[['open', 'Open'], ['in-progress', 'In Progress'], ['done', 'Done']].map(([val, label]) => (
              <button
                key={val}
                style={{ ...styles.statusBtn, ...(task.status === val ? styles.statusBtnActive : {}) }}
                onClick={() => handleStatusChange(val)}
                aria-pressed={task.status === val}
              >
                {label}
              </button>
            ))}
          </div>
          {task.status !== 'done' && (
            <button style={styles.completeBtn} onClick={() => handleStatusChange('done')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              Mark Complete
            </button>
          )}
        </div>

        <div style={styles.divider} />

        {/* Comments */}
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Add Comment</p>
          <textarea
            style={styles.commentInput}
            placeholder="Write a comment..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            rows={2}
            aria-label="New comment"
          />
          <button
            style={{ ...styles.commentBtn, opacity: newComment.trim() ? 1 : 0.5 }}
            onClick={handleAddComment}
            disabled={!newComment.trim()}
          >
            Post Comment
          </button>
        </div>

        <div style={styles.divider} />

        {/* Activity Log */}
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Activity</p>
          <div style={styles.logList}>
            {activityLog.map(entry => (
              <div key={entry.id} style={styles.logEntry}>
                <div style={styles.logDot} />
                <div style={styles.logBody}>
                  <span style={styles.logUser}>{entry.user}</span>
                  <span style={styles.logAction}> {entry.action}</span>
                  {entry.details && <p style={styles.logDetails}>"{entry.details}"</p>}
                  <div style={styles.logTime}>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(entry.timestamp).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '72px' }}>{label}</span>
      {children}
    </div>
  );
}

const styles = {
  root: { width: '300px', flexShrink: 0, borderLeft: '1px solid var(--border-default)', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 },
  headerTitle: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' },
  closeBtn: { width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' },
  body: { flex: 1, overflowY: 'auto' },
  section: { padding: '14px 16px' },
  divider: { height: '1px', backgroundColor: 'var(--border-default)' },
  sectionLabel: { fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' },
  taskTitle: { fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', lineHeight: 1.4 },
  taskDesc: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },
  editInput: { width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontWeight: 600 },
  editTextarea: { width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' },
  saveBtn: { padding: '6px 14px', backgroundColor: '#4fc3f7', border: 'none', borderRadius: '6px', color: '#0a0f18', fontSize: '12px', fontWeight: 700, cursor: 'pointer' },
  cancelEditBtn: { padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' },
  editBtn: { fontSize: '11px', padding: '4px 8px', backgroundColor: 'transparent', border: '1px solid var(--border-default)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' },
  metaValue: { fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' },
  statusBtn: { padding: '7px 4px', border: '1px solid var(--border-default)', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' },
  statusBtnActive: { backgroundColor: '#4fc3f7', color: '#0a0f18', borderColor: '#4fc3f7', fontWeight: 700 },
  completeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', padding: '8px', backgroundColor: 'var(--status-active-bg)', color: 'var(--status-active-fg)', border: '1px solid var(--status-active-fg)', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' },
  commentInput: { width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', marginBottom: '8px' },
  commentBtn: { width: '100%', padding: '7px', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  logList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  logEntry: { display: 'flex', gap: '10px' },
  logDot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--border-strong)', flexShrink: 0, marginTop: '4px' },
  logBody: { flex: 1 },
  logUser: { fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' },
  logAction: { fontSize: '11px', color: 'var(--text-muted)' },
  logDetails: { fontSize: '11px', color: 'var(--text-faint)', fontStyle: 'italic', margin: '2px 0 0' },
  logTime: { fontSize: '10px', color: 'var(--text-faint)', marginTop: '2px' },
};
