import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject, uploadSamplePoints, uploadResearchers, validateProjectSamples } from '../api';

function generateProjectId() {
  // Crypto-random UUID v4
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function ProjectCreate() {
  const navigate = useNavigate();
  const projectId = useMemo(() => generateProjectId(), []);
  const [form, setForm] = useState({
    project_name: '',
    region: 'Abu Dhabi',
    district: '',
    start_date: '',
    end_date: '',
  });
  const [samplesFile, setSamplesFile] = useState(null);
  const [researchersFile, setResearchersFile] = useState(null);
  const [step, setStep] = useState(1); // 1=form, 2=uploading, 3=done
  const [error, setError] = useState('');
  const [progress, setProgress] = useState([]);

  const addProgress = (msg) => setProgress((p) => [...p, msg]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.project_name || !form.start_date || !form.end_date) {
      setError('Project name, start date, and end date are required.');
      return;
    }
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      setError('End date must be after start date.');
      return;
    }

    setStep(2);
    try {
      addProgress(`Creating project ${projectId}…`);
      await createProject({ ...form, project_id: projectId });
      addProgress(`Project created: ${projectId}`);

      if (samplesFile) {
        addProgress('Uploading sample points CSV…');
        const samplesResult = await uploadSamplePoints(projectId, samplesFile);
        addProgress(`Uploaded ${samplesResult.inserted ?? '?'} sample points`);

        addProgress('Running coordinate validation…');
        try {
          await validateProjectSamples(projectId);
          addProgress('Validation complete');
        } catch {
          addProgress('Validation skipped (service unavailable)');
        }
      }

      if (researchersFile) {
        addProgress('Uploading researchers CSV…');
        const resResult = await uploadResearchers(projectId, researchersFile);
        addProgress(`Uploaded ${resResult.inserted ?? '?'} researchers`);
      }

      setStep(3);
      addProgress('Done! Redirecting…');
      setTimeout(() => navigate(`/projects/${projectId}`), 1500);
    } catch (err) {
      setError(err.message || 'Failed to create project');
      setStep(1);
    }
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Create New Project</h1>

      {step === 2 || step === 3 ? (
        <div style={s.progressBox}>
          {progress.map((msg, i) => (
            <div key={i} style={s.progressItem}>
              <span style={{ color: '#2e7d32' }}>✓</span> {msg}
            </div>
          ))}
          {error && <div style={s.error}>{error}</div>}
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={s.form}>
          {error && <div style={s.error}>{error}</div>}

          <div style={s.section}>
            <h3 style={s.sectionTitle}>Project Details</h3>
            <div style={s.idRow}>
              <span style={s.idLabel}>Project ID</span>
              <span style={s.idValue}>{projectId}</span>
              <span style={s.idHint}>Auto-generated, non-editable</span>
            </div>
            <div style={s.fieldGrid}>
              <Field label="Project Name *" name="project_name" value={form.project_name} onChange={handleChange} placeholder="e.g., Abu Dhabi Census Q1 2026" />
              <Field label="Region" name="region" value={form.region} onChange={handleChange} placeholder="Abu Dhabi" />
              <Field label="District" name="district" value={form.district} onChange={handleChange} placeholder="e.g., Khalifa City" />
              <Field label="Start Date *" name="start_date" type="date" value={form.start_date} onChange={handleChange} />
              <Field label="End Date *" name="end_date" type="date" value={form.end_date} onChange={handleChange} />
            </div>
          </div>

          <div style={s.section}>
            <h3 style={s.sectionTitle}>Upload CSV Files</h3>
            <p style={s.hint}>
              Upload CSV files to populate sample points and assign researchers.
              Download templates: {' '}
              <a href="/api/projects/templates/sample-points" style={s.link} download>sample_points.csv</a>
              {' | '}
              <a href="/api/projects/templates/researchers" style={s.link} download>researchers.csv</a>
            </p>

            <FileUpload
              label="Sample Points CSV"
              file={samplesFile}
              onFile={setSamplesFile}
              accept=".csv"
              hint="Columns: household_id, latitude, longitude, district, region, notes"
            />
            <FileUpload
              label="Researchers CSV"
              file={researchersFile}
              onFile={setResearchersFile}
              accept=".csv"
              hint="Columns: fw_id, name, phone, email, home_location, region, shift"
            />
          </div>

          <div style={s.actions}>
            <button type="button" onClick={() => navigate('/projects')} style={s.cancelBtn}>Cancel</button>
            <button type="submit" style={s.submitBtn}>Create Project</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label style={s.fieldLabel}>
      <span style={s.labelText}>{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={s.input}
      />
    </label>
  );
}

function FileUpload({ label, file, onFile, accept, hint }) {
  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      style={s.dropZone}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div style={s.dropLabel}>{label}</div>
      {file ? (
        <div style={s.fileName}>
          {file.name} ({(file.size / 1024).toFixed(1)} KB)
          <button onClick={() => onFile(null)} style={s.removeFile}>Remove</button>
        </div>
      ) : (
        <>
          <label style={s.browseBtn}>
            Browse…
            <input type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => onFile(e.target.files[0])} />
          </label>
          <div style={s.dropHint}>or drag & drop here</div>
        </>
      )}
      <div style={s.fieldHint}>{hint}</div>
    </div>
  );
}

const s = {
  page: { padding: '24px 32px', maxWidth: '720px', margin: '0 auto' },
  title: { margin: '0 0 24px', fontSize: '22px', color: '#1a1a2e' },
  form: { display: 'flex', flexDirection: 'column', gap: '24px' },
  section: { backgroundColor: '#fff', padding: '24px', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  sectionTitle: { margin: '0 0 16px', fontSize: '15px', color: '#333' },
  idRow: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
    padding: '10px 14px', backgroundColor: '#f5f7fa', borderRadius: '6px', border: '1px solid #e0e0e0',
  },
  idLabel: { fontSize: '12px', fontWeight: 600, color: '#555' },
  idValue: { fontFamily: 'monospace', fontSize: '13px', color: '#1976d2', fontWeight: 600, letterSpacing: '0.5px' },
  idHint: { fontSize: '10px', color: '#aaa', marginLeft: 'auto' },
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: '4px' },
  labelText: { fontSize: '12px', fontWeight: 600, color: '#555' },
  input: {
    padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px',
    fontSize: '13px', outline: 'none',
  },
  hint: { fontSize: '12px', color: '#888', marginBottom: '14px' },
  link: { color: '#1976d2' },
  dropZone: {
    border: '2px dashed #ddd', borderRadius: '8px', padding: '20px',
    textAlign: 'center', marginBottom: '12px', transition: 'border-color 0.2s',
  },
  dropLabel: { fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#333' },
  browseBtn: {
    display: 'inline-block', padding: '6px 16px', backgroundColor: '#f5f5f5',
    border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer',
    fontSize: '12px', color: '#555',
  },
  dropHint: { fontSize: '11px', color: '#bbb', marginTop: '6px' },
  fieldHint: { fontSize: '10px', color: '#aaa', marginTop: '8px' },
  fileName: { fontSize: '13px', color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  removeFile: {
    padding: '2px 8px', fontSize: '11px', border: '1px solid #ddd',
    borderRadius: '3px', backgroundColor: '#fff', cursor: 'pointer', color: '#c62828',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  cancelBtn: {
    padding: '8px 20px', border: '1px solid #ddd', borderRadius: '6px',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', color: '#666',
  },
  submitBtn: {
    padding: '8px 24px', backgroundColor: '#1976d2', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
  },
  error: { padding: '10px 14px', backgroundColor: '#fce4ec', color: '#c62828', borderRadius: '6px', fontSize: '13px' },
  progressBox: { backgroundColor: '#fff', padding: '24px', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  progressItem: { padding: '6px 0', fontSize: '13px', color: '#333' },
};
