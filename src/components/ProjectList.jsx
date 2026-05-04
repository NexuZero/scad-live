import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjects } from '../api';

export default function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchProjects()
      .then((data) => {
        if (!cancelled) setProjects(Array.isArray(data) ? data : data.projects || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = projects.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search && !p.project_name.toLowerCase().includes(search.toLowerCase())
        && !(p.region || '').toLowerCase().includes(search.toLowerCase())
        && !(p.district || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div style={s.loading}>Loading projects…</div>;

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <h1 style={s.title}>Projects</h1>
        <Link to="/projects/new" style={s.createBtn}>+ New Project</Link>
      </div>

      <div style={s.toolbar}>
        <input
          style={s.search}
          placeholder="Search by name, region, or district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={s.filters}>
          {['all', 'active', 'completed', 'paused'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ ...s.filterBtn, ...(filter === f ? s.filterActive : {}) }}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={s.empty}>
          {projects.length === 0
            ? <>No projects yet. <Link to="/projects/new" style={s.link}>Create your first project</Link></>
            : 'No projects match your filters.'
          }
        </div>
      ) : (
        <div style={s.grid}>
          {filtered.map((p) => (
            <Link key={p.project_id} to={`/projects/${p.project_id}`} style={s.card}>
              <div style={s.cardHeader}>
                <span style={{ ...s.statusDot, backgroundColor: statusColor(p.status) }} />
                <span style={s.cardTitle}>{p.project_name}</span>
              </div>
              <div style={s.cardMeta}>
                <div>{p.region}{p.district ? ` — ${p.district}` : ''}</div>
                <div style={s.cardDates}>{p.start_date} → {p.end_date}</div>
              </div>
              <div style={s.cardStats}>
                <Stat label="Samples" value={p.sample_count ?? 0} />
                <Stat label="Researchers" value={p.researcher_count ?? 0} />
                <Stat label="Completion" value={`${p.completion_pct ?? 0}%`} />
              </div>
              <div style={s.cardStatus}>
                <span style={{ ...s.badge, backgroundColor: statusColor(p.status) }}>
                  {p.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function statusColor(status) {
  if (status === 'active') return '#2e7d32';
  if (status === 'completed') return '#6a1b9a';
  return '#e65100';
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#333' }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#999' }}>{label}</div>
    </div>
  );
}

const s = {
  page: { padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { margin: 0, fontSize: '22px', color: '#1a1a2e' },
  createBtn: {
    padding: '8px 20px', backgroundColor: '#1976d2', color: '#fff', borderRadius: '6px',
    textDecoration: 'none', fontSize: '13px', fontWeight: 600,
  },
  loading: { padding: '60px', textAlign: 'center', color: '#888', fontSize: '14px' },
  toolbar: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
  search: {
    flex: 1, minWidth: '200px', padding: '8px 14px', border: '1px solid #ddd',
    borderRadius: '6px', fontSize: '13px', outline: 'none',
  },
  filters: { display: 'flex', gap: '4px' },
  filterBtn: {
    padding: '6px 14px', border: '1px solid #ddd', borderRadius: '6px',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', color: '#666',
  },
  filterActive: { backgroundColor: '#1976d2', color: '#fff', borderColor: '#1976d2' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card: {
    display: 'block', padding: '20px', backgroundColor: '#fff', borderRadius: '10px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', textDecoration: 'none', color: 'inherit',
    transition: 'box-shadow 0.15s, transform 0.15s', cursor: 'pointer',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  cardTitle: { fontSize: '15px', fontWeight: 600, color: '#1a1a2e' },
  cardMeta: { fontSize: '12px', color: '#888', marginBottom: '14px' },
  cardDates: { fontSize: '11px', color: '#aaa', marginTop: '2px' },
  cardStats: { display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', marginBottom: '10px' },
  cardStatus: { textAlign: 'right' },
  badge: { padding: '2px 10px', borderRadius: '10px', color: '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' },
  empty: { padding: '60px', textAlign: 'center', color: '#999', fontSize: '14px' },
  link: { color: '#1976d2', textDecoration: 'none' },
};
