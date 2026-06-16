import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CATEGORY_COLORS = {
  medical: '#2d7a3a',
  passports: '#1565c0',
  housing: '#c07800',
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function Calendar() {
  const today = new Date()
  const [searchParams, setSearchParams] = useSearchParams()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)
  const [tasks, setTasks] = useState([])
  const [gcalEvents, setGcalEvents] = useState([])
  const [gcalConnected, setGcalConnected] = useState(null)
  const [gcalError, setGcalError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [tasksRes, gcalRes] = await Promise.allSettled([
        api.get('/calendar/tasks'),
        api.get('/calendar/google-events'),
      ])
      if (tasksRes.status === 'fulfilled') setTasks(tasksRes.value.data)
      if (gcalRes.status === 'fulfilled') {
        const g = gcalRes.value.data
        setGcalEvents(g.events || [])
        setGcalConnected(g.connected)
        setGcalError(g.error || null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (searchParams.get('gcal_connected') || searchParams.get('gcal_error')) {
      setSearchParams({}, { replace: true })
    }
  }, [])

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await api.post('/calendar/disconnect')
      setGcalConnected(false)
      setGcalEvents([])
      setGcalError(null)
    } finally {
      setDisconnecting(false)
    }
  }

  const prevMonth = () => {
    setSelectedDay(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    setSelectedDay(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const goToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDay(today.getDate())
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const getEventsForDay = (day) => {
    const date = new Date(year, month, day)
    const taskItems = tasks
      .filter(t => t.due_date && isSameDay(new Date(t.due_date), date))
      .map(t => ({ type: 'task', title: t.title, category: t.category, id: t.id, is_completed: t.is_completed, time: t.due_date }))

    const calItems = gcalEvents
      .filter(e => {
        if (!e.start) return false
        const start = new Date(e.start)
        return !isNaN(start) && isSameDay(start, date)
      })
      .map(e => ({ type: 'gcal', title: e.title, id: e.id, html_link: e.html_link, all_day: e.all_day, time: e.start }))

    return [...taskItems, ...calItems]
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : []

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Calendar</h1>
        </div>
        <div className="card"><div className="empty-state">Loading…</div></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Calendar</h1>
        <p className="page-subtitle">Task due dates and Google Calendar events in one view.</p>
      </div>

      {gcalConnected === false && (
        <div className="cal-connect-card card">
          <div className="cal-connect-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="cal-connect-body">
            <h3 className="cal-connect-title">Connect Google Calendar</h3>
            <p className="cal-connect-desc">
              View your Google Calendar events alongside task due dates. Requires a Google account and calendar read permission.
            </p>
            {gcalError && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 4 }}>{gcalError}</p>}
          </div>
          <a href="/api/calendar/connect" className="btn btn-primary cal-connect-btn">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="rgba(255,255,255,.8)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="rgba(255,255,255,.7)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="rgba(255,255,255,.9)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connect with Google
          </a>
        </div>
      )}

      {gcalConnected === true && (
        <div className="cal-connected-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ color: 'var(--color-success)' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Google Calendar connected</span>
          <button className="cal-disconnect-btn" onClick={disconnect} disabled={disconnecting}>
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      )}

      <div className="cal-layout">
        <div className="cal-main card">
          <div className="cal-header">
            <button className="cal-nav-btn" onClick={prevMonth} aria-label="Previous month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="cal-header-center">
              <h2 className="cal-month-title">{MONTHS[month]} {year}</h2>
              <button className="cal-today-btn" onClick={goToday}>Today</button>
            </div>
            <button className="cal-nav-btn" onClick={nextMonth} aria-label="Next month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="cal-grid">
            {DAYS.map(d => (
              <div key={d} className="cal-day-name">{d}</div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="cal-cell cal-cell--empty" />
              const events = getEventsForDay(day)
              const isToday = isSameDay(new Date(year, month, day), today)
              const isSelected = selectedDay === day
              return (
                <div
                  key={day}
                  className={[
                    'cal-cell',
                    isToday ? 'cal-cell--today' : '',
                    isSelected ? 'cal-cell--selected' : '',
                    events.length > 0 ? 'cal-cell--has-events' : '',
                  ].join(' ').trim()}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelectedDay(isSelected ? null : day)}
                >
                  <span className="cal-day-num">{day}</span>
                  {events.length > 0 && (
                    <div className="cal-dots">
                      {events.slice(0, 3).map((ev, idx) => (
                        <span
                          key={idx}
                          className="cal-dot"
                          style={{ background: ev.type === 'task' ? (CATEGORY_COLORS[ev.category] || '#888') : '#4285F4' }}
                        />
                      ))}
                      {events.length > 3 && <span className="cal-dot-more">+{events.length - 3}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="cal-sidebar">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {selectedDay ? `${MONTHS[month]} ${selectedDay}, ${year}` : 'Select a day'}
              </h3>
            </div>
            {selectedDay ? (
              selectedEvents.length === 0 ? (
                <div className="empty-state">No events on this day.</div>
              ) : (
                <ul className="cal-event-list">
                  {selectedEvents.map((ev, idx) => (
                    <li key={idx} className={`cal-event cal-event--${ev.type}`}>
                      <div
                        className="cal-event-stripe"
                        style={{ background: ev.type === 'task' ? (CATEGORY_COLORS[ev.category] || '#888') : '#4285F4' }}
                      />
                      <div className="cal-event-body">
                        <div className="cal-event-label">
                          {ev.type === 'task' ? ev.category : 'Google Calendar'}
                        </div>
                        <div className="cal-event-title">
                          {ev.html_link ? (
                            <a href={ev.html_link} target="_blank" rel="noopener noreferrer">{ev.title}</a>
                          ) : (
                            <span style={{ textDecoration: ev.is_completed ? 'line-through' : 'none', color: ev.is_completed ? 'var(--color-text-muted)' : 'inherit' }}>
                              {ev.title}
                            </span>
                          )}
                        </div>
                        {ev.time && !ev.all_day && (
                          <div className="cal-event-time">{fmtTime(ev.time)}</div>
                        )}
                        {ev.all_day && <div className="cal-event-time">All day</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="empty-state">Click a day to see events.</div>
            )}
          </div>

          <div className="card" style={{ marginTop: '12px' }}>
            <div className="card-header">
              <h3 className="card-title">Legend</h3>
            </div>
            <div className="cal-legend">
              {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                <div key={cat} className="cal-legend-item">
                  <span className="cal-dot" style={{ background: color }} />
                  <span style={{ textTransform: 'capitalize' }}>{cat} task</span>
                </div>
              ))}
              <div className="cal-legend-item">
                <span className="cal-dot" style={{ background: '#4285F4' }} />
                <span>Google Calendar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
