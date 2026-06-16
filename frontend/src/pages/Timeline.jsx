import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

const KEY_TYPES = ['pack_out', 'arrival', 'report_date']

const META = {
  pack_out: {
    label: 'Pack-Out',
    color: '#c07800',
    bg: 'rgba(192,120,0,.1)',
    border: 'rgba(192,120,0,.25)',
  },
  arrival: {
    label: 'Arrival',
    color: '#2d7a3a',
    bg: 'rgba(45,122,58,.1)',
    border: 'rgba(45,122,58,.25)',
  },
  report_date: {
    label: 'Report Date',
    color: '#1e3a5f',
    bg: 'rgba(30,58,95,.1)',
    border: 'rgba(30,58,95,.25)',
  },
  flight_depart: {
    label: 'Departs',
    color: '#1565c0',
    bg: 'rgba(21,101,192,.08)',
    border: 'rgba(21,101,192,.2)',
  },
  flight_arrive: {
    label: 'Lands',
    color: '#6a1b9a',
    bg: 'rgba(106,27,154,.08)',
    border: 'rgba(106,27,154,.2)',
  },
  checklist: {
    label: 'Task Due',
    color: '#5a6378',
    bg: 'rgba(90,99,120,.06)',
    border: 'var(--color-border)',
  },
  calendar: {
    label: 'Event',
    color: '#4285F4',
    bg: 'rgba(66,133,244,.08)',
    border: 'rgba(66,133,244,.2)',
  },
}

function detectType(title) {
  const t = title.toLowerCase()
  if (/pack[\s-]?out|pack.*day|load[\s-]?day|moving[\s-]?day/.test(t)) return 'pack_out'
  if (/\barriv(al|e|ed|ing)?\b/.test(t)) return 'arrival'
  if (/report\s*(date|for|to|duty|station)|pcs\s*complete|in[\s-]?process/.test(t)) return 'report_date'
  return 'checklist'
}

function daysUntil(d) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((target - today) / 86400000)
}

function fmtDateShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(d, hasTime) {
  if (hasTime) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  return fmtDateShort(d)
}

function buildMilestones(tasks, itineraries, gcalEvents) {
  const milestones = []
  const now = new Date()

  for (const t of tasks) {
    if (!t.due_date) continue
    const d = new Date(t.due_date)
    if (isNaN(d)) continue
    const type = detectType(t.title)
    milestones.push({
      id: `task-${t.id}`,
      title: t.title,
      date: d,
      hasTime: true,
      type,
      source: 'Checklist',
      sourcePath: '/tasks',
      is_completed: t.is_completed,
      detail: t.assigned_to_name ? `Assigned to ${t.assigned_to_name}` : null,
    })
  }

  for (const it of itineraries) {
    if (it.departure_time) {
      const d = new Date(it.departure_time)
      if (!isNaN(d)) {
        milestones.push({
          id: `flight-dep-${it.id}`,
          title: `Flight ${it.flight_number} Departs`,
          date: d,
          hasTime: true,
          type: 'flight_depart',
          source: 'Travel',
          sourcePath: '/travel',
          is_completed: d < now,
          detail: it.departure_airport && it.arrival_airport
            ? `${it.departure_airport} → ${it.arrival_airport}`
            : it.airline || null,
        })
      }
    }
    if (it.arrival_time) {
      const d = new Date(it.arrival_time)
      if (!isNaN(d)) {
        milestones.push({
          id: `flight-arr-${it.id}`,
          title: `Flight ${it.flight_number} Lands`,
          date: d,
          hasTime: true,
          type: 'flight_arrive',
          source: 'Travel',
          sourcePath: '/travel',
          is_completed: d < now,
          detail: it.arrival_airport || null,
        })
      }
    }
  }

  for (const ev of gcalEvents) {
    if (!ev.start) continue
    const d = new Date(ev.start)
    if (isNaN(d)) continue
    const type = detectType(ev.title)
    milestones.push({
      id: `gcal-${ev.id}`,
      title: ev.title,
      date: d,
      hasTime: !ev.all_day,
      type: type === 'checklist' ? 'calendar' : type,
      source: 'Google Calendar',
      sourcePath: '/calendar',
      is_completed: d < now,
      detail: null,
      html_link: ev.html_link || null,
    })
  }

  milestones.sort((a, b) => a.date - b.date)
  return milestones
}

function MilestoneIcon({ type }) {
  if (type === 'pack_out') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  )
  if (type === 'arrival') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
  if (type === 'report_date') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
  if (type === 'flight_depart' || type === 'flight_arrive') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
  if (type === 'calendar') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  )
}

function HeroCard({ type, milestone }) {
  const meta = META[type]
  if (!milestone) {
    return (
      <div className="tl-hero-card">
        <div className="tl-hero-icon" style={{ background: 'rgba(90,99,120,.08)', color: 'var(--color-text-muted)' }}>
          <MilestoneIcon type={type} />
        </div>
        <div className="tl-hero-body">
          <div className="tl-hero-label">{meta.label}</div>
          <div className="tl-hero-notset">Not set</div>
          <div className="tl-hero-hint">
            Add a checklist task matching this milestone name to populate this card.
          </div>
        </div>
      </div>
    )
  }
  const days = daysUntil(milestone.date)
  const isToday = days === 0
  const isPast = days < 0

  return (
    <div
      className="tl-hero-card tl-hero-card--set"
      style={{ borderColor: meta.border, background: meta.bg }}
    >
      <div className="tl-hero-icon" style={{ background: meta.color + '22', color: meta.color }}>
        <MilestoneIcon type={type} />
      </div>
      <div className="tl-hero-body">
        <div className="tl-hero-label" style={{ color: meta.color }}>{meta.label}</div>
        {isToday ? (
          <div className="tl-hero-today" style={{ color: meta.color }}>Today!</div>
        ) : (
          <div className="tl-hero-count">
            <span className="tl-hero-num" style={{ color: meta.color }}>{Math.abs(days)}</span>
            <span className="tl-hero-unit">{isPast ? 'days ago' : 'days away'}</span>
          </div>
        )}
        <div className="tl-hero-date">{fmtDateShort(milestone.date)}</div>
        {milestone.is_completed && (
          <div className="tl-hero-done">Completed</div>
        )}
      </div>
    </div>
  )
}

export default function Timeline() {
  const [tasks, setTasks] = useState([])
  const [itineraries, setItineraries] = useState([])
  const [gcalEvents, setGcalEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [tasksRes, itinRes, gcalRes] = await Promise.allSettled([
        api.get('/checklist/'),
        api.get('/travel/itineraries'),
        api.get('/calendar/google-events'),
      ])
      if (tasksRes.status === 'fulfilled') setTasks(tasksRes.value.data)
      if (itinRes.status === 'fulfilled') setItineraries(itinRes.value.data)
      if (gcalRes.status === 'fulfilled') setGcalEvents(gcalRes.value.data.events || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const milestones = buildMilestones(tasks, itineraries, gcalEvents)

  const keyMilestones = {}
  for (const type of KEY_TYPES) {
    const upcoming = milestones.find(m => m.type === type && daysUntil(m.date) >= 0)
    const mostRecent = [...milestones].filter(m => m.type === type).pop()
    keyMilestones[type] = upcoming || mostRecent || null
  }

  const displayItems = []
  let todayInserted = false
  const now = new Date()
  for (const m of milestones) {
    const isPast = daysUntil(m.date) < 0
    if (!todayInserted && !isPast) {
      todayInserted = true
      displayItems.push({ kind: 'today' })
    }
    displayItems.push({ kind: 'milestone', data: m })
  }
  if (!todayInserted) {
    displayItems.push({ kind: 'today' })
  }

  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Timeline</h1>
        </div>
        <div className="card"><div className="empty-state">Loading milestones…</div></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Timeline</h1>
        <p className="page-subtitle">Key dates unified from your Checklist, Travel itineraries, and Google Calendar.</p>
      </div>

      <div className="tl-hero">
        {KEY_TYPES.map(type => (
          <HeroCard key={type} type={type} milestone={keyMilestones[type]} />
        ))}
      </div>

      {milestones.length === 0 ? (
        <div className="card">
          <div className="coming-soon coming-soon--inline">
            <div className="coming-soon-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2>No milestones yet</h2>
            <p>
              Add tasks with due dates in{' '}
              <Link to="/tasks" style={{ color: 'var(--color-primary)' }}>Checklist</Link>,
              save flights in{' '}
              <Link to="/travel" style={{ color: 'var(--color-primary)' }}>Travel</Link>,
              or connect Google Calendar to populate your timeline.
            </p>
          </div>
        </div>
      ) : (
        <div className="card tl-card">
          <div className="tl-track">
            {displayItems.map((item, idx) => {
              if (item.kind === 'today') {
                return (
                  <div key="today-marker" className="tl-today-row">
                    <div className="tl-dot-col">
                      <div className="tl-today-node" />
                    </div>
                    <div className="tl-today-content">
                      <span className="tl-today-pill">Today</span>
                      <div className="tl-today-dash" />
                      <span className="tl-today-date">{todayStr}</span>
                    </div>
                  </div>
                )
              }

              const m = item.data
              const days = daysUntil(m.date)
              const isPast = days < 0
              const isToday = days === 0
              const meta = META[m.type] || META.checklist
              const isKey = KEY_TYPES.includes(m.type)

              return (
                <div
                  key={m.id}
                  className={[
                    'tl-item',
                    isPast ? 'tl-item--past' : '',
                    isKey && !isPast ? 'tl-item--key' : '',
                    isToday ? 'tl-item--today' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="tl-dot-col">
                    <div
                      className="tl-dot"
                      style={{
                        width: isKey ? 14 : 10,
                        height: isKey ? 14 : 10,
                        background: isPast ? 'var(--color-border)' : meta.color,
                        boxShadow: isKey && !isPast ? `0 0 0 4px ${meta.color}22` : 'none',
                      }}
                    />
                  </div>

                  <div className="tl-content">
                    <div className="tl-content-header">
                      <div className="tl-content-left">
                        <span
                          className="tl-type-badge"
                          style={{
                            background: isPast ? 'var(--color-bg)' : meta.bg,
                            color: isPast ? 'var(--color-text-muted)' : meta.color,
                            border: `1px solid ${isPast ? 'var(--color-border)' : meta.border}`,
                          }}
                        >
                          {meta.label}
                        </span>
                        <span className="tl-source-label">{m.source}</span>
                      </div>
                      <span className="tl-date-str" style={{ color: isToday ? meta.color : undefined, fontWeight: isToday ? 700 : undefined }}>
                        {isToday ? 'Today' : fmtDateTime(m.date, m.hasTime)}
                      </span>
                    </div>

                    <div
                      className="tl-title"
                      style={{
                        color: isPast ? 'var(--color-text-muted)' : 'var(--color-text)',
                        textDecoration: m.is_completed ? 'line-through' : 'none',
                      }}
                    >
                      {m.html_link ? (
                        <a href={m.html_link} target="_blank" rel="noopener noreferrer">{m.title}</a>
                      ) : m.title}
                    </div>

                    <div className="tl-meta-row">
                      {m.detail && <span className="tl-detail">{m.detail}</span>}
                      {!isPast && days > 0 && (
                        <span className="tl-countdown" style={{ color: meta.color }}>
                          {days === 1 ? 'Tomorrow' : `In ${days} days`}
                        </span>
                      )}
                      {isPast && (
                        <span className="tl-past-label">
                          {Math.abs(days) === 1 ? 'Yesterday' : `${Math.abs(days)} days ago`}
                        </span>
                      )}
                      {m.is_completed && <span className="tl-done-badge">Done</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="tl-footer">
            <span>
              {milestones.length} milestone{milestones.length !== 1 ? 's' : ''} from{' '}
              {[
                tasks.some(t => t.due_date) && 'Checklist',
                itineraries.length > 0 && 'Travel',
                gcalEvents.length > 0 && 'Google Calendar',
              ].filter(Boolean).join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
