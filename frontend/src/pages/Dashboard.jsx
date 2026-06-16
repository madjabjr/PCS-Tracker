import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Here&rsquo;s your PCS overview.
        </p>
      </div>

      <div className="dashboard-sections">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Upcoming Tasks</h2>
          </div>
          <div className="empty-state">
            <p>No upcoming tasks. Use Task Manager to create your PCS checklist.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Key Dates</h2>
          </div>
          <div className="empty-state">
            <p>No dates set. Configure your timeline to see milestones here.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
