import React, { useState, useEffect, useRef } from 'react';
import { fetchProjects, getStoredName } from '../api';

const PRIORITIES = [
  { value: 'high', label: 'High', color: 'var(--status-paused-fg)', bg: 'var(--status-paused-bg)' },
  { value: 'medium', label: 'Medium', color: 'var(--status-in-progress-fg)', bg: 'var(--status-in-progress-bg)' },
  { value: 'low', label: 'Low', color: 'var(--status-active-fg)', bg: 'var(--status-active-bg)' },
];

export default function TaskCreateModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    project_id: '',
    project_name: '',
    assigned_to: '',
    assigned_to_name: '',
    due_date: '',
    priority: 'medium',
  });
  const [projects, setProjects] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    fetchProjects().then(data => setProjects(data || [])).catch(() => {});
  }, []);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  };

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.assigned_to_name.trim()) e.assigned_to_name = 'Assignee is required';
    if (!form.due_date) e.due_date = 'Due date is required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      await onCreate({
        title: form.title.trim(),
        description: form.description.trim(),
        project_id: form.project_id,
        project_name: form.project_name || 'General',
        assigned_to: form.assigned_to || form.assigned_to_name,
        assigned_to_name: form.assigned_to_name.trim(),
        due_date: new Date(form.due_date).toISOString(),
        priority: form.priority,
      });
    } catch (err) {
      setErrors({ submit: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleProjectChange = (projectId) => {
    const proj = projects.find(p => p.project_id === projectId);
    set('project_id', projectId);
    set('project_name', proj?.project_name || '');
  };

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div style={styles.header}>
          <h2 id="modal-title" style={styles.title}>New Task</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="task-title">Title <span style={styles.required}>*</span></label>
            <input
              ref={firstInputRef}
              id="task-title"
              style={{ ...styles.input, ...(errors.title ? styles.inputError : {}) }}
              placeholder="What needs to be done?"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              maxLength={200}
            />
            {errors.title && <span style={styles.errorMsg} role="alert">{errors.title}</span>}
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="task-desc">Description</label>
            <textarea
              id="task-desc"
              style={styles.textarea}
              placeholder="Add details about this task..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
            />
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label} htmlFor="task-project">Project</label>
              <select id="task-project" style={styles.select} value={form.project_id} onChange={e => handleProjectChange(e.target.value)}>
                <option value="">— General —</option>
                {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
              </select>
            </div>

            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label} htmlFor="task-due">Due Date <span style={styles.required}>*</span></label>
              <input
                id="task-due"
                type="date"
                style={{ ...styles.input, ...(errors.due_date ? styles.inputError : {}) }}
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.due_date && <span style={styles.errorMsg} role="alert">{errors.due_date}</span>}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="task-assignee">Assignee Name <span style={styles.required}>*</span></label>
            <input
              id="task-assignee"
              style={{ ...styles.input, ...(errors.assigned_to_name ? styles.inputError : {}) }}
              placeholder="Researcher or supervisor name"
              value={form.assigned_to_name}
              onChange={e => set('assigned_to_name', e.target.value)}
            />
            {errors.assigned_to_name && <span style={styles.errorMsg} role="alert">{errors.assigned_to_name}</span>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Priority</label>
            <div style={styles.priorityGroup}>
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  style={{ ...styles.priorityBtn, ...(form.priority === p.value ? { backgroundColor: p.bg, color: p.color, borderColor: p.color } : {}) }}
                  onClick={() => set('priority', p.value)}
                  aria-pressed={form.priority === p.value}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {errors.submit && <div style={styles.submitError} role="alert">{errors.submit}</div>}

          <div style={styles.footer}>
            <button type="button" style={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" style={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' },
  modal: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)' },
  title: { fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  closeBtn: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' },
  form: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' },
  row: { display: 'flex', gap: '12px' },
  field: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' },
  required: { color: 'var(--accent-red)' },
  input: { padding: '9px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  inputError: { borderColor: 'var(--accent-red)' },
  textarea: { padding: '9px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
  select: { padding: '9px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', width: '100%' },
  errorMsg: { fontSize: '11px', color: 'var(--accent-red)' },
  submitError: { padding: '8px 12px', backgroundColor: 'var(--accent-red-light)', color: 'var(--accent-red)', borderRadius: '6px', fontSize: '12px' },
  priorityGroup: { display: 'flex', gap: '8px' },
  priorityBtn: { flex: 1, padding: '7px', border: '1px solid var(--border-default)', borderRadius: '8px', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' },
  footer: { display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px', borderTop: '1px solid var(--border-default)', paddingTop: '16px' },
  cancelBtn: { padding: '9px 18px', backgroundColor: 'transparent', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' },
  submitBtn: { padding: '9px 20px', backgroundColor: '#4fc3f7', border: 'none', borderRadius: '8px', color: '#0a0f18', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
};
