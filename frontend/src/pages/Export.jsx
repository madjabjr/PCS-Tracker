import { useState } from 'react'
import api from '../api/client'

const SECTIONS = [
  {
    key: 'tasks',
    label: 'Task Checklist',
    desc: 'All PCS tasks grouped by category with completion status.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    key: 'items',
    label: 'High-Value Items',
    desc: 'Inventory list with descriptions, estimated values, and serial numbers.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    key: 'travel',
    label: 'Travel Itineraries',
    desc: 'Saved flight itineraries with routes, dates, and notes.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    ),
  },
  {
    key: 'documents',
    label: 'Document Index',
    desc: 'Index of all uploaded documents with categories and upload dates.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
]

export default function Export() {
  const [selected, setSelected] = useState(['tasks', 'items', 'travel', 'documents'])
  const [title, setTitle] = useState('PCS Move Export')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const toggle = (key) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
    setError('')
  }

  const handleExport = async () => {
    if (selected.length === 0) { setError('Select at least one section to include.'); return }
    setExporting(true)
    setError('')
    setSuccess(false)
    try {
      const res = await api.post(
        '/export/pdf',
        { sections: selected, title: title.trim() || 'PCS Move Export' },
        { responseType: 'blob' }
      )
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `pcs-export-${date}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch {
      setError('Export failed. Make sure the backend is running and try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Export</h1>
        <p className="page-subtitle">Compile your PCS data into a downloadable PDF report.</p>
      </div>

      <div className="export-layout">
        <div className="card export-options-card">
          <div className="card-header">
            <h2 className="card-title">Report Contents</h2>
          </div>

          <div className="export-sections">
            {SECTIONS.map(sec => (
              <label
                key={sec.key}
                className={`export-option${selected.includes(sec.key) ? ' export-option--checked' : ''}`}
              >
                <input
                  type="checkbox"
                  className="export-checkbox"
                  checked={selected.includes(sec.key)}
                  onChange={() => toggle(sec.key)}
                />
                <div className="export-option-icon">
                  {sec.icon}
                </div>
                <div className="export-option-body">
                  <div className="export-option-label">{sec.label}</div>
                  <div className="export-option-desc">{sec.desc}</div>
                </div>
                <div className="export-option-check" aria-hidden="true">
                  {selected.includes(sec.key) && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="13" height="13">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="export-title-row">
            <div className="form-group">
              <label>Report Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="PCS Move Export"
              />
            </div>
          </div>

          {error && <div className="form-error" style={{ margin: '0 20px 16px' }}>{error}</div>}
          {success && (
            <div className="tv-saved-toast" style={{ margin: '0 20px 16px' }}>
              PDF downloaded successfully.
            </div>
          )}

          <div className="card-footer export-footer">
            <span className="export-summary">
              {selected.length === 0
                ? 'No sections selected'
                : `${selected.length} section${selected.length !== 1 ? 's' : ''} selected`}
            </span>
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting || selected.length === 0}
            >
              {exporting ? (
                <>
                  <span className="export-spinner" />
                  Generating…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>

        <div className="card export-info-card">
          <div className="card-header">
            <h2 className="card-title">About This Report</h2>
          </div>
          <div className="export-info-body">
            <div className="export-info-item">
              <div className="export-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <div className="export-info-title">Private &amp; Secure</div>
                <div className="export-info-desc">Generated on your server and downloaded directly — no data leaves your home network.</div>
              </div>
            </div>
            <div className="export-info-item">
              <div className="export-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
              </div>
              <div>
                <div className="export-info-title">Print-Ready Layout</div>
                <div className="export-info-desc">Formatted for letter-size paper with section headers, tables, and page numbers.</div>
              </div>
            </div>
            <div className="export-info-item">
              <div className="export-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <div className="export-info-title">Point-in-Time Snapshot</div>
                <div className="export-info-desc">Reflects your data at the moment of export. Re-export anytime to get the latest.</div>
              </div>
            </div>
            <div className="export-info-item">
              <div className="export-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <div className="export-info-title">Note on Uploaded Files</div>
                <div className="export-info-desc">The document index lists file names and dates. The actual file contents are not embedded in the PDF.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
