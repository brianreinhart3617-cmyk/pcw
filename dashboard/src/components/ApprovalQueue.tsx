import { useState, useEffect, useCallback } from 'react'
import {
  fetchQueue,
  approveEmail,
  rejectEmail,
  requestChangesEmail,
  approveDeliverable,
  rejectDeliverable,
  requestChangesDeliverable,
  type PendingItem,
  type PendingEmailItem,
  type PendingDeliverableItem,
} from '../api'

interface Props {
  onQueueChange: (items: PendingItem[]) => void
}

export default function ApprovalQueue({ onQueueChange }: Props) {
  const [items, setItems] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [showFeedback, setShowFeedback] = useState<Record<string, 'reject' | 'changes' | null>>({})

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchQueue()
      setItems(data.items)
      onQueueChange(data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [onQueueChange])

  useEffect(() => { load() }, [load])

  const itemKey = (item: PendingItem) =>
    item.type === 'email' ? item.conversationId : item.deliverableId

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
      setShowFeedback((prev) => ({ ...prev, [key]: null }))
    }
  }

  const handleApprove = (item: PendingItem) => {
    const key = itemKey(item)
    withBusy(key, async () => {
      if (item.type === 'email') await approveEmail(item.conversationId)
      else await approveDeliverable(item.deliverableId)
    })
  }

  const handleReject = (item: PendingItem) => {
    const key = itemKey(item)
    const fb = feedback[key]?.trim()
    if (!fb) return
    withBusy(key, async () => {
      if (item.type === 'email') await rejectEmail(item.conversationId, fb)
      else await rejectDeliverable(item.deliverableId, fb)
    })
  }

  const handleRequestChanges = (item: PendingItem) => {
    const key = itemKey(item)
    const fb = feedback[key]?.trim()
    if (!fb) return
    withBusy(key, async () => {
      if (item.type === 'email') await requestChangesEmail(item.conversationId, fb)
      else await requestChangesDeliverable(item.deliverableId, fb)
    })
  }

  const toggleFeedback = (key: string, mode: 'reject' | 'changes') => {
    setShowFeedback((prev) => ({
      ...prev,
      [key]: prev[key] === mode ? null : mode,
    }))
  }

  if (loading) return <div className="loading">Loading queue...</div>

  return (
    <div>
      <h2>Approval Queue</h2>
      {error && <div className="error-msg">{error}</div>}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">&#10003;</div>
          <p>All caught up! No items pending approval.</p>
        </div>
      ) : (
        items.map((item) => {
          const key = itemKey(item)
          const isBusy = busy === key
          return (
            <div className="card" key={key}>
              {item.type === 'email' ? (
                <EmailCard item={item} />
              ) : (
                <DeliverableCard item={item} />
              )}
              <div className="card-actions">
                <button
                  className="btn-approve"
                  disabled={isBusy}
                  onClick={() => handleApprove(item)}
                >
                  {isBusy ? 'Processing...' : 'Approve'}
                </button>
                <button
                  className="btn-reject"
                  disabled={isBusy}
                  onClick={() => toggleFeedback(key, 'reject')}
                >
                  Reject
                </button>
                <button
                  className="btn-changes"
                  disabled={isBusy}
                  onClick={() => toggleFeedback(key, 'changes')}
                >
                  Request Changes
                </button>
              </div>
              {showFeedback[key] && (
                <div className="feedback-row">
                  <textarea
                    placeholder={
                      showFeedback[key] === 'reject'
                        ? 'Reason for rejection...'
                        : 'What changes are needed...'
                    }
                    value={feedback[key] || ''}
                    onChange={(e) =>
                      setFeedback((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                  <button
                    className={showFeedback[key] === 'reject' ? 'btn-reject' : 'btn-changes'}
                    disabled={isBusy || !feedback[key]?.trim()}
                    onClick={() =>
                      showFeedback[key] === 'reject'
                        ? handleReject(item)
                        : handleRequestChanges(item)
                    }
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function EmailCard({ item }: { item: PendingEmailItem }) {
  return (
    <>
      <div className="card-header">
        <h3>{item.subject || '(no subject)'}</h3>
        <span className="badge badge-email">Email Draft</span>
      </div>
      <div className="card-meta">
        <span>{item.companyName}</span>
        <span>To: {item.clientEmail}</span>
        {item.category && <span>Category: {item.category}</span>}
        <span>{new Date(item.updatedAt).toLocaleString()}</span>
      </div>
      <div className="card-body">{item.draftBody}</div>
    </>
  )
}

function DeliverableCard({ item }: { item: PendingDeliverableItem }) {
  const typeLabel = item.deliverableType === 'business_card' ? 'Business Card' : 'Flyer'
  return (
    <>
      <div className="card-header">
        <h3>{typeLabel} v{item.version}</h3>
        <span className="badge badge-deliverable">Deliverable</span>
      </div>
      <div className="card-meta">
        <span>Conversation: {item.conversationId.slice(0, 8)}...</span>
        <span>{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      {item.previewUrls && item.previewUrls.length > 0 && (
        <div className="card-meta">
          {item.previewUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', marginRight: 12 }}
            >
              Preview {i + 1}
            </a>
          ))}
        </div>
      )}
    </>
  )
}
