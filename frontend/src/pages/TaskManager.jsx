import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

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
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('medical')
  const [newDueDate, setNewDueDate] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [savingNew, setSavingNew] = useState(false)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/checklist/')
      setTasks(res.data)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [fetchTasks])

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
                      <span className="cl-task-title">
                        {task.title}
                        {task.due_date && (
                          <span className="cl-due-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </span>
                      <select
                        className="cl-assignee-select"
                        value={task.assigned_to_email || ''}
                        onChange={e => assign(task, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.email} value={u.email}>
                            {u.name || u.email}
                          </option>
                        ))}
                      </select>
                      <button
                        className="cl-delete-btn"
                        onClick={() => deleteTask(task.id)}
                        aria-label="Delete task"
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
