import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import NavMenu from './NavMenu'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="app-shell">
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        <span />
        <span />
        <span />
      </button>

      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="sidebar-title">
            <span className="sidebar-title-main">PCS Tracker</span>
            <span className="sidebar-title-sub">Move Management</span>
          </div>
        </div>

        <NavMenu />

        <div className="sidebar-footer">
          {user?.picture && (
            <img src={user.picture} alt="avatar" className="user-avatar" referrerPolicy="no-referrer" />
          )}
          {!user?.picture && (
            <div className="user-avatar user-avatar--initials">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="user-info">
            <span className="user-name">{user?.name || 'Admin'}</span>
            <span className="user-role">{user?.is_admin ? 'Administrator' : 'Member'}</span>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-breadcrumb" id="page-title" />
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}
