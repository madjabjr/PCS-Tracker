import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'

const EMPTY_FORM = { name: '', description: '', price: '', notes: '', serial_number: '' }

function ItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item ? {
    name: item.name,
    description: item.description || '',
    price: item.price != null ? String(item.price) : '',
    notes: item.notes || '',
    serial_number: item.serial_number || '',
  } : EMPTY_FORM)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(item?.image_filename ? `/uploads/${item.image_filename}` : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const handleImage = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      if (form.description) fd.append('description', form.description)
      if (form.price !== '') fd.append('price', form.price)
      if (form.notes) fd.append('notes', form.notes)
      if (form.serial_number) fd.append('serial_number', form.serial_number)
      if (imageFile) fd.append('image', imageFile)

      const res = item
        ? await api.patch(`/items/${item.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        : await api.post('/items/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      onSaved(res.data, !!item)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save item.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hvi-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hvi-modal card">
        <div className="hvi-modal-header">
          <h2 className="card-title">{item ? 'Edit Item' : 'Add High-Value Item'}</h2>
          <button className="hvi-close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className="hvi-modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="hvi-image-zone" onClick={() => fileRef.current?.click()}>
            {imagePreview
              ? <img src={imagePreview} alt="Preview" className="hvi-image-preview" />
              : (
                <div className="hvi-image-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Click to upload photo</span>
                </div>
              )
            }
            <input ref={fileRef} type="file" accept="image/*" className="hvi-file-input" onChange={handleImage} />
          </div>

          <div className="hvi-form-grid">
            <div className="form-group hvi-full">
              <label>Item Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. MacBook Pro 16-inch"
              />
            </div>
            <div className="form-group hvi-full">
              <label>Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
              />
            </div>
            <div className="form-group">
              <label>Estimated Value ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label>Serial Number</label>
              <input
                value={form.serial_number}
                onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                placeholder="SN / Model #"
              />
            </div>
            <div className="form-group hvi-full">
              <label>Notes</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Condition, purchase date, etc."
              />
            </div>
          </div>

          <div className="hvi-modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function HighValueItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalItem, setModalItem] = useState(undefined)
  const [showModal, setShowModal] = useState(false)

  const fetchItems = useCallback(async () => {
    try {
      const res = await api.get('/items/')
      setItems(res.data)
    } catch {
      // handled silently
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openAdd = () => { setModalItem(null); setShowModal(true) }
  const openEdit = (item) => { setModalItem(item); setShowModal(true) }
  const closeModal = () => setShowModal(false)

  const onSaved = (saved, isEdit) => {
    if (isEdit) {
      setItems(prev => prev.map(i => i.id === saved.id ? saved : i))
    } else {
      setItems(prev => [...prev, saved])
    }
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this item?')) return
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      await api.delete(`/items/${id}`)
    } catch {
      fetchItems()
    }
  }

  const totalValue = items.reduce((sum, i) => sum + (i.price || 0), 0)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">High-Value Items</h1>
        <p className="page-subtitle">Document items for your movers' inventory and insurance claims.</p>
      </div>

      <div className="hvi-summary-row">
        <div className="stat-card">
          <div className="stat-value">{items.length}</div>
          <div className="stat-label">Items Logged</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div className="stat-label">Estimated Total Value</div>
        </div>
        <button className="btn btn-primary hvi-add-main" onClick={openAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Item
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : items.length === 0 ? (
          <div className="coming-soon coming-soon--inline">
            <div className="coming-soon-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h2>No items logged yet</h2>
            <p>Add high-value items to document them for your movers' inventory and insurance.</p>
            <button className="btn btn-primary" onClick={openAdd}>Add First Item</button>
          </div>
        ) : (
          <div className="hvi-table-wrap">
            <table className="hvi-table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Value</th>
                  <th>Serial #</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="hvi-td-img">
                      {item.image_filename
                        ? <img src={`/uploads/${item.image_filename}`} alt={item.name} className="hvi-thumb" />
                        : <div className="hvi-thumb hvi-thumb--empty">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                      }
                    </td>
                    <td className="hvi-td-name">{item.name}</td>
                    <td className="hvi-td-text">{item.description || <span className="hvi-empty-cell">—</span>}</td>
                    <td className="hvi-td-price">
                      {item.price != null
                        ? `$${Number(item.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        : <span className="hvi-empty-cell">—</span>
                      }
                    </td>
                    <td className="hvi-td-mono">{item.serial_number || <span className="hvi-empty-cell">—</span>}</td>
                    <td className="hvi-td-text">{item.notes || <span className="hvi-empty-cell">—</span>}</td>
                    <td className="hvi-td-actions">
                      <button className="hvi-action-btn" onClick={() => openEdit(item)} aria-label="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button className="hvi-action-btn hvi-action-btn--danger" onClick={() => deleteItem(item.id)} aria-label="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ItemModal
          item={modalItem}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
