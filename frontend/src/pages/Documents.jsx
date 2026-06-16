import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'
import DocViewer from '../components/DocViewer'

const CATEGORIES = {
  orders:    { label: 'PCS Orders',  color: '#1e3a5f', bg: 'rgba(30,58,95,.11)' },
  medical:   { label: 'Medical',     color: '#166534', bg: 'rgba(22,101,52,.1)' },
  housing:   { label: 'Housing',     color: '#92400e', bg: 'rgba(146,64,14,.1)' },
  financial: { label: 'Financial',   color: '#6b21a8', bg: 'rgba(107,33,168,.1)' },
  personnel: { label: 'Personnel',   color: '#0c4a6e', bg: 'rgba(12,74,110,.1)' },
  other:     { label: 'Other',       color: '#374151', bg: 'rgba(55,65,81,.1)' },
}

function FileIcon({ contentType, filename }) {
  const ext = (filename || '').toLowerCase().split('.').pop()
  const ct = contentType || ''

  if (ct.includes('pdf') || ext === 'pdf') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  )

  if (ct.includes('image') || ['jpg','jpeg','png','gif','webp'].includes(ext)) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )

  if (['doc','docx'].includes(ext) || ct.includes('word')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )

  if (['xls','xlsx'].includes(ext) || ct.includes('spreadsheet') || ct.includes('excel')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
      <line x1="12" y1="9" x2="12" y2="21" />
    </svg>
  )

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadModal({ onClose, onUploaded }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('other')
  const [description, setDescription] = useState('')
  const [isSensitive, setIsSensitive] = useState(false)
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const pickFile = (f) => {
    if (!f) return
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Document name is required.'); return }
    if (!file) { setError('Please select a file.'); return }
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('category', category)
      if (description) fd.append('description', description)
      fd.append('is_sensitive', isSensitive ? 'true' : 'false')
      fd.append('file', file)
      const res = await api.post('/documents/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onUploaded(res.data)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hvi-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hvi-modal card">
        <div className="hvi-modal-header">
          <h2 className="card-title">Upload Document</h2>
          <button className="hvi-close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className="hvi-modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div
            className={`doc-upload-zone${dragOver ? ' doc-upload-zone--drag' : ''}${file ? ' doc-upload-zone--has-file' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="doc-upload-file">
                <div className="doc-upload-file-icon" style={{ color: 'var(--color-primary)' }}>
                  <FileIcon contentType={file.type} filename={file.name} />
                </div>
                <div className="doc-upload-file-info">
                  <span className="doc-upload-file-name">{file.name}</span>
                  <span className="doc-upload-file-size">{formatBytes(file.size)}</span>
                </div>
                <button
                  type="button"
                  className="doc-upload-clear"
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  aria-label="Remove file"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="doc-upload-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Drop file here or click to browse</span>
                <span className="doc-upload-hint">PDF, Word, Excel, images · Max 25 MB</span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hvi-file-input"
              onChange={e => pickFile(e.target.files[0])}
            />
          </div>

          <div className="form-group">
            <label>Document Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. PCS Orders – Fort Bragg"
              autoFocus
            />
          </div>

          <div className="hvi-form-grid">
            <div className="form-group">
              <label>Category</label>
              <select
                className="cl-add-select"
                style={{ width: '100%', padding: '9px 12px' }}
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <label className={`doc-sensitive-toggle${isSensitive ? ' doc-sensitive-toggle--on' : ''}`}>
            <input
              type="checkbox"
              checked={isSensitive}
              onChange={e => setIsSensitive(e.target.checked)}
              style={{ display: 'none' }}
            />
            <div className="doc-sensitive-toggle-check">
              {isSensitive && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="11" height="11">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <div className="doc-sensitive-toggle-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div className="doc-sensitive-toggle-body">
              <span className="doc-sensitive-toggle-label">Mark as Sensitive</span>
              <span className="doc-sensitive-toggle-desc">File will be compressed and encrypted at rest using AES-256-GCM.</span>
            </div>
          </label>

          <div className="hvi-modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving || !file}>
              {saving ? 'Uploading…' : 'Upload Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [viewerDoc, setViewerDoc] = useState(null)

  const fetchDocs = useCallback(async () => {
    try {
      const res = await api.get('/documents/')
      setDocs(res.data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const onUploaded = (doc) => setDocs(prev => [doc, ...prev])

  const downloadDoc = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = doc.original_filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // silent — server will 404 if file missing
    }
  }

  const deleteDoc = async (id) => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    setDocs(prev => prev.filter(d => d.id !== id))
    try {
      await api.delete(`/documents/${id}`)
    } catch {
      fetchDocs()
    }
  }

  const countByCategory = {}
  docs.forEach(d => { countByCategory[d.category] = (countByCategory[d.category] || 0) + 1 })

  const filtered = filter === 'all' ? docs : docs.filter(d => d.category === filter)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Documents</h1>
        <p className="page-subtitle">Securely store PCS orders, medical records, and important paperwork.</p>
      </div>

      <div className="cl-toolbar">
        <div className="cl-tabs">
          <button
            className={`cl-tab${filter === 'all' ? ' cl-tab--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
            <span className="cl-tab-count">{docs.length}</span>
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => {
            const count = countByCategory[key] || 0
            if (count === 0 && filter !== key) return null
            return (
              <button
                key={key}
                className={`cl-tab${filter === key ? ' cl-tab--active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {cat.label}
                {count > 0 && <span className="cl-tab-count">{count}</span>}
              </button>
            )
          })}
        </div>
        <button className="btn btn-primary cl-add-btn" onClick={() => setShowModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Document
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="coming-soon coming-soon--inline">
            <div className="coming-soon-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h2>
              {filter === 'all'
                ? 'No documents uploaded yet'
                : `No ${CATEGORIES[filter]?.label} documents`}
            </h2>
            <p>
              {filter === 'all'
                ? 'Upload PCS orders, medical records, and other important paperwork to keep everything organized.'
                : 'Upload a document and assign it to this category.'}
            </p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              Upload First Document
            </button>
          </div>
        ) : (
          <div className="doc-list">
            {filtered.map(doc => {
              const cat = CATEGORIES[doc.category] || CATEGORIES.other
              return (
                <div key={doc.id} className="doc-row">
                  <div
                    className="doc-icon"
                    style={{ color: cat.color, background: cat.bg }}
                  >
                    <FileIcon contentType={doc.content_type} filename={doc.original_filename} />
                  </div>
                  <div className="doc-meta">
                    <div className="doc-name">{doc.name}</div>
                    {doc.description && <div className="doc-desc">{doc.description}</div>}
                    <div className="doc-detail">
                      <span>{doc.original_filename}</span>
                      <span>·</span>
                      <span>{formatBytes(doc.file_size)}</span>
                      <span>·</span>
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {doc.is_sensitive && (
                    <div className="doc-sensitive-badge" title="Encrypted at rest">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                      Encrypted
                    </div>
                  )}
                  <div className="doc-badge" style={{ color: cat.color, background: cat.bg }}>
                    {cat.label}
                  </div>
                  <div className="doc-actions">
                    <button
                      className="hvi-action-btn"
                      onClick={() => setViewerDoc(doc)}
                      title="View"
                      aria-label="View"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      className="hvi-action-btn"
                      onClick={() => downloadDoc(doc)}
                      title="Download"
                      aria-label="Download"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      className="hvi-action-btn hvi-action-btn--danger"
                      onClick={() => deleteDoc(doc.id)}
                      title="Delete"
                      aria-label="Delete"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <UploadModal onClose={() => setShowModal(false)} onUploaded={onUploaded} />
      )}

      {viewerDoc && (
        <DocViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} />
      )}
    </div>
  )
}
