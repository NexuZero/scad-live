import React, { useState, useEffect, useCallback } from 'react';
import { fetchTasks, updateTask, createTask, deleteTask, fetchProjects, getStoredRole, getStoredName } from '../../api';
import TaskCreateModal from '../TaskCreateModal';
import TaskDetailPanel from '../TaskDetailPanel';

const PRIORITY_COLORS = {
  high: { bg: 'var(--status-paused-bg)', fg: 'var(--status-paused-fg)' },
  medium: { bg: 'var(--status-in-progress-bg)', fg: 'var(--status-in-progress-fg)' },
  low: { bg: 'var(--status-active-bg)', fg: 'var(--status-active-fg)' },
};

const STATUS_COLORS = {
  open: { bg: 'var(--status-setup-bg)', fg: 'var(--status-setup-fg)' },
  'in-progress': { bg: 'var(--status-in-progress-bg)', fg: 'var(--status-in-progress-fg)' },
  done: { bg: 'var(--status-active-bg)', fg: 'var(--status-active-fg)' },
};

function StatusIcon({ status }) {
  if (status === 'done') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
  if (status === 'in-progress') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffa726" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function isOverdue(task) {
  return task.status !== 'done' && new Date(task.due_date) < new Date();
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const role = getStoredRole();
  const canCreate = ['admin', 'project_manager', 'supervisor'].includes(role);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTasks({ status: statusFilter, priority: priorityFilter });
      setTasks(data || []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleTaskUpdate = useCallback(async (taskId, updates) => {
    try {
      await updateTask(taskId, updates);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => ({ ...prev, ...updates }));
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  }, [selectedTask]);

  const handleTaskCreate = useCallback(async (taskData) => {
    try {
      const newTask = await createTask(taskData);
      setTasks(prev => [newTask, ...prev]);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }, []);

  const handleDelete = useCallback(async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      if (selectedTask?.id === taskId) setSelectedTask(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  }, [selectedTask]);

  const filteredTasks = tasks.filter(task => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return task.title.toLowerCase().includes(q) || task.description?.toLowerCase().includes(q) || task.assigned_to_name?.toLowerCase().includes(q);
  });

  const counts = { open: tasks.filter(t => t.status === 'open').length, 'in-progress': tasks.filter(t => t.status === 'in-progress').length, done: tasks.filter(t => t.status === 'done').length };

  return (
    <div style={styles.root}>
      <div style={styles.mainCol}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Tasks</h1>
            <p style={styles.subtitle}>{tasks.length} total · {counts.open} open · {counts['in-progress']} in progress</p>
          </div>
          {canCreate && (
            <button style={styles.createBtn} onClick={() => setShowCreateModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New Task
            </button>
          )}
        </div>

        {/* KPI pills */}
        <div style={styles.kpiRow}>
          {[['All', ''], ['Open', 'open'], ['In Progress', 'in-progress'], ['Done', 'done']].map(([label, val]) => (
            <button key={val} style={{ ...styles.kpiPill, ...(statusFilter === val ? styles.kpiPillActive : {}) }} onClick={() => setStatusFilter(val)}>
              {label} {val && <span style={styles.kpiCount}>{val ? counts[val] : tasks.length}</span>}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={styles.filterRow}>
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input style={styles.searchInput} placeholder="Search tasks, assignees..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} aria-label="Search tasks" />
          </div>
          <select style={styles.select} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="Filter by priority">
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Table */}
        <div style={styles.tableWrap}>
          {loading ? (
            <div style={styles.loadingState}>Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              <p style={styles.emptyText}>{searchQuery ? 'No tasks match your search.' : 'No tasks yet. Create one to get started.'}</p>
              {canCreate && !searchQuery && <button style={styles.createBtn} onClick={() => setShowCreateModal(true)}>+ Create Task</button>}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={styles.th} />
                  <th style={styles.th}>Task</th>
                  <th style={styles.th}>Project</th>
                  <th style={styles.th}>Assigned To</th>
                  <th style={styles.th}>Due Date</th>
                  <th style={styles.th}>Priority</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th} />
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task => {
                  const prColors = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.low;
                  const stColors = STATUS_COLORS[task.status] || STATUS_COLORS.open;
                  const overdue = isOverdue(task);
                  return (
                    <tr
                      key={task.id}
                      style={{ ...styles.tr, ...(selectedTask?.id === task.id ? styles.trActive : {}) }}
                      onClick={() => setSelectedTask(task)}
                    >
                      <td style={styles.td} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={task.status === 'done'}
                          onChange={() => handleTaskUpdate(task.id, { status: task.status === 'done' ? 'open' : 'done' })}
                          style={styles.checkbox}
                          aria-label={`Mark "${task.title}" as ${task.status === 'done' ? 'open' : 'done'}`}
                        />
                      </td>
                      <td style={styles.td}>
                        <p style={{ ...styles.taskTitle, textDecoration: task.status === 'done' ? 'line-through' : 'none', opacity: task.status === 'done' ? 0.6 : 1 }}>{task.title}</p>
                        {task.description && <p style={styles.taskDesc}>{task.description.slice(0, 60)}{task.description.length > 60 ? '…' : ''}</p>}
                      </td>
                      <td style={styles.td}><span style={styles.cellText}>{task.project_name}</span></td>
                      <td style={styles.td}><span style={styles.cellText}>{task.assigned_to_name}</span></td>
                      <td style={styles.td}>
                        <span style={{ ...styles.dueDate, color: overdue ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          {overdue && '⚠ '}{new Date(task.due_date).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: prColors.bg, color: prColors.fg }}>{task.priority}</span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.statusCell}>
                          <StatusIcon status={task.status} />
                          <span style={{ ...styles.badge, backgroundColor: stColors.bg, color: stColors.fg }}>{task.status.replace('-', ' ')}</span>
                        </div>
                      </td>
                      <td style={styles.td} onClick={e => e.stopPropagation()}>
                        {canCreate && (
                          <button style={styles.deleteBtn} onClick={() => handleDelete(task.id)} title="Delete task" aria-label="Delete task">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updates) => handleTaskUpdate(selectedTask.id, updates)}
        />
      )}

      {showCreateModal && (
        <TaskCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleTaskCreate}
        />
      )}
    </div>
  );
}

const styles = {
  root: { display: 'flex', height: 'calc(100vh - 52px)', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' },
  mainCol: { flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', overflow: 'hidden', minWidth: 0 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle: { fontSize: '12px', color: 'var(--text-muted)', margin: 0 },
  createBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#4fc3f7', color: '#0a0f18', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  kpiRow: { display: 'flex', gap: '8px', marginBottom: '14px' },
  kpiPill: { padding: '5px 14px', borderRadius: '20px', border: '1px solid var(--border-default)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px' },
  kpiPillActive: { backgroundColor: '#4fc3f7', color: '#0a0f18', borderColor: '#4fc3f7', fontWeight: 600 },
  kpiCount: { backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: '10px', padding: '1px 6px', fontSize: '11px', fontWeight: 700 },
  filterRow: { display: 'flex', gap: '10px', marginBottom: '12px' },
  searchWrap: { position: 'relative', flex: 1 },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' },
  searchInput: { width: '100%', padding: '8px 10px 8px 30px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  select: { padding: '8px 12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' },
  tableWrap: { flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-default)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', zIndex: 1 },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background 0.12s' },
  trActive: { backgroundColor: 'rgba(79,195,247,0.06)', borderLeft: '3px solid #4fc3f7' },
  td: { padding: '10px 14px', verticalAlign: 'middle' },
  checkbox: { width: '15px', height: '15px', cursor: 'pointer', accentColor: '#4fc3f7' },
  taskTitle: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' },
  taskDesc: { fontSize: '11px', color: 'var(--text-muted)', margin: 0 },
  cellText: { fontSize: '12px', color: 'var(--text-secondary)' },
  dueDate: { fontSize: '12px', fontFamily: 'monospace', fontWeight: 500 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' },
  statusCell: { display: 'flex', alignItems: 'center', gap: '6px' },
  deleteBtn: { padding: '5px', border: '1px solid var(--border-default)', borderRadius: '4px', backgroundColor: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  loadingState: { padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' },
  emptyState: { padding: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
  emptyText: { fontSize: '14px', color: 'var(--text-muted)', margin: 0 },
};
