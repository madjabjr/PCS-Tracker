import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const STATUS_STYLES = {
  scheduled: { bg: '#e3f2fd', color: '#1565c0' },
  active:    { bg: '#e8f5e9', color: '#2d7a3a' },
  landed:    { bg: '#f3e5f5', color: '#6a1b9a' },
  cancelled: { bg: '#fce4ec', color: '#b42c2c' },
  diverted:  { bg: '#fff3e0', color: '#c07800' },
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

function DelayBadge({ delay }) {
  if (!delay) return null
  return (
    <span style={{ fontSize: 11, color: '#b42c2c', marginLeft: 4 }}>+{delay}m</span>
  )
}

function FlightCard({ flight, onSave, saving }) {
  const [notes, setNotes] = useState('')
  const status = flight.status || 'unknown'
  const ss = STATUS_STYLES[status] || { bg: '#f0f2f5', color: '#5a6378' }

  return (
    <div className="card tv-flight-card">
      <div className="tv-flight-header">
        <div className="tv-flight-id">
          <span className="tv-flight-num">{flight.flight_iata}</span>
          {flight.airline_name && <span className="tv-airline">{flight.airline_name}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {flight.flight_date && (
            <span className="tv-flight-date">{flight.flight_date}</span>
          )}
          <span className="badge" style={{ background: ss.bg, color: ss.color }}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
      </div>

      <div className="tv-route">
        <div className="tv-airport">
          <div className="tv-airport-iata">{flight.departure.iata || '—'}</div>
          <div className="tv-airport-name">{flight.departure.airport || ''}</div>
          <div className="tv-time-row">
            <span className="tv-time">Sched: {fmtTime(flight.departure.scheduled)}</span>
            <DelayBadge delay={flight.departure.delay} />
          </div>
          {flight.departure.estimated && flight.departure.estimated !== flight.departure.scheduled && (
            <div className="tv-time">Est: {fmtTime(flight.departure.estimated)}</div>
          )}
          {flight.departure.actual && (
            <div className="tv-time tv-time--actual">Actual: {fmtTime(flight.departure.actual)}</div>
          )}
          {(flight.departure.terminal || flight.departure.gate) && (
            <div className="tv-gate">
              {flight.departure.terminal ? `Terminal ${flight.departure.terminal}` : ''}
              {flight.departure.gate ? ` · Gate ${flight.departure.gate}` : ''}
            </div>
          )}
        </div>

        <div className="tv-route-arrow">
          <svg viewBox="0 0 48 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="12" x2="38" y2="12" />
            <polyline points="30 5 38 12 30 19" />
            <path d="M10 6 L14 10 L10 14" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="tv-airport tv-airport--right">
          <div className="tv-airport-iata">{flight.arrival.iata || '—'}</div>
          <div className="tv-airport-name">{flight.arrival.airport || ''}</div>
          <div className="tv-time-row">
            <span className="tv-time">Sched: {fmtTime(flight.arrival.scheduled)}</span>
            <DelayBadge delay={flight.arrival.delay} />
          </div>
          {flight.arrival.estimated && flight.arrival.estimated !== flight.arrival.scheduled && (
            <div className="tv-time">Est: {fmtTime(flight.arrival.estimated)}</div>
          )}
          {flight.arrival.actual && (
            <div className="tv-time tv-time--actual">Actual: {fmtTime(flight.arrival.actual)}</div>
          )}
          {(flight.arrival.terminal || flight.arrival.gate) && (
            <div className="tv-gate">
              {flight.arrival.terminal ? `Terminal ${flight.arrival.terminal}` : ''}
              {flight.arrival.gate ? ` · Gate ${flight.arrival.gate}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="tv-save-row">
        <input
          type="text"
          className="tv-notes-input"
          placeholder="Add a note (optional)…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={() => onSave(flight, notes)}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save to Itinerary'}
        </button>
      </div>
    </div>
  )
}

export default function Travel() {
  const [tab, setTab] = useState('lookup')
  const [flightNumber, setFlightNumber] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [searchError, setSearchError] = useState(null)
  const [itineraries, setItineraries] = useState([])
  const [savingId, setSavingId] = useState(null)
  const [savedMsg, setSavedMsg] = useState(null)

  const fetchItineraries = useCallback(async () => {
    try {
      const res = await api.get('/travel/itineraries')
      setItineraries(res.data)
    } catch {
    }
  }, [])

  useEffect(() => { fetchItineraries() }, [fetchItineraries])

  const search = async (e) => {
    e.preventDefault()
    if (!flightNumber.trim()) return
    setSearching(true)
    setResults(null)
    setSearchError(null)
    try {
      const res = await api.get(`/travel/flight/${flightNumber.trim().toUpperCase()}`)
      setResults(res.data)
    } catch (err) {
      setSearchError(err.response?.data?.detail || 'Failed to fetch flight data.')
    } finally {
      setSearching(false)
    }
  }

  const saveItinerary = async (flight, notes) => {
    setSavingId(flight.flight_iata)
    try {
      await api.post('/travel/itineraries', {
        flight_number: flight.flight_iata,
        flight_date: flight.flight_date,
        departure_airport: flight.departure.airport || flight.departure.iata,
        arrival_airport: flight.arrival.airport || flight.arrival.iata,
        departure_time: flight.departure.scheduled,
        arrival_time: flight.arrival.scheduled,
        airline: flight.airline_name,
        notes,
      })
      await fetchItineraries()
      setSavedMsg(`${flight.flight_iata} saved to itineraries.`)
      setTimeout(() => setSavedMsg(null), 3000)
    } catch {
    } finally {
      setSavingId(null)
    }
  }

  const deleteItinerary = async (id) => {
    try {
      await api.delete(`/travel/itineraries/${id}`)
      setItineraries(prev => prev.filter(i => i.id !== id))
    } catch {
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Travel</h1>
        <p className="page-subtitle">Look up real-time flight data and manage your PCS travel itinerary.</p>
      </div>

      <div className="cl-toolbar" style={{ marginBottom: 20 }}>
        <div className="cl-tabs">
          <button
            className={`cl-tab${tab === 'lookup' ? ' cl-tab--active' : ''}`}
            onClick={() => setTab('lookup')}
          >
            Flight Lookup
          </button>
          <button
            className={`cl-tab${tab === 'itineraries' ? ' cl-tab--active' : ''}`}
            onClick={() => setTab('itineraries')}
          >
            My Itineraries
            {itineraries.length > 0 && (
              <span className="cl-tab-count">{itineraries.length}</span>
            )}
          </button>
        </div>
      </div>

      {tab === 'lookup' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h2 className="card-title">Search by Flight Number</h2>
            </div>
            <form className="tv-search-form" onSubmit={search}>
              <input
                type="text"
                className="tv-flight-input"
                placeholder="e.g. AA1234, UA456, DL789"
                value={flightNumber}
                onChange={e => setFlightNumber(e.target.value.toUpperCase())}
                autoFocus
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={searching || !flightNumber.trim()}
              >
                {searching ? (
                  <>
                    <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Searching…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    Search
                  </>
                )}
              </button>
            </form>
            <div style={{ padding: '0 20px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Powered by AviationStack. Requires <code>AVIATIONSTACK_API_KEY</code> in backend/.env.
            </div>
          </div>

          {savedMsg && (
            <div className="tv-saved-toast">{savedMsg}</div>
          )}

          {searchError && (
            <div className="form-error" style={{ marginBottom: 16 }}>{searchError}</div>
          )}

          {results && !results.found && (
            <div className="card">
              <div className="empty-state">
                No live flight data found for <strong>{flightNumber}</strong>. The flight may not be currently active or tracked.
              </div>
            </div>
          )}

          {results?.flights?.map((flight, idx) => (
            <FlightCard
              key={idx}
              flight={flight}
              onSave={saveItinerary}
              saving={savingId === flight.flight_iata}
            />
          ))}
        </>
      )}

      {tab === 'itineraries' && (
        <div className="tv-itineraries">
          {itineraries.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                No itineraries saved yet. Search for a flight and click "Save to Itinerary".
              </div>
            </div>
          ) : (
            itineraries.map(it => (
              <div key={it.id} className="card tv-itin-card">
                <div className="tv-itin-header">
                  <div>
                    <span className="tv-flight-num">{it.flight_number}</span>
                    {it.airline && <span className="tv-airline"> · {it.airline}</span>}
                    {it.flight_date && <span className="tv-flight-date" style={{ marginLeft: 8 }}>{it.flight_date}</span>}
                  </div>
                  <button
                    className="cl-delete-btn"
                    onClick={() => deleteItinerary(it.id)}
                    aria-label="Delete itinerary"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>

                <div className="tv-route">
                  <div className="tv-airport">
                    <div className="tv-airport-iata">{it.departure_airport || '—'}</div>
                    {it.departure_time && <div className="tv-time">{fmtTime(it.departure_time)}</div>}
                  </div>
                  <div className="tv-route-arrow">
                    <svg viewBox="0 0 48 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="2" y1="12" x2="38" y2="12" />
                      <polyline points="30 5 38 12 30 19" />
                    </svg>
                  </div>
                  <div className="tv-airport tv-airport--right">
                    <div className="tv-airport-iata">{it.arrival_airport || '—'}</div>
                    {it.arrival_time && <div className="tv-time">{fmtTime(it.arrival_time)}</div>}
                  </div>
                </div>

                {it.notes && (
                  <div className="tv-itin-notes">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {it.notes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
