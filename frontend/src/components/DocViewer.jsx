import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'

const INACTIVITY_MS = 60_000

function isPDF(doc) {
  return (doc.content_type || '').includes('pdf') ||
    (doc.original_filename || '').toLowerCase().endsWith('.pdf')
}
function isImage(doc) {
  return (doc.content_type || '').startsWith('image/')
}

// ── Security Gate ──────────────────────────────────────────────────────────
function GateScreen({ doc, onConfirm, onCancel, loadError }) {
  return (
    <div className="dv-gate">
      <div className="dv-gate-lock-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <div className="dv-gate-kicker">Sensitive Document</div>
      <h2 className="dv-gate-title">{doc.name}</h2>
      <p className="dv-gate-desc">
        This document is marked sensitive and stored encrypted at rest. Viewing it
        will temporarily decrypt the contents in browser memory only — nothing is
        written to disk, cache, or storage.
      </p>
      <ul className="dv-gate-checklist">
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12" /></svg>
          Ensure your surroundings are private before proceeding.
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12" /></svg>
          The viewer will automatically lock after 60&nbsp;seconds of inactivity.
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12" /></svg>
          Decrypted data exists only in browser memory — never persisted.
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12" /></svg>
          Right-click, print, and save shortcuts are disabled while the viewer is open.
        </li>
      </ul>
      {loadError && <div className="form-error dv-gate-error">{loadError}</div>}
      <div className="dv-gate-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary dv-gate-confirm-btn" onClick={onConfirm}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          I Understand — View Document
        </button>
      </div>
    </div>
  )
}

// ── Locked Screen ──────────────────────────────────────────────────────────
function LockedScreen({ isSensitive, onViewAgain, onClose }) {
  return (
    <div className="dv-locked">
      <div className="dv-locked-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <h2 className="dv-locked-title">Viewer Locked</h2>
      <p className="dv-locked-desc">
        The document was hidden after 60 seconds of inactivity.
        {isSensitive && ' The decrypted content has been cleared from memory.'}
      </p>
      <div className="dv-locked-actions">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={onViewAgain}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          View Again
        </button>
      </div>
    </div>
  )
}

// ── Unsupported Format ─────────────────────────────────────────────────────
function UnsupportedScreen({ doc, blobUrl, onClose }) {
  const download = () => {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = doc.original_filename
    a.click()
  }
  return (
    <div className="dv-unsupported">
      <div className="dv-unsupported-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <p className="dv-unsupported-text">In-browser preview is not available for this file type.</p>
      <p className="dv-unsupported-filename">{doc.original_filename}</p>
      <div className="dv-unsupported-actions">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={download}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download File
        </button>
      </div>
    </div>
  )
}

// ── Main Viewer ────────────────────────────────────────────────────────────
export default function DocViewer({ doc, onClose }) {
  const blobUrlRef = useRef(null)
  const iframeRef = useRef(null)

  // State machine: gate → loading → viewing → locked | error
  const [viewState, setViewState] = useState(doc.is_sensitive ? 'gate' : 'loading')
  const [blobUrl, setBlobUrl] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(60)

  const canRender = isPDF(doc) || isImage(doc)

  // ── Revoke blob URL helper ─────────────────────────────
  const revokeCurrent = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  // ── Unmount cleanup ────────────────────────────────────
  useEffect(() => () => revokeCurrent(), [revokeCurrent])

  // ── Anti-scraping: block right-click & hotkeys (sensitive only) ────
  useEffect(() => {
    if (!doc.is_sensitive) return
    const blockMenu = (e) => e.preventDefault()
    const blockHotkeys = (e) => {
      if ((e.ctrlKey || e.metaKey) && ['p', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('contextmenu', blockMenu, true)
    document.addEventListener('keydown', blockHotkeys, true)
    return () => {
      document.removeEventListener('contextmenu', blockMenu, true)
      document.removeEventListener('keydown', blockHotkeys, true)
    }
  }, [doc.is_sensitive])

  // ── Inactivity auto-lock (sensitive only) ─────────────
  useEffect(() => {
    if (!doc.is_sensitive || viewState !== 'viewing') return

    let lockTimer
    let countdownInterval

    const lock = () => {
      revokeCurrent()
      setBlobUrl(null)
      setViewState('locked')
    }

    const reset = () => {
      clearTimeout(lockTimer)
      clearInterval(countdownInterval)
      setSecondsLeft(60)
      lockTimer = setTimeout(lock, INACTIVITY_MS)
      countdownInterval = setInterval(() => {
        setSecondsLeft((s) => (s <= 1 ? (clearInterval(countdownInterval), 0) : s - 1))
      }, 1000)
    }

    reset()

    // Standard DOM activity events
    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }))

    // When focus moves into the PDF iframe, window fires blur.
    // If activeElement becomes our iframe, treat it as activity.
    const handleWindowBlur = () => {
      if (document.activeElement === iframeRef.current) reset()
    }
    window.addEventListener('blur', handleWindowBlur, true)

    return () => {
      clearTimeout(lockTimer)
      clearInterval(countdownInterval)
      EVENTS.forEach((ev) => window.removeEventListener(ev, reset))
      window.removeEventListener('blur', handleWindowBlur, true)
    }
  }, [doc.is_sensitive, viewState, revokeCurrent])

  // ── Fetch & decrypt ────────────────────────────────────
  const fetchDoc = useCallback(async () => {
    setViewState('loading')
    setLoadError('')
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: doc.content_type || 'application/octet-stream' })
      revokeCurrent()
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      setBlobUrl(url)
      setSecondsLeft(60)
      setViewState('viewing')
    } catch {
      setLoadError('Failed to load document. Please try again.')
      setViewState(doc.is_sensitive ? 'gate' : 'error')
    }
  }, [doc.id, doc.content_type, doc.is_sensitive, revokeCurrent])

  // Auto-load non-sensitive docs immediately
  useEffect(() => {
    if (!doc.is_sensitive) fetchDoc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClose = () => {
    revokeCurrent()
    onClose()
  }

  const handleViewAgain = () => {
    if (doc.is_sensitive) {
      setViewState('gate')
    } else {
      fetchDoc()
    }
  }

  const isFullscreen = viewState === 'viewing'

  return (
    <div className="dv-overlay" role="dialog" aria-modal="true" aria-label={`Document viewer: ${doc.name}`}>
      <div className={`dv-modal${isFullscreen ? ' dv-modal--full' : ''}`}>

        {/* ── Header (always visible) ─────────────────── */}
        <div className="dv-header">
          <div className="dv-header-icon">
            {doc.is_sensitive
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            }
          </div>
          <div className="dv-header-info">
            <div className="dv-header-name">{doc.name}</div>
            {doc.is_sensitive && viewState === 'viewing' && (
              <div className="dv-header-sub">Decrypted in memory — not cached</div>
            )}
          </div>

          {doc.is_sensitive && viewState === 'viewing' && (
            <div className={`dv-timer${secondsLeft <= 15 ? ' dv-timer--warn' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {secondsLeft}s
            </div>
          )}

          <button className="dv-close-btn" onClick={handleClose} aria-label="Close viewer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Body ────────────────────────────────────── */}
        <div className="dv-body">

          {/* Gate */}
          {viewState === 'gate' && (
            <GateScreen
              doc={doc}
              onConfirm={fetchDoc}
              onCancel={handleClose}
              loadError={loadError}
            />
          )}

          {/* Loading */}
          {viewState === 'loading' && (
            <div className="dv-loading">
              <div className="loading-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <p>{doc.is_sensitive ? 'Decrypting document…' : 'Loading document…'}</p>
            </div>
          )}

          {/* Error (non-sensitive only — sensitive errors go back to gate) */}
          {viewState === 'error' && (
            <div className="dv-error-screen">
              <p>Failed to load document.</p>
              <div className="dv-error-actions">
                <button className="btn btn-ghost" onClick={handleClose}>Close</button>
                <button className="btn btn-primary" onClick={fetchDoc}>Retry</button>
              </div>
            </div>
          )}

          {/* Locked */}
          {viewState === 'locked' && (
            <LockedScreen
              isSensitive={doc.is_sensitive}
              onViewAgain={handleViewAgain}
              onClose={handleClose}
            />
          )}

          {/* Viewing */}
          {viewState === 'viewing' && blobUrl && (
            <div
              className="dv-content"
              onContextMenu={(e) => e.preventDefault()}
            >
              {isPDF(doc) && (
                <iframe
                  ref={iframeRef}
                  src={blobUrl}
                  title={doc.name}
                  className="dv-iframe"
                />
              )}
              {isImage(doc) && (
                <div className="dv-image-wrap">
                  <img
                    src={blobUrl}
                    alt={doc.name}
                    className="dv-image"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                  />
                </div>
              )}
              {!canRender && (
                <UnsupportedScreen doc={doc} blobUrl={blobUrl} onClose={handleClose} />
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
