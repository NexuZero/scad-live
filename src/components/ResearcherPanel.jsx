import React from 'react';
import { getStoredRole } from '../api';

/**
 * Side panel showing the list of researchers and details for the selected one.
 * Phone number is only visible to admin/operator roles (not viewers).
 *
 * Props:
 *  - researchers: { [employee_id]: { employee_id, researcher_name, phone_number, latitude, longitude, status, last_update } }
 *  - selectedResearcher: researcher object or null
 *  - onSelect: (researcher) => void
 */
export default function ResearcherPanel({ researchers, selectedResearcher, onSelect }) {
  const role = getStoredRole();
  const canSeePhone = role === 'admin' || role === 'operator';
  const list = Object.values(researchers).sort((a, b) =>
    (a.researcher_name || '').localeCompare(b.researcher_name || '')
  );

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>Researchers ({list.length})</h3>

      {/* Selected researcher detail card */}
      {selectedResearcher && (
        <div style={styles.detailCard}>
          <div style={styles.detailHeader}>
            <span style={styles.statusDot(selectedResearcher.status === 'active')} />
            <strong>{selectedResearcher.researcher_name || selectedResearcher.employee_id}</strong>
          </div>
          <table style={styles.detailTable}>
            <tbody>
              <tr>
                <td style={styles.detailLabel}>ID</td>
                <td>{selectedResearcher.employee_id}</td>
              </tr>
              {canSeePhone && (
              <tr>
                <td style={styles.detailLabel}>Phone</td>
                <td>{selectedResearcher.phone_number || 'N/A'}</td>
              </tr>
              )}
              <tr>
                <td style={styles.detailLabel}>Position</td>
                <td>
                  {selectedResearcher.latitude?.toFixed(6)},{' '}
                  {selectedResearcher.longitude?.toFixed(6)}
                </td>
              </tr>
              <tr>
                <td style={styles.detailLabel}>Last Update</td>
                <td>{selectedResearcher.last_update || 'N/A'}</td>
              </tr>
              <tr>
                <td style={styles.detailLabel}>Status</td>
                <td style={{ color: selectedResearcher.status === 'active' ? '#2e7d32' : '#999' }}>
                  {selectedResearcher.status || 'unknown'}
                </td>
              </tr>
            </tbody>
          </table>
          <button onClick={() => onSelect(null)} style={styles.deselectBtn}>
            Deselect
          </button>
        </div>
      )}

      {/* Researcher list */}
      <div style={styles.list}>
        {list.map((r) => {
          const isSelected = selectedResearcher?.employee_id === r.employee_id;
          return (
            <div
              key={r.employee_id}
              onClick={() => onSelect(r)}
              style={{
                ...styles.listItem,
                backgroundColor: isSelected ? '#e3f2fd' : '#fff',
                borderLeft: isSelected ? '3px solid #1976d2' : '3px solid transparent',
              }}
            >
              <span style={styles.statusDot(r.status === 'active')} />
              <div style={styles.listItemText}>
                <div style={styles.listItemName}>{r.researcher_name || r.employee_id}</div>
                <div style={styles.listItemSub}>
                  {r.latitude?.toFixed(4)}, {r.longitude?.toFixed(4)}
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <div style={styles.empty}>No researchers connected</div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    borderBottom: '1px solid #eee',
  },
  heading: {
    margin: 0,
    padding: '12px 16px 8px',
    fontSize: '14px',
    color: '#333',
  },
  detailCard: {
    margin: '0 12px 12px',
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '14px',
  },
  detailTable: {
    width: '100%',
    fontSize: '12px',
    borderCollapse: 'collapse',
  },
  detailLabel: {
    fontWeight: 600,
    color: '#666',
    paddingRight: '12px',
    paddingBottom: '4px',
    whiteSpace: 'nowrap',
  },
  deselectBtn: {
    marginTop: '8px',
    padding: '4px 12px',
    fontSize: '11px',
    border: '1px solid #ccc',
    borderRadius: '3px',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  list: {
    maxHeight: '240px',
    overflowY: 'auto',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #f0f0f0',
    transition: 'background-color 0.15s',
  },
  listItemText: { flex: 1 },
  listItemName: { fontSize: '13px', fontWeight: 500 },
  listItemSub: { fontSize: '11px', color: '#888' },
  statusDot: (active) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: active ? '#4caf50' : '#bbb',
    flexShrink: 0,
  }),
  empty: {
    padding: '24px 16px',
    textAlign: 'center',
    color: '#999',
    fontSize: '13px',
  },
};
