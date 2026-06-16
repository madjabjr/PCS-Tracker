import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'
import ConflictBadge from '../components/ConflictBadge'

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'medical', label: 'Medical' },
  { key: 'passports', label: 'Passports' },
  { key: 'housing', label: 'Housing' },
]

const CATEGORY_COLORS = {
  medical: { bg: '#e8f5e9', color: '#2d7a3a' },
  passports: { bg: '#e3f2fd', color: '#1565c0' },
  housing: { bg: '#fff3e0', color: '#c07800' },
}

export default function TaskManager() {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [primaryConflicts, setPrimaryConflicts] = useState({})
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('medical')
  const [newDueDate, setNewDueDate] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [savingNew, setSavingNew] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editDate, setEditDate] = useState('')
  const editInputRef = useRef(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/checklist/')
      setTasks(res.data)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchConflicts = useCallback((loadedTasks) => {
    const datedTasks = loadedTasks.filter(t => t.due_date)
    if (datedTasks.length === 0) return
    const dates = datedTasks.map(t => new Date(t.due_date)).filter(d => !isNaN(d))
    if (dates.length === 0) return
    const earliest = new Date(Math.min(...dates))
    const latest = new Date(Math.max(...dates))
    const timeMin = new Date(Date.UTC(earliest.getFullYear(), earliest.getMonth(), earliest.getDate())).toISOString()
    const timeMax = new Date(Date.UTC(latest.getFullYear(), latest.getMonth(), latest.getDate(), 23, 59, 59)).toISOString()
    api.get('/calendar/primary-conflicts', { params: { time_min: timeMin, time_max: timeMax } })
      .then(res => {
        if (!res.data.connected) return
        const map = {}
        for (const ev of res.data.events || []) {
          if (!ev.start) continue
          const key = ev.start.substring(0, 10)
          if (!map[key]) map[key] = []
          map[key].push(ev)
        }
        setPrimaryConflicts(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchTasks()
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [fetchTasks])

  // Fetch conflicts after tasks load
  useEffect(() => {
    if (!loading && tasks.length > 0) fetchConflicts(tasks)
  }, [loading, tasks, fetchConflicts])

  const toggle = async (task) => {
    const updated = { is_completed: !task.is_completed }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updated } : t))
    try {
      const res = await api.patch(`/checklist/${task.id}`, updated)
      setTasks(prev => prev.map(t => t.id === task.id ? res.data : t))
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }
  }

  const assign = async (task, email) => {
    const user = users.find(u => u.email === email)
    const body = {
      assigned_to_email: email || '',
      assigned_to_name: user?.name || email || '',
    }
    try {
      const res = await api.patch(`/checklist/${task.id}`, body)
      setTasks(prev => prev.map(t => t.id === task.id ? res.data : t))
    } catch {
      // ignore
    }
  }

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await api.delete(`/checklist/${id}`)
    } catch {
      fetchTasks()
    }
  }

  const toDateInputValue = (isoStr) => {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    if (isNaN(d)) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const startEdit = (task) => {
    setEditingId(task.id)
    setEditText(task.title)
    setEditDate(toDateInputValue(task.due_date))
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
    setEditDate('')
  }

  const saveEdit = async (task) => {
    const trimmed = editText.trim()
    if (!trimmed) { cancelEdit(); return }
    const newDueIso = editDate ? new Date(editDate).toISOString() : null
    const oldDueDate = toDateInputValue(task.due_date)
    const titleChanged = trimmed !== task.title
    const dateChanged = editDate !== oldDueDate
    if (!titleChanged && !dateChanged) { cancelEdit(); return }
    const patch = {}
    if (titleChanged) patch.title = trimmed
    if (dateChanged) patch.due_date = newDueIso
    const optimistic = { ...task, ...patch }
    setTasks(prev => prev.map(t => t.id === task.id ? optimistic : t))
    cancelEdit()
    try {
      const res = await api.patch(`/checklist/${task.id}`, patch)
      setTasks(prev => prev.map(t => t.id === task.id ? res.data : t))
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }
  }

  const addTask = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setSavingNew(true)
    try {
      const body = { title: newTitle.trim(), category: newCategory }
      if (newDueDate) body.due_date = new Date(newDueDate).toISOString()
      const res = await api.post('/checklist/', body)
      setTasks(prev => [...prev, res.data])
      setNewTitle('')
      setNewDueDate('')
      setAddingTask(false)
    } catch {
      // ignore
    } finally {
      setSavingNew(false)
    }
  }

  const visible = activeCategory === 'all'
    ? tasks
    : tasks.filter(t => t.category === activeCategory)

  const total = tasks.length
  const done = tasks.filter(t => t.is_completed).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const grouped = CATEGORIES.slice(1).reduce((acc, { key }) => {
    acc[key] = visible.filter(t => t.category === key)
    return acc
  }, {})

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">PCS Checklist</h1>
        <p className="page-subtitle">Track every action item for your move.</p>
      </div>

      <div className="cl-progress-card card">
        <div className="cl-progress-row">
          <span className="cl-progress-label">{done} of {total} tasks complete</span>
          <span className="cl-progress-pct">{pct}%</span>
        </div>
        <div className="cl-progress-bar">
          <div className="cl-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="cl-toolbar">
        <div className="cl-tabs">
          {CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              className={`cl-tab${activeCategory === key ? ' cl-tab--active' : ''}`}
              onClick={() => setActiveCategory(key)}
            >
              {label}
              {key !== 'all' && (
                <span className="cl-tab-count">
                  {tasks.filter(t => t.category === key && !t.is_completed).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <button className="btn btn-primary cl-add-btn" onClick={() => setAddingTask(v => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Task
        </button>
      </div>

      {addingTask && (
        <form className="cl-add-form card" onSubmit={addTask}>
          <input
            className="cl-add-input"
            placeholder="Task title…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            autoFocus
          />
          <select
            className="cl-add-select"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          >
            {CATEGORIES.slice(1).map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            type="date"
            className="cl-add-select"
            value={newDueDate}
            onChange={e => setNewDueDate(e.target.value)}
            title="Due date (optional)"
          />
          <button className="btn btn-primary" type="submit" disabled={savingNew || !newTitle.trim()}>
            Add
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setAddingTask(false)}>
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="card"><div className="empty-state">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="card"><div className="empty-state">No tasks in this category.</div></div>
      ) : (
        <div className="cl-sections">
          {(activeCategory === 'all' ? CATEGORIES.slice(1) : CATEGORIES.slice(1).filter(c => c.key === activeCategory)).map(({ key, label }) => {
            const group = grouped[key]
            if (!group || group.length === 0) return null
            return (
              <div key={key} className="cl-section card">
                <div className="cl-section-header">
                  <span
                    className="cl-category-badge"
                    style={{ background: CATEGORY_COLORS[key]?.bg, color: CATEGORY_COLORS[key]?.color }}
                  >
                    {label}
                  </span>
                  <span className="cl-section-count">
                    {group.filter(t => t.is_completed).length}/{group.length}
                  </span>
                </div>
                <ul className="cl-task-list">
                  {group.map(task => (
                    <li key={task.id} className={`cl-task${task.is_completed ? ' cl-task--done' : ''}`}>
                      <button
                        className="cl-checkbox"
                        onClick={() => toggle(task)}
                        aria-label={task.is_completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {task.is_completed && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                      {editingId === task.id ? (
                        <div className="cl-edit-row">
                          <input
                            ref={editInputRef}
                            className="cl-edit-input"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit(task)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                          <input
                            type="date"
                            className="cl-edit-date"
                            value={editDate}
                            onChange={e => setEditDate(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit(task)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                        </div>
                      ) : (
                        <span className="cl-task-title">
                          {task.title}
                          {task.due_date && (() => {
                            const d = new Date(task.due_date)
                            const key = !isNaN(d)
                              ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                              : null
                            const conflicts = key ? (primaryConflicts[key] || []) : []
                            return (
                              <>
                                <span className="cl-due-badge">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                <ConflictBadge conflicts={conflicts} />
                              </>
                            )
                          })()}
                        </span>
                      )}
                      <select
                        className="cl-assignee-select"
                        value={task.assigned_to_email || ''}
                        onChange={e => assign(task, e.target.value)}
                        disabled={editingId === task.id}
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.email} value={u.email}>
                            {u.name || u.email}
                          </option>
                        ))}
                      </select>
                      <button
                        className="cl-edit-btn"
                        onClick={() => editingId === task.id ? saveEdit(task) : startEdit(task)}
                        aria-label={editingId === task.id ? 'Save task' : 'Edit task'}
                      >
                        {editingId === task.id ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        )}
                      </button>
                      <button
                        className="cl-delete-btn"
                        onClick={() => deleteTask(task.id)}
                        aria-label="Delete task"
                        disabled={editingId === task.id}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
