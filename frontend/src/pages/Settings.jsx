import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

function UserManagement() {
  const [whitelist, setWhitelist] = useState([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const fetchWhitelist = useCallback(async () => {
    try {
      const res = await api.get('/admin/whitelist')
      setWhitelist(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchWhitelist() }, [fetchWhitelist])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    if (!newEmail.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    setAdding(true)
    try {
      const res = await api.post('/admin/whitelist', { email: newEmail.trim(), role: newRole })
      setWhitelist((prev) => [...prev, res.data])
      setNewEmail('')
      setNewRole('user')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add email.')
    } finally {
      setAdding(false)
    }
  }

  const handleRoleChange = async (entry, role) => {
    const prev = whitelist
    setWhitelist((list) => list.map((e) => e.id === entry.id ? { ...e, role } : e))
    try {
      await api.patch(`/admin/whitelist/${entry.id}`, { role })
    } catch {
      setWhitelist(prev)
    }
  }

  const handleRemove = async (entry) => {
    if (!window.confirm(`Remove ${entry.email} from the whitelist?`)) return
    setWhitelist((list) => list.filter((e) => e.id !== entry.id))
    try {
      await api.delete(`/admin/whitelist/${entry.id}`)
    } catch {
      fetchWhitelist()
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>

  return (
    <div>
      <table className="wl-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Added</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {whitelist.length === 0 && (
            <tr>
              <td colSpan={4} className="wl-empty">No users whitelisted yet.</td>
            </tr>
          )}
          {whitelist.map((entry) => (
            <tr key={entry.id}>
              <td className="wl-email">{entry.email}</td>
              <td>
                <select
                  className="wl-role-select"
                  value={entry.role}
                  onChange={(e) => handleRoleChange(entry, e.target.value)}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td className="wl-date">
                {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
              <td>
                <button className="wl-remove-btn" onClick={() => handleRemove(entry)} title="Remove">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
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

      <form className="wl-add-form" onSubmit={handleAdd}>
        <div className="wl-add-title">Add Google Account</div>
        {error && <div className="form-error" style={{ marginBottom: '10px' }}>{error}</div>}
        <div className="wl-add-row">
          <input
            type="email"
            placeholder="user@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className="wl-email-input"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="wl-role-select"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={adding}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Settings() {
  const { user, logout } = useAuth()

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Account and application preferences.</p>
      </div>

      <div className="settings-layout">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Account</h2>
          </div>
          <div className="settings-profile">
            {user?.picture ? (
              <img src={user.picture} alt="Profile" className="settings-avatar" referrerPolicy="no-referrer" />
            ) : (
              <div className="settings-avatar settings-avatar--initials">
                {(user?.name || user?.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="settings-profile-info">
              <div className="settings-field">
                <span className="settings-field-label">Name</span>
                <span className="settings-field-value">{user?.name || '—'}</span>
              </div>
              <div className="settings-field">
                <span className="settings-field-label">Email</span>
                <span className="settings-field-value">{user?.email}</span>
              </div>
              <div className="settings-field">
                <span className="settings-field-label">Role</span>
                <span className={`badge ${user?.is_admin ? 'badge--admin' : 'badge--member'}`}>
                  {user?.is_admin ? 'Administrator' : 'Member'}
                </span>
              </div>
              <div className="settings-field">
                <span className="settings-field-label">Auth Provider</span>
                <span className="settings-field-value" style={{ textTransform: 'capitalize' }}>
                  {user?.auth_provider}
                </span>
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-danger" onClick={logout}>Sign Out</button>
          </div>
        </div>

        {user?.is_admin && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Authorized Google Accounts</h2>
            </div>
            <div style={{ padding: '0 0 4px' }}>
              <UserManagement />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
