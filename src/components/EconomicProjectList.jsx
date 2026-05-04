import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchEconomicProjects, updateEconomicProject, deleteEconomicProject } from '../api';

const TYPE_LABELS = { economic: 'Economic', social: 'Social', opinion_poll: 'Opinion Poll' };
const STATUS_COLORS = {
  setup: { bg: '#f5f5f5', fg: '#666' },
  active: { bg: '#e8f5e9', fg: '#2e7d32' },
  in_progress: { bg: '#fff3e0', fg: '#e65100' },
  completed: { bg: '#e3f2fd', fg: '#1565c0' },
  paused: { bg: '#fce4ec', fg: '#c62828' },
};

export default function EconomicProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadProjects = () => {
    setLoading(true);
    fetchEconomicProjects()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProjects(); }, []);

  const handleEdit = (e, p) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      status: p.status,
      start_date: p.start_date || '',
      end_date: p.end_date || '',
    });
  };

  const handleEditSave = async (e) => {
    e.stopPropagation();
    try {
      await updateEconomicProject(editingId, editForm);
      setEditingId(null);
      loadProjects();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
  };

  const handleEditCancel = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteClick = (e, p) => {
    e.stopPropagation();
    setDeleteConfirm(p);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteEconomicProject(deleteConfirm.id);
      setDeleteConfirm(null);
      loadProjects();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const filtered = filter === 'all' ? projects : projects.filter((p) => p.project_type === filter);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Survey Projects</h1>
        <Link to="/surveys/new" style={s.createBtn}>+ New Project</Link>
      </div>

      {/* Filter tabs */}
      <div style={s.filters}>
        {['all', 'economic', 'social', 'opinion_poll'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ ...s.filterBtn, ...(filter === f ? s.filterActive : {}) }}
          >
            {f === 'all' ? 'All' : TYPE_LABELS[f]}
            <span style={s.filterCount}>
              {f === 'all' ? projects.length : projects.filter((p) => p.project_type === f).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.empty}>Loading projects...</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyTitle}>No projects yet</div>
          <div style={s.emptyText}>Create your first survey project to get started.</div>
          <Link to="/surveys/new" style={s.emptyBtn}>Create Project</Link>
        </div>
      ) : (
        <div style={s.grid}>
          {filtered.map((p) => {
            const sc = STATUS_COLORS[p.status] || STATUS_COLORS.setup;
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} style={s.card} onClick={() => !isEditing && navigate(`/surveys/${p.id}`)}>
                <div style={s.cardHeader}>
                  <span style={{ ...s.typeBadge, backgroundColor: p.project_type === 'economic' ? '#e3f2fd' : '#f3e5f5', color: p.project_type === 'economic' ? '#1565c0' : '#7b1fa2' }}>
                    {TYPE_LABELS[p.project_type] || p.project_type}
                  </span>
                  <div style={s.cardActions}>
                    {!isEditing && (
                      <>
                        <button style={s.actionBtn} onClick={(e) => handleEdit(e, p)} title="Edit">&#9998;</button>
                        <button style={{ ...s.actionBtn, color: '#c62828' }} onClick={(e) => handleDeleteClick(e, p)} title="Delete">&#10005;</button>
                      </>
                    )}
                    <span style={{ ...s.statusBadge, backgroundColor: sc.bg, color: sc.fg }}>{p.status}</span>
                  </div>
                </div>

                {isEditing ? (
                  <div style={s.editForm} onClick={(e) => e.stopPropagation()}>
                    <input
                      style={s.editInput}
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Project name"
                    />
                    <select
                      style={s.editInput}
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      {Object.keys(STATUS_COLORS).map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                    <div style={s.editRow}>
                      <input
                        style={{ ...s.editInput, flex: 1 }}
                        type="date"
                        value={editForm.start_date}
                        onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                      />
                      <input
                        style={{ ...s.editInput, flex: 1 }}
                        type="date"
                        value={editForm.end_date}
                        onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                      />
                    </div>
                    <div style={s.editActions}>
                      <button style={s.saveBtn} onClick={handleEditSave}>Save</button>
                      <button style={s.cancelBtn} onClick={handleEditCancel}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={s.cardName}>{p.name}</div>
                    <div style={s.cardStats}>
                      <div style={s.statItem}>
                        <div style={s.statValue}>{p.company_count || p.total_sample || 0}</div>
                        <div style={s.statLabel}>Companies</div>
                      </div>
                      <div style={s.statItem}>
                        <div style={s.statValue}>{p.num_researchers || 0}</div>
                        <div style={s.statLabel}>Researchers</div>
                      </div>
                      <div style={s.statItem}>
                        <div style={s.statValue}>{p.working_days || 0}</div>
                        <div style={s.statLabel}>Days</div>
                      </div>
                    </div>
                    {p.start_date && (
                      <div style={s.cardDates}>{p.start_date} — {p.end_date}</div>
                    )}
                    {p.created_at && (
                      <div style={s.cardCreated}>Created: {new Date(p.created_at).toLocaleString()}</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={s.modalOverlay} onClick={() => setDeleteConfirm(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalTitle}>Delete Project</div>
            <div style={s.modalText}>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
              This will permanently remove all companies, allocations, and data associated with this project.
            </div>
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button style={s.deleteBtn} onClick={handleDeleteConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: '24px 32px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { margin: 0, fontSize: '22px', color: 'var(--text-primary)' },
  createBtn: {
    padding: '8px 20px', backgroundColor: 'var(--accent-blue)', color: 'var(--text-inverse)', borderRadius: '6px',
    textDecoration: 'none', fontSize: '13px', fontWeight: 600,
  },
  filters: { display: 'flex', gap: '6px', marginBottom: '20px' },
  filterBtn: {
    padding: '6px 14px', border: '1px solid var(--border-default)', borderRadius: '20px', backgroundColor: 'var(--bg-secondary)',
    cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px',
    transition: 'var(--transition-theme)',
  },
  filterActive: { backgroundColor: 'var(--accent-blue)', color: '#fff', borderColor: 'var(--accent-blue)' },
  filterCount: { fontSize: '10px', opacity: 0.7 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card: {
    backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: '10px', cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)', transition: 'box-shadow 0.15s, background-color 0.3s', position: 'relative',
    border: '1px solid var(--border-light)',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  cardActions: { display: 'flex', alignItems: 'center', gap: '4px' },
  actionBtn: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-faint)',
    padding: '2px 6px', borderRadius: '4px', lineHeight: 1,
  },
  typeBadge: { padding: '2px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 },
  statusBadge: { padding: '2px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 },
  cardName: { fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '14px' },
  cardStats: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' },
  statItem: { textAlign: 'center' },
  statValue: { fontSize: '18px', fontWeight: 700, color: 'var(--accent-blue)' },
  statLabel: { fontSize: '10px', color: 'var(--text-faint)' },
  cardDates: { fontSize: '11px', color: 'var(--text-disabled)' },
  cardCreated: { fontSize: '10px', color: 'var(--text-disabled)', marginTop: '6px' },
  empty: { padding: '60px', textAlign: 'center', color: 'var(--text-faint)' },
  emptyTitle: { fontSize: '18px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' },
  emptyText: { fontSize: '13px', marginBottom: '20px' },
  emptyBtn: { padding: '8px 20px', backgroundColor: 'var(--accent-blue)', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '13px' },
  // Edit form styles
  editForm: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' },
  editInput: {
    padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px',
    outline: 'none', width: '100%', boxSizing: 'border-box', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
  },
  editRow: { display: 'flex', gap: '8px' },
  editActions: { display: 'flex', gap: '8px', marginTop: '4px' },
  saveBtn: {
    padding: '6px 16px', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none',
    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  cancelBtn: {
    padding: '6px 16px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-default)',
    borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 9999,
  },
  modal: {
    backgroundColor: 'var(--bg-card)', padding: '28px', borderRadius: '12px', maxWidth: '420px',
    width: '90%', boxShadow: 'var(--shadow-lg)',
  },
  modalTitle: { fontSize: '18px', fontWeight: 700, color: 'var(--accent-red)', marginBottom: '12px' },
  modalText: { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  deleteBtn: {
    padding: '8px 20px', backgroundColor: 'var(--accent-red)', color: '#fff', border: 'none',
    borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
  },
};
