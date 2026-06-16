import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'

// ── Constants ──────────────────────────────────────────────────────────────────

const WAITLIST_STATUSES = {
  active:  { label: 'Active',  color: '#166534', bg: 'rgba(22,101,52,.1)' },
  housed:  { label: 'Housed',  color: '#1e3a5f', bg: 'rgba(30,58,95,.11)' },
  removed: { label: 'Removed', color: '#6b7280', bg: 'rgba(107,114,128,.1)' },
}

const PROPERTY_STATUSES = {
  considering: { label: 'Considering', color: '#92400e', bg: 'rgba(146,64,14,.1)' },
  shortlisted: { label: 'Shortlisted', color: '#1e3a5f', bg: 'rgba(30,58,95,.11)' },
  selected:    { label: 'Selected',    color: '#166534', bg: 'rgba(22,101,52,.1)' },
  rejected:    { label: 'Rejected',    color: '#6b7280', bg: 'rgba(107,114,128,.1)' },
}

// 2025 national-average BAH rates (W/O = without dependents, W/ = with dependents)
// These are estimates — always verify at MyPay or the DoD BAH calculator.
const BAH_RATES = {
  'E-1': [1008, 1263], 'E-2': [1008, 1263], 'E-3': [1008, 1263],
  'E-4': [1107, 1389], 'E-5': [1218, 1530], 'E-6': [1338, 1677],
  'E-7': [1470, 1842], 'E-8': [1617, 2025], 'E-9': [1779, 2229],
  'W-1': [1470, 1842], 'W-2': [1617, 2025], 'W-3': [1779, 2229],
  'W-4': [1956, 2448], 'W-5': [2151, 2691],
  'O-1': [1218, 1530], 'O-2': [1338, 1677], 'O-3': [1617, 2025],
  'O-4': [1956, 2448], 'O-5': [2151, 2691], 'O-6': [2364, 2958],
  'O-7': [2601, 3252], 'O-8': [2601, 3252], 'O-9': [2601, 3252], 'O-10': [2601, 3252],
}

const PAY_GRADES = [
  'E-1','E-2','E-3','E-4','E-5','E-6','E-7','E-8','E-9',
  'W-1','W-2','W-3','W-4','W-5',
  'O-1','O-2','O-3','O-4','O-5','O-6','O-7','O-8','O-9','O-10',
]

const fmt = (n) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtMo = (min) => min == null ? '—' : min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`

// ── Shared close button ────────────────────────────────────────────────────────

function CloseBtn({ onClick }) {
  return (
    <button className="hvi-close-btn" onClick={onClick} aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WAITLIST TAB
// ══════════════════════════════════════════════════════════════════════════════

function WaitlistModal({ entry, onClose, onSaved }) {
  const [form, setForm] = useState({
    base_name: entry?.base_name || '',
    waitlist_type: entry?.waitlist_type || '',
    position: entry?.position != null ? String(entry.position) : '',
    status: entry?.status || 'active',
    date_applied: entry?.date_applied || '',
    notes: entry?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.base_name.trim()) { setError('Base name is required.'); return }
    if (!form.waitlist_type.trim()) { setError('Waitlist type is required.'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        base_name: form.base_name.trim(),
        waitlist_type: form.waitlist_type.trim(),
        position: form.position !== '' ? Number(form.position) : null,
        status: form.status,
        date_applied: form.date_applied || null,
        notes: form.notes || null,
      }
      const res = entry
        ? await api.patch(`/housing/waitlists/${entry.id}`, body)
        : await api.post('/housing/waitlists', body)
      onSaved(res.data, !!entry)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save entry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hvi-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hvi-modal card">
        <div className="hvi-modal-header">
          <h2 className="card-title">{entry ? 'Edit Waitlist Entry' : 'Add Waitlist Entry'}</h2>
          <CloseBtn onClick={onClose} />
        </div>
        <form className="hvi-modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <div className="hvi-form-grid">
            <div className="form-group">
              <label>Installation / Base *</label>
              <input value={form.base_name} onChange={set('base_name')} placeholder="e.g. Fort Liberty" autoFocus />
            </div>
            <div className="form-group">
              <label>Waitlist Type *</label>
              <input value={form.waitlist_type} onChange={set('waitlist_type')} placeholder="e.g. Family Housing, GOQ, NCO" />
            </div>
          </div>
          <div className="hvi-form-grid">
            <div className="form-group">
              <label>Current Position</label>
              <input
                type="number"
                min="1"
                value={form.position}
                onChange={set('position')}
                placeholder="e.g. 42"
              />
            </div>
            <div className="form-group">
              <label>Date Applied</label>
              <input type="date" value={form.date_applied} onChange={set('date_applied')} />
            </div>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="cl-add-select" style={{ width: '100%', padding: '9px 12px' }} value={form.status} onChange={set('status')}>
              {Object.entries(WAITLIST_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Any additional notes…"
              style={{ resize: 'vertical', minHeight: 72 }}
            />
          </div>
          <div className="hvi-modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : entry ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function WaitlistTab() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)

  const fetch = useCallback(async () => {
    try {
      const res = await api.get('/housing/waitlists')
      setEntries(res.data)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const onSaved = (entry, isEdit) => {
    if (isEdit) {
      setEntries(prev => prev.map(e => e.id === entry.id ? entry : e))
    } else {
      setEntries(prev => [entry, ...prev])
    }
  }

  const deleteEntry = async (id) => {
    if (!confirm('Remove this waitlist entry?')) return
    setEntries(prev => prev.filter(e => e.id !== id))
    try { await api.delete(`/housing/waitlists/${id}`) } catch { fetch() }
  }

  const openEdit = (entry) => { setEditing(entry); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditing(null) }

  return (
    <div>
      <div className="cl-toolbar">
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {entries.length > 0 && `${entries.filter(e => e.status === 'active').length} active waitlist${entries.filter(e => e.status === 'active').length !== 1 ? 's' : ''}`}
        </div>
        <button className="btn btn-primary cl-add-btn" onClick={() => { setEditing(null); setShowModal(true) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Waitlist Entry
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="coming-soon coming-soon--inline">
            <div className="coming-soon-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
              </svg>
            </div>
            <h2>No waitlist entries yet</h2>
            <p>Track your position on base housing waitlists and update your number as it changes.</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add First Entry</button>
          </div>
        ) : (
          <div className="doc-list">
            {entries.map(entry => {
              const st = WAITLIST_STATUSES[entry.status] || WAITLIST_STATUSES.active
              return (
                <div key={entry.id} className="doc-row">
                  <div className="doc-icon" style={{ color: st.color, background: st.bg, minWidth: 42, height: 42 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                      <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
                    </svg>
                  </div>
                  <div className="doc-meta">
                    <div className="doc-name">{entry.base_name}</div>
                    <div className="doc-desc">{entry.waitlist_type}</div>
                    <div className="doc-detail">
                      {entry.position != null && <><span>Position #{entry.position}</span><span>·</span></>}
                      {entry.date_applied && <><span>Applied {new Date(entry.date_applied).toLocaleDateString()}</span><span>·</span></>}
                      <span>Updated {new Date(entry.updated_at).toLocaleDateString()}</span>
                    </div>
                    {entry.notes && <div className="doc-detail" style={{ marginTop: 2, fontStyle: 'italic' }}>{entry.notes}</div>}
                  </div>
                  <div className="doc-badge" style={{ color: st.color, background: st.bg }}>{st.label}</div>
                  <div className="doc-actions">
                    <button className="hvi-action-btn" onClick={() => openEdit(entry)} title="Edit">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button className="hvi-action-btn hvi-action-btn--danger" onClick={() => deleteEntry(entry.id)} title="Delete">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6M9 6V4h6v2" />
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
        <WaitlistModal entry={editing} onClose={closeModal} onSaved={onSaved} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// HOUSING COMPARISONS TAB
// ══════════════════════════════════════════════════════════════════════════════

function PhotoUploadZone({ photos, onAdd, onRemove }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef()

  const pick = (files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (valid.length) onAdd(valid)
  }

  return (
    <div>
      <label>Photos</label>
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={p.preview || `/uploads/${p.filename}`}
                alt=""
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border)' }}
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                style={{
                  position: 'absolute', top: -6, right: -6, background: 'var(--color-danger)',
                  color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                }}
                aria-label="Remove photo"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="10" height="10">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={`doc-upload-zone${drag ? ' doc-upload-zone--drag' : ''}`}
        style={{ padding: '16px 12px' }}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files) }}
      >
        <div className="doc-upload-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>Drop photos or click to browse</span>
          <span className="doc-upload-hint">JPEG, PNG, WebP · Max 10 MB each</span>
        </div>
        <input ref={ref} type="file" accept="image/*" multiple className="hvi-file-input" onChange={e => pick(e.target.files)} />
      </div>
    </div>
  )
}

function PropertyModal({ prop, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: prop?.name || '',
    address: prop?.address || '',
    rent: prop?.rent != null ? String(prop.rent) : '',
    utilities_estimate: prop?.utilities_estimate != null ? String(prop.utilities_estimate) : '',
    commute_time_minutes: prop?.commute_time_minutes != null ? String(prop.commute_time_minutes) : '',
    bedrooms: prop?.bedrooms != null ? String(prop.bedrooms) : '',
    bathrooms: prop?.bathrooms != null ? String(prop.bathrooms) : '',
    pet_friendly: prop?.pet_friendly || false,
    notes: prop?.notes || '',
    status: prop?.status || 'considering',
  })

  const existingPhotos = prop?.photos ? JSON.parse(prop.photos).map(fn => ({ filename: fn, preview: null, isNew: false })) : []
  const [photos, setPhotos] = useState(existingPhotos)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const addPhotos = (files) => {
    const newPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f), isNew: true }))
    setPhotos(prev => [...prev, ...newPhotos])
  }

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const p = prev[idx]
      if (p.preview && p.isNew) URL.revokeObjectURL(p.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Property name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      if (form.address) fd.append('address', form.address)
      if (form.rent !== '') fd.append('rent', form.rent)
      if (form.utilities_estimate !== '') fd.append('utilities_estimate', form.utilities_estimate)
      if (form.commute_time_minutes !== '') fd.append('commute_time_minutes', form.commute_time_minutes)
      if (form.bedrooms !== '') fd.append('bedrooms', form.bedrooms)
      if (form.bathrooms !== '') fd.append('bathrooms', form.bathrooms)
      fd.append('pet_friendly', form.pet_friendly ? 'true' : 'false')
      if (form.notes) fd.append('notes', form.notes)

      if (prop) {
        fd.append('prop_status', form.status)
        const toRemove = existingPhotos.filter(ep => !photos.find(p => p.filename === ep.filename)).map(p => p.filename)
        if (toRemove.length) fd.append('remove_photos', JSON.stringify(toRemove))
      } else {
        fd.append('status', form.status)
      }

      photos.filter(p => p.isNew).forEach(p => fd.append('photos', p.file))

      const res = prop
        ? await api.patch(`/housing/properties/${prop.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        : await api.post('/housing/properties', fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      onSaved(res.data, !!prop)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save property.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hvi-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hvi-modal card" style={{ maxWidth: 640 }}>
        <div className="hvi-modal-header">
          <h2 className="card-title">{prop ? 'Edit Property' : 'Add Property'}</h2>
          <CloseBtn onClick={onClose} />
        </div>
        <form className="hvi-modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <div className="form-group">
            <label>Property Name *</label>
            <input value={form.name} onChange={set('name')} placeholder="e.g. Oak View Apartments – Unit 3B" autoFocus />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={form.address} onChange={set('address')} placeholder="123 Main St, Anytown, NC 28310" />
          </div>
          <div className="hvi-form-grid">
            <div className="form-group">
              <label>Monthly Rent ($)</label>
              <input type="number" min="0" value={form.rent} onChange={set('rent')} placeholder="e.g. 1800" />
            </div>
            <div className="form-group">
              <label>Est. Utilities/mo ($)</label>
              <input type="number" min="0" value={form.utilities_estimate} onChange={set('utilities_estimate')} placeholder="e.g. 150" />
            </div>
          </div>
          <div className="hvi-form-grid">
            <div className="form-group">
              <label>Commute Time (min)</label>
              <input type="number" min="0" value={form.commute_time_minutes} onChange={set('commute_time_minutes')} placeholder="e.g. 25" />
            </div>
            <div className="form-group">
              <label>Bedrooms</label>
              <input type="number" min="0" value={form.bedrooms} onChange={set('bedrooms')} placeholder="e.g. 3" />
            </div>
            <div className="form-group">
              <label>Bathrooms</label>
              <input type="number" min="0" step="0.5" value={form.bathrooms} onChange={set('bathrooms')} placeholder="e.g. 2" />
            </div>
          </div>
          <div className="hvi-form-grid">
            <div className="form-group">
              <label>Status</label>
              <select className="cl-add-select" style={{ width: '100%', padding: '9px 12px' }} value={form.status} onChange={set('status')}>
                {Object.entries(PROPERTY_STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input
                id="pet_friendly"
                type="checkbox"
                checked={form.pet_friendly}
                onChange={e => setForm(f => ({ ...f, pet_friendly: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="pet_friendly" style={{ marginBottom: 0, cursor: 'pointer' }}>Pet Friendly</label>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} placeholder="Pros, cons, landlord info…" style={{ resize: 'vertical', minHeight: 72 }} />
          </div>
          <PhotoUploadZone photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
          <div className="hvi-modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : prop ? 'Save Changes' : 'Add Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PropertyCard({ prop, onEdit, onDelete }) {
  const st = PROPERTY_STATUSES[prop.status] || PROPERTY_STATUSES.considering
  const photos = prop.photos ? JSON.parse(prop.photos) : []
  const total = (prop.rent || 0) + (prop.utilities_estimate || 0)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {photos.length > 0 ? (
        <div style={{ position: 'relative', height: 160, overflow: 'hidden', background: 'var(--color-bg-subtle)' }}>
          <img
            src={`/uploads/${photos[0]}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {photos.length > 1 && (
            <div style={{
              position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,.55)',
              color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: 12,
            }}>
              +{photos.length - 1} more
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
      )}
      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>{prop.name}</div>
          <span className="doc-badge" style={{ color: st.color, background: st.bg, flexShrink: 0 }}>{st.label}</span>
        </div>
        {prop.address && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{prop.address}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13, marginTop: 4 }}>
          <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>RENT</span><br /><strong>{fmt(prop.rent)}/mo</strong></div>
          <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>UTILITIES</span><br /><strong>{fmt(prop.utilities_estimate)}/mo</strong></div>
          <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>TOTAL/MO</span><br /><strong style={{ color: 'var(--color-primary)' }}>{total > 0 ? fmt(total) : '—'}</strong></div>
          <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>COMMUTE</span><br /><strong>{fmtMo(prop.commute_time_minutes)}</strong></div>
          {prop.bedrooms != null && <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>BEDS</span><br /><strong>{prop.bedrooms}</strong></div>}
          {prop.bathrooms != null && <div><span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>BATHS</span><br /><strong>{prop.bathrooms}</strong></div>}
        </div>
        {prop.pet_friendly && (
          <div style={{ fontSize: 12, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Pet Friendly
          </div>
        )}
        {prop.notes && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 2 }}>
            {prop.notes}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '6px 0' }} onClick={() => onEdit(prop)}>Edit</button>
          <button className="hvi-action-btn hvi-action-btn--danger" onClick={() => onDelete(prop.id)} title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function ComparisonsTab() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetch = useCallback(async () => {
    try {
      const res = await api.get('/housing/properties')
      setProperties(res.data)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const onSaved = (prop, isEdit) => {
    if (isEdit) setProperties(prev => prev.map(p => p.id === prop.id ? prop : p))
    else setProperties(prev => [prop, ...prev])
  }

  const onDelete = async (id) => {
    if (!confirm('Delete this property? This cannot be undone.')) return
    setProperties(prev => prev.filter(p => p.id !== id))
    try { await api.delete(`/housing/properties/${id}`) } catch { fetch() }
  }

  const closeModal = () => { setShowModal(false); setEditing(null) }

  const counts = {}
  properties.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1 })
  const filtered = statusFilter === 'all' ? properties : properties.filter(p => p.status === statusFilter)

  return (
    <div>
      <div className="cl-toolbar">
        <div className="cl-tabs">
          <button className={`cl-tab${statusFilter === 'all' ? ' cl-tab--active' : ''}`} onClick={() => setStatusFilter('all')}>
            All <span className="cl-tab-count">{properties.length}</span>
          </button>
          {Object.entries(PROPERTY_STATUSES).map(([k, v]) => {
            const c = counts[k] || 0
            if (c === 0 && statusFilter !== k) return null
            return (
              <button key={k} className={`cl-tab${statusFilter === k ? ' cl-tab--active' : ''}`} onClick={() => setStatusFilter(k)}>
                {v.label}{c > 0 && <span className="cl-tab-count">{c}</span>}
              </button>
            )
          })}
        </div>
        <button className="btn btn-primary cl-add-btn" onClick={() => { setEditing(null); setShowModal(true) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Property
        </button>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state">Loading…</div></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="coming-soon coming-soon--inline">
            <div className="coming-soon-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h2>{statusFilter === 'all' ? 'No properties added yet' : `No ${PROPERTY_STATUSES[statusFilter]?.label} properties`}</h2>
            <p>Compare off-base properties side-by-side with rent, utilities, commute, and photos.</p>
            {statusFilter === 'all' && <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add First Property</button>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(prop => (
            <PropertyCard key={prop.id} prop={prop} onEdit={p => { setEditing(p); setShowModal(true) }} onDelete={onDelete} />
          ))}
        </div>
      )}

      {showModal && (
        <PropertyModal prop={editing} onClose={closeModal} onSaved={onSaved} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ALLOWANCE CALCULATOR TAB
// ══════════════════════════════════════════════════════════════════════════════

function AllowanceTab({ properties }) {
  const [mode, setMode] = useState('BAH')
  const [grade, setGrade] = useState('E-5')
  const [withDeps, setWithDeps] = useState(true)
  const [useCustomRate, setUseCustomRate] = useState(false)
  const [customRate, setCustomRate] = useState('')

  // BAH fields
  const [rent, setRent] = useState('')

  // OHA fields
  const [ohaLocation, setOhaLocation] = useState('')
  const [ohaRate, setOhaRate] = useState('')
  const [utilityAllowance, setUtilityAllowance] = useState('')
  const [miha, setMiha] = useState('')
  const [ohaRent, setOhaRent] = useState('')

  const lookup = BAH_RATES[grade] || [0, 0]
  const referenceRate = lookup[withDeps ? 1 : 0]
  const effectiveRate = useCustomRate && customRate !== '' ? Number(customRate) : referenceRate

  const bahRent = rent !== '' ? Number(rent) : null
  const bahSurplus = bahRent != null ? effectiveRate - bahRent : null
  const bahPct = bahRent != null && effectiveRate > 0 ? Math.round((bahRent / effectiveRate) * 100) : null

  const ohaMonthly = (ohaRate !== '' ? Number(ohaRate) : 0) + (utilityAllowance !== '' ? Number(utilityAllowance) : 0)
  const ohaActualRent = ohaRent !== '' ? Number(ohaRent) : null
  const ohaSurplus = ohaActualRent != null ? ohaMonthly - ohaActualRent : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      {/* Input panel */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 16 }}>Calculator Inputs</h3>

        {/* BAH / OHA toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['BAH', 'OHA'].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid',
                borderColor: mode === m ? 'var(--color-primary)' : 'var(--color-border)',
                background: mode === m ? 'var(--color-primary)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--color-text)',
                fontWeight: 600, cursor: 'pointer', fontSize: 14, transition: 'all .15s',
              }}
            >
              {m === 'BAH' ? 'BAH (CONUS)' : 'OHA (OCONUS)'}
            </button>
          ))}
        </div>

        <div className="hvi-form-grid">
          <div className="form-group">
            <label>Pay Grade</label>
            <select className="cl-add-select" style={{ width: '100%', padding: '9px 12px' }} value={grade} onChange={e => setGrade(e.target.value)}>
              {PAY_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Dependency Status</label>
            <select className="cl-add-select" style={{ width: '100%', padding: '9px 12px' }} value={withDeps ? 'with' : 'without'} onChange={e => setWithDeps(e.target.value === 'with')}>
              <option value="with">With Dependents</option>
              <option value="without">Without Dependents</option>
            </select>
          </div>
        </div>

        {mode === 'BAH' && (
          <>
            <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>National avg. reference rate</span>
                <strong>{fmt(referenceRate)}/mo</strong>
              </div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 4 }}>
                Estimate only — verify at <em>defensetravel.dod.mil</em> or MyPay for your MHA.
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={useCustomRate} onChange={e => setUseCustomRate(e.target.checked)} />
              Use my actual BAH rate
            </label>
            {useCustomRate && (
              <div className="form-group">
                <label>My BAH Rate ($/mo)</label>
                <input type="number" min="0" value={customRate} onChange={e => setCustomRate(e.target.value)} placeholder="Enter from MyPay" />
              </div>
            )}
            <div className="form-group">
              <label>Monthly Rent ($)</label>
              <input type="number" min="0" value={rent} onChange={e => setRent(e.target.value)} placeholder="Enter your rent to see surplus/deficit" />
            </div>
          </>
        )}

        {mode === 'OHA' && (
          <>
            <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              OHA rates are location-specific. Look up your rate at <em>defensetravel.dod.mil/site/ohaCalc.cfm</em> and enter the values below.
            </div>
            <div className="form-group">
              <label>Duty Station / Location</label>
              <input value={ohaLocation} onChange={e => setOhaLocation(e.target.value)} placeholder="e.g. RAF Lakenheath, UK" />
            </div>
            <div className="hvi-form-grid">
              <div className="form-group">
                <label>OHA Rate ($/mo)</label>
                <input type="number" min="0" value={ohaRate} onChange={e => setOhaRate(e.target.value)} placeholder="From OHA table" />
              </div>
              <div className="form-group">
                <label>Utility Allowance ($/mo)</label>
                <input type="number" min="0" value={utilityAllowance} onChange={e => setUtilityAllowance(e.target.value)} placeholder="UA from OHA table" />
              </div>
            </div>
            <div className="hvi-form-grid">
              <div className="form-group">
                <label>MIHA (one-time, $)</label>
                <input type="number" min="0" value={miha} onChange={e => setMiha(e.target.value)} placeholder="Move-In Housing Allowance" />
              </div>
              <div className="form-group">
                <label>Actual Rent ($/mo)</label>
                <input type="number" min="0" value={ohaRent} onChange={e => setOhaRent(e.target.value)} placeholder="Enter your rent" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Results panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>
            {mode === 'BAH' ? 'BAH Summary' : `OHA Summary${ohaLocation ? ` — ${ohaLocation}` : ''}`}
          </h3>

          {mode === 'BAH' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ResultRow label="Effective BAH Rate" value={fmt(effectiveRate) + '/mo'} primary />
              {bahRent != null && (
                <>
                  <ResultRow label="Monthly Rent" value={fmt(bahRent) + '/mo'} />
                  <div style={{ height: 1, background: 'var(--color-border)' }} />
                  <ResultRow
                    label={bahSurplus >= 0 ? 'Monthly Surplus' : 'Monthly Shortfall'}
                    value={`${bahSurplus >= 0 ? '+' : ''}${fmt(Math.abs(bahSurplus))}/mo`}
                    color={bahSurplus >= 0 ? '#166534' : '#b91c1c'}
                    primary
                  />
                  {bahPct != null && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
                        <span>Rent as % of BAH</span>
                        <span>{bahPct}%</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--color-bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(bahPct, 100)}%`, background: bahPct > 100 ? '#b91c1c' : bahPct > 85 ? '#d97706' : '#166534', borderRadius: 4, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )}
                </>
              )}
              {bahRent == null && (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Enter your monthly rent above to see the surplus/deficit breakdown.</p>
              )}
            </div>
          )}

          {mode === 'OHA' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ResultRow label="OHA Rate" value={ohaRate !== '' ? fmt(Number(ohaRate)) + '/mo' : '—'} />
              <ResultRow label="Utility Allowance" value={utilityAllowance !== '' ? fmt(Number(utilityAllowance)) + '/mo' : '—'} />
              <div style={{ height: 1, background: 'var(--color-border)' }} />
              <ResultRow label="Total Monthly Housing Budget" value={ohaMonthly > 0 ? fmt(ohaMonthly) + '/mo' : '—'} primary />
              {miha !== '' && <ResultRow label="MIHA (one-time)" value={fmt(Number(miha))} color="#92400e" />}
              {ohaActualRent != null && ohaMonthly > 0 && (
                <>
                  <ResultRow label="Actual Rent" value={fmt(ohaActualRent) + '/mo'} />
                  <div style={{ height: 1, background: 'var(--color-border)' }} />
                  <ResultRow
                    label={ohaSurplus >= 0 ? 'Monthly Surplus' : 'Monthly Shortfall'}
                    value={`${ohaSurplus >= 0 ? '+' : ''}${fmt(Math.abs(ohaSurplus))}/mo`}
                    color={ohaSurplus >= 0 ? '#166534' : '#b91c1c'}
                    primary
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Compare against saved properties */}
        {properties.length > 0 && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 12, fontSize: 14 }}>vs. Saved Properties</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {properties.filter(p => p.rent != null).slice(0, 6).map(p => {
                const budget = mode === 'BAH' ? effectiveRate : ohaMonthly
                const total = (p.rent || 0) + (mode === 'BAH' ? 0 : (p.utilities_estimate || 0))
                const diff = budget > 0 ? budget - total : null
                const st = PROPERTY_STATUSES[p.status] || PROPERTY_STATUSES.considering
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{fmt(p.rent)}/mo rent{p.utilities_estimate ? ` + ${fmt(p.utilities_estimate)} utils` : ''}</div>
                    </div>
                    <span className="doc-badge" style={{ color: st.color, background: st.bg, flexShrink: 0, fontSize: 11 }}>{st.label}</span>
                    {diff != null && budget > 0 && (
                      <span style={{ fontWeight: 700, fontSize: 13, color: diff >= 0 ? '#166534' : '#b91c1c', flexShrink: 0 }}>
                        {diff >= 0 ? '+' : ''}{fmt(diff)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultRow({ label, value, primary, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: primary ? 700 : 600, fontSize: primary ? 16 : 14, color: color || (primary ? 'var(--color-text)' : 'var(--color-text)') }}>
        {value}
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT PAGE
// ══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'waitlist',     label: 'Waitlist Tracking' },
  { id: 'comparisons', label: 'Housing Comparisons' },
  { id: 'allowance',   label: 'Allowance Calculator' },
]

export default function Housing() {
  const [tab, setTab] = useState('waitlist')
  const [properties, setProperties] = useState([])

  useEffect(() => {
    api.get('/housing/properties').then(r => setProperties(r.data)).catch(() => {})
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Housing</h1>
        <p className="page-subtitle">Manage waitlists, compare off-base properties, and calculate your housing allowance.</p>
      </div>

      <div className="cl-toolbar" style={{ marginBottom: 20 }}>
        <div className="cl-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`cl-tab${tab === t.id ? ' cl-tab--active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'waitlist' && <WaitlistTab />}
      {tab === 'comparisons' && <ComparisonsTab />}
      {tab === 'allowance' && <AllowanceTab properties={properties} />}
    </div>
  )
}
