import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchEnumerators, addEnumerator, uploadEnumeratorsCSV, deleteEnumerator } from '../api';

export default function EnumeratorList() {
  const [enumerators, setEnumerators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchEnumerators();
      setEnumerators(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load enumerators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-clear messages after 4s
  useEffect(() => {
    if (!msg && !error) return;
    const t = setTimeout(() => { setMsg(null); setError(null); }, 4000);
    return () => clearTimeout(t);
  }, [msg, error]);

  const handleCSVUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadEnumeratorsCSV(file);
      setMsg(`CSV uploaded — ${result.inserted} added, ${result.updated || 0} updated (${result.total} total)`);
      load();
    } catch (err) {
      setError(err.message || 'CSV upload failed');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (barcode, name) => {
    if (!window.confirm(`Remove enumerator "${name}" (${barcode})?`)) return;
    try {
      await deleteEnumerator(barcode);
      setMsg(`Deleted ${name}`);
      load();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const downloadTemplate = () => {
    const csv = [
      'asset_barcode,name,phone,email,region,shift',
      'AB-001,Ahmed Al Mansoori,+971501234567,ahmed@scad.ae,Abu Dhabi,morning',
      'AB-002,Fatima Hassan,+971502345678,fatima@scad.ae,Abu Dhabi,evening',
      'AB-003,Omar Khalid,+971503456789,omar@scad.ae,Abu Dhabi,morning',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'enumerators_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter
  const filtered = enumerators.filter((e) => {
    if (shiftFilter !== 'all' && e.shift !== shiftFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (e.name || '').toLowerCase().includes(q) ||
        (e.asset_barcode || '').toLowerCase().includes(q) ||
        (e.region || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return <div style={s.loading}>Loading enumerators…</div>;

  return (
    <div style={s.page}>
      {/* Top bar */}
      <div style={s.topBar}>
        <div>
          <h1 style={s.title}>Enumerators</h1>
          <div style={s.subtitle}>{enumerators.length} registered personnel</div>
        </div>
        <div style={s.actions}>
          <button onClick={downloadTemplate} style={s.templateBtn}>↓ CSV Template</button>
          <label style={s.uploadBtn}>
            Upload CSV
            <input type="file" accept=".csv" ref={fileRef} onChange={handleCSVUpload} style={{ display: 'none' }} />
          </label>
          <button onClick={() => setShowForm(!showForm)} style={s.addBtn}>
            {showForm ? '✕ Cancel' : '+ Add Enumerator'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {msg && <div style={s.msgSuccess}>{msg}</div>}
      {error && <div style={s.msgError}>{error}</div>}

      {/* Add form */}
      {showForm && (
        <AddEnumeratorForm
          onSave={async (data) => {
            try {
              await addEnumerator(data);
              setMsg(`Added ${data.name} (${data.asset_barcode})`);
              setShowForm(false);
              load();
            } catch (err) {
              setError(err.message || 'Failed to add enumerator');
            }
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Toolbar — search + shift filter */}
      <div style={s.toolbar}>
        <input
          type="text"
          placeholder="Search by name, barcode, region, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={s.searchInput}
        />
        <div style={s.filterGroup}>
          {['all', 'morning', 'evening'].map((f) => (
            <button
              key={f}
              onClick={() => setShiftFilter(f)}
              style={{ ...s.filterBtn, ...(shiftFilter === f ? s.filterActive : {}) }}
            >
              {f === 'all' ? 'All Shifts' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={s.empty}>
          {enumerators.length === 0
            ? 'No enumerators yet. Add one manually or upload a CSV file.'
            : 'No enumerators match your search.'}
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Asset Barcode</th>
                <th style={s.th}>Name</th>
                <th style={s.th}>Phone</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Region</th>
                <th style={s.th}>Shift</th>
                <th style={{ ...s.th, width: '70px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.asset_barcode} style={s.tr}>
                  <td style={s.tdBarcode}>{e.asset_barcode}</td>
                  <td style={s.td}>{e.name}</td>
                  <td style={s.td}>{e.phone || '—'}</td>
                  <td style={s.td}>{e.email || '—'}</td>
                  <td style={s.td}>{e.region || '—'}</td>
                  <td style={s.td}>
                    <span style={{
                      ...s.shiftBadge,
                      backgroundColor: e.shift === 'morning' ? '#e3f2fd' : '#fff3e0',
                      color: e.shift === 'morning' ? '#1565c0' : '#e65100',
                    }}>
                      {e.shift || '—'}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button onClick={() => handleDelete(e.asset_barcode, e.name)} style={s.deleteBtn} title="Delete">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary footer */}
      {enumerators.length > 0 && (
        <div style={s.footer}>
          <span>{filtered.length} of {enumerators.length} shown</span>
          <span>
            Morning: <b>{enumerators.filter((e) => e.shift === 'morning').length}</b> ·
            Evening: <b>{enumerators.filter((e) => e.shift === 'evening').length}</b>
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Add Enumerator Form
// ═══════════════════════════════════════════════════════════════════

function AddEnumeratorForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    asset_barcode: '',
    name: '',
    phone: '',
    email: '',
    region: 'Abu Dhabi',
    shift: 'morning',
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.asset_barcode.trim() || !form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      <div style={s.formTitle}>Add New Enumerator</div>
      <div style={s.formGrid}>
        <div style={s.formField}>
          <label style={s.label}>Asset Barcode *</label>
          <input type="text" value={form.asset_barcode} onChange={set('asset_barcode')} placeholder="AB-001" style={s.input} required />
        </div>
        <div style={s.formField}>
          <label style={s.label}>Full Name *</label>
          <input type="text" value={form.name} onChange={set('name')} placeholder="Ahmed Al Mansoori" style={s.input} required />
        </div>
        <div style={s.formField}>
          <label style={s.label}>Phone</label>
          <input type="text" value={form.phone} onChange={set('phone')} placeholder="+971501234567" style={s.input} />
        </div>
        <div style={s.formField}>
          <label style={s.label}>Email</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="ahmed@scad.ae" style={s.input} />
        </div>
        <div style={s.formField}>
          <label style={s.label}>Region</label>
          <input type="text" value={form.region} onChange={set('region')} placeholder="Abu Dhabi" style={s.input} />
        </div>
        <div style={s.formField}>
          <label style={s.label}>Shift</label>
          <select value={form.shift} onChange={set('shift')} style={s.input}>
            <option value="morning">Morning</option>
            <option value="evening">Evening</option>
          </select>
        </div>
      </div>
      <div style={s.formActions}>
        <button type="button" onClick={onCancel} style={s.cancelBtn}>Cancel</button>
        <button type="submit" disabled={saving || !form.asset_barcode.trim() || !form.name.trim()} style={s.saveBtn}>
          {saving ? 'Saving…' : 'Save Enumerator'}
        </button>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const s = {
  page: { padding: '20px 28px', maxWidth: '1200px', margin: '0 auto' },
  loading: { padding: '80px', textAlign: 'center', color: '#888', fontSize: '14px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { margin: 0, fontSize: '22px', fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.3px' },
  subtitle: { fontSize: '12px', color: '#888', marginTop: '4px' },
  actions: { display: 'flex', gap: '8px', alignItems: 'center' },

  templateBtn: {
    padding: '8px 16px', backgroundColor: '#fff', color: '#555', borderRadius: '6px',
    border: '1px solid #ddd', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  uploadBtn: {
    padding: '8px 16px', backgroundColor: '#fff', color: '#1976d2', borderRadius: '6px',
    border: '1px solid #1976d2', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  addBtn: {
    padding: '8px 18px', backgroundColor: '#1976d2', color: '#fff', borderRadius: '6px',
    border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.3px',
    boxShadow: '0 2px 6px rgba(25,118,210,0.2)',
  },

  // Messages
  msgSuccess: {
    padding: '10px 16px', backgroundColor: '#e8f5e9', color: '#2e7d32', borderRadius: '6px',
    fontSize: '12px', fontWeight: 600, marginBottom: '14px', border: '1px solid #c8e6c9',
  },
  msgError: {
    padding: '10px 16px', backgroundColor: '#fce4ec', color: '#c62828', borderRadius: '6px',
    fontSize: '12px', fontWeight: 600, marginBottom: '14px', border: '1px solid #f8bbd0',
  },

  // Toolbar
  toolbar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
    marginBottom: '16px',
  },
  searchInput: {
    flex: 1, maxWidth: '360px', padding: '8px 14px', borderRadius: '6px',
    border: '1px solid #ddd', fontSize: '13px', outline: 'none',
    fontFamily: 'inherit',
  },
  filterGroup: { display: 'flex', gap: '4px' },
  filterBtn: {
    padding: '6px 14px', borderRadius: '6px', border: '1px solid #ddd',
    backgroundColor: '#fff', color: '#666', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
    transition: 'all 0.15s',
  },
  filterActive: { backgroundColor: '#1976d2', color: '#fff', borderColor: '#1976d2' },

  // Table
  tableWrap: {
    backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
    color: '#888', textTransform: 'uppercase', letterSpacing: '0.8px',
    borderBottom: '2px solid #f0f0f0', backgroundColor: '#fafbfc',
  },
  tr: { borderBottom: '1px solid #f5f5f5', transition: 'background 0.1s' },
  td: { padding: '10px 16px', color: '#333' },
  tdBarcode: {
    padding: '10px 16px', fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '12px', fontWeight: 600, color: '#1976d2', letterSpacing: '0.5px',
  },
  shiftBadge: {
    padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
    display: 'inline-block',
  },
  deleteBtn: {
    border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px 8px',
    borderRadius: '4px', transition: 'background 0.15s',
  },

  // Empty
  empty: {
    padding: '60px 20px', textAlign: 'center', color: '#aaa', fontSize: '14px',
    backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },

  // Footer
  footer: {
    display: 'flex', justifyContent: 'space-between', padding: '10px 0',
    fontSize: '11px', color: '#aaa', marginTop: '10px',
  },

  // Form
  form: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '16px',
    border: '1px solid #e3f2fd',
  },
  formTitle: { fontSize: '14px', fontWeight: 700, color: '#1a1a2e', marginBottom: '14px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  formField: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: {
    padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd',
    fontSize: '13px', outline: 'none', fontFamily: 'inherit',
  },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' },
  cancelBtn: {
    padding: '8px 18px', backgroundColor: '#fff', color: '#666', borderRadius: '6px',
    border: '1px solid #ddd', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  saveBtn: {
    padding: '8px 18px', backgroundColor: '#1976d2', color: '#fff', borderRadius: '6px',
    border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
    boxShadow: '0 2px 6px rgba(25,118,210,0.2)',
  },
};
