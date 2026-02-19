import { useState, useEffect } from 'react'
import { fetchConversations, type ConversationRow } from '../api'

const STATUS_OPTIONS = ['', 'active', 'waiting_client', 'waiting_approval', 'completed', 'ignored']

export default function Conversations() {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async (status?: string) => {
    try {
      setError(null)
      setLoading(true)
      const data = await fetchConversations(status || undefined)
      setConversations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(statusFilter) }, [statusFilter])

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'active': return 'badge-active'
      case 'waiting_approval': return 'badge-pending'
      case 'waiting_client': return 'badge-inbound'
      case 'completed': return 'badge-approved'
      case 'ignored': return 'badge-disconnected'
      default: return ''
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ marginBottom: 0 }}>Conversations</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s || 'all'}
              className={statusFilter === s ? 'btn-accent' : 'btn-secondary'}
              onClick={() => setStatusFilter(s)}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <div className="loading">Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">&#128172;</div>
          <p>No conversations found.</p>
        </div>
      ) : (
        conversations.map((conv) => (
          <div className="card" key={conv.id}>
            <div className="card-header">
              <h3>{conv.client_email}</h3>
              <span className={`badge ${statusBadgeClass(conv.status)}`}>
                {conv.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="card-meta">
              <span>{conv.companies?.name || 'Unknown company'}</span>
              {conv.category && <span>Category: {conv.category}</span>}
              {conv.sub_type && <span>Sub: {conv.sub_type}</span>}
              <span>{new Date(conv.updated_at).toLocaleString()}</span>
            </div>
            <button
              className="btn-secondary"
              onClick={() => setExpanded(expanded === conv.id ? null : conv.id)}
              style={{ fontSize: '0.78rem', padding: '4px 10px', marginBottom: expanded === conv.id ? 10 : 0 }}
            >
              {expanded === conv.id ? 'Hide History' : `Show History (${conv.conversation_history.length})`}
            </button>
            {expanded === conv.id && (
              <div style={{ marginTop: 8 }}>
                {conv.conversation_history.map((entry, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      borderLeft: `3px solid ${
                        entry.role === 'client' ? 'var(--blue)' :
                        entry.role === 'agent' ? 'var(--green)' : 'var(--orange)'
                      }`,
                      marginBottom: 6,
                      background: 'var(--bg)',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                      <strong style={{ textTransform: 'capitalize' }}>{entry.role}</strong>
                      {entry.subject && <> &mdash; {entry.subject}</>}
                      <span style={{ float: 'right' }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                      {entry.content.length > 500
                        ? entry.content.slice(0, 500) + '...'
                        : entry.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
