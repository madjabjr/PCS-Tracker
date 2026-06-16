import { useState } from 'react'

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function ConflictBadge({ conflicts }) {
  const [open, setOpen] = useState(false)

  if (!conflicts || conflicts.length === 0) return null

  return (
    <span
      className="conflict-badge"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
      title="Primary calendar conflicts"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {open && (
        <div className="conflict-popover" onClick={e => e.stopPropagation()}>
          <div className="conflict-popover-title">Primary calendar:</div>
          {conflicts.map((c, i) => (
            <div key={i} className="conflict-popover-item">
              <span className="conflict-popover-name">{c.title}</span>
              {!c.all_day && c.start && (
                <span className="conflict-popover-time">{fmtTime(c.start)}</span>
              )}
              {c.all_day && <span className="conflict-popover-time">All day</span>}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
