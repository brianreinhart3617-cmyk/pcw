import { useState, useEffect } from 'react'
import { fetchEmails, triggerPoll, type EmailLogRow } from '../api'

export default function EmailLog() {
  const [emails, setEmails] = useState<EmailLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async () => {
    try {
      setError(null)
      const data = await fetchEmails()
      setEmails(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handlePoll = async () => {
    setPolling(true)
    try {
      await triggerPoll()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Poll failed')
    } finally {
      setPolling(false)
    }
  }

  if (loading) return <div className="loading">Loading emails...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ marginBottom: 0 }}>Email Log</h2>
        <button className="btn-accent" onClick={handlePoll} disabled={polling}>
          {polling ? 'Polling...' : 'Poll Inboxes Now'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {emails.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">&#9993;</div>
          <p>No emails logged yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>Subject</th>
                <th>Date</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <>
                  <tr
                    key={email.id}
                    onClick={() => setExpanded(expanded === email.id ? null : email.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span className={`badge badge-${email.direction}`}>
                        {email.direction}
                      </span>
                    </td>
                    <td>{email.from_email}</td>
                    <td>{email.to_email}</td>
                    <td>{email.subject || '(no subject)'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(email.sent_at).toLocaleString()}
                    </td>
                    <td>
                      {email.classification ? (
                        <span className="badge badge-active">
                          {(email.classification as { category?: string }).category || 'classified'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                      )}
                    </td>
                  </tr>
                  {expanded === email.id && (
                    <tr key={`${email.id}-body`}>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div className="card-body" style={{ margin: '0 12px 12px', maxHeight: 300 }}>
                          {email.body || '(empty body)'}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
