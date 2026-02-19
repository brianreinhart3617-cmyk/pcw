import { useState, useEffect } from 'react'
import './App.css'
import { fetchQueue, type PendingItem } from './api'
import ApprovalQueue from './components/ApprovalQueue'
import EmailLog from './components/EmailLog'
import Conversations from './components/Conversations'
import StatusPanel from './components/StatusPanel'

type Page = 'queue' | 'emails' | 'conversations' | 'status'

function App() {
  const [page, setPage] = useState<Page>('queue')
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    fetchQueue()
      .then((data) => setQueueCount(data.count))
      .catch(() => {})
  }, [page])

  const onQueueChange = (items: PendingItem[]) => {
    setQueueCount(items.length)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          PCW Agent System
          <span>Approval Dashboard</span>
        </div>
        <nav>
          <button
            className={page === 'queue' ? 'active' : ''}
            onClick={() => setPage('queue')}
          >
            Approval Queue
            {queueCount > 0 && <span className="queue-count">{queueCount}</span>}
          </button>
          <button
            className={page === 'emails' ? 'active' : ''}
            onClick={() => setPage('emails')}
          >
            Email Log
          </button>
          <button
            className={page === 'conversations' ? 'active' : ''}
            onClick={() => setPage('conversations')}
          >
            Conversations
          </button>
          <button
            className={page === 'status' ? 'active' : ''}
            onClick={() => setPage('status')}
          >
            System Status
          </button>
        </nav>
        <div className="sidebar-footer">
          Phoenix Creative Works
        </div>
      </aside>

      <main className="main">
        {page === 'queue' && <ApprovalQueue onQueueChange={onQueueChange} />}
        {page === 'emails' && <EmailLog />}
        {page === 'conversations' && <Conversations />}
        {page === 'status' && <StatusPanel />}
      </main>
    </div>
  )
}

export default App
