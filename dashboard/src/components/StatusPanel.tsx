import { useState, useEffect } from 'react'
import {
  fetchCompanies,
  fetchMakeStatus,
  fetchCanvaStatus,
  testMakeWebhook,
  type CompanyRow,
} from '../api'

interface IntegrationStatus {
  make: { configured: boolean; webhookUrl: string | null } | null
  canva: { status: string } | null
}

export default function StatusPanel() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [integrations, setIntegrations] = useState<IntegrationStatus>({ make: null, canva: null })
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchCompanies().catch(() => []),
      fetchMakeStatus().catch(() => null),
      fetchCanvaStatus().catch(() => null),
    ]).then(([companiesData, makeData, canvaData]) => {
      setCompanies(companiesData)
      setIntegrations({ make: makeData, canva: canvaData })
      setLoading(false)
    })
  }, [])

  const handleTestMake = async () => {
    setTestResult(null)
    try {
      await testMakeWebhook()
      setTestResult('Test event sent successfully')
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test failed')
    }
  }

  if (loading) return <div className="loading">Loading status...</div>

  return (
    <div>
      <h2>System Status</h2>

      <div className="status-grid">
        <div className="status-card">
          <h3>Companies</h3>
          <div className="status-value">{companies.length}</div>
        </div>
        <div className="status-card">
          <h3>Slack</h3>
          <span className="badge badge-pending">
            Configured via env
          </span>
        </div>
        <div className="status-card">
          <h3>Make.com</h3>
          <span className={`badge ${integrations.make?.configured ? 'badge-connected' : 'badge-disconnected'}`}>
            {integrations.make?.configured ? 'Connected' : 'Not configured'}
          </span>
          {integrations.make?.webhookUrl && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 6 }}>
              {integrations.make.webhookUrl}
            </div>
          )}
        </div>
        <div className="status-card">
          <h3>Canva</h3>
          <span className={`badge ${
            integrations.canva?.status === 'connected' ? 'badge-connected' :
            integrations.canva?.status === 'not_configured' ? 'badge-disconnected' : 'badge-pending'
          }`}>
            {integrations.canva?.status || 'Unknown'}
          </span>
        </div>
      </div>

      {integrations.make?.configured && (
        <div style={{ marginBottom: 20 }}>
          <button className="btn-accent" onClick={handleTestMake}>
            Test Make.com Webhook
          </button>
          {testResult && (
            <span style={{ marginLeft: 12, fontSize: '0.85rem', color: 'var(--text-dim)' }}>
              {testResult}
            </span>
          )}
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>Companies</h2>
      {companies.length === 0 ? (
        <div className="empty">
          <p>No companies seeded. Run: <code>npx tsx scripts/seed-companies.ts</code></p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Gmail</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>
                    <span className={`badge ${c.type === 'bh_center' ? 'badge-inbound' : 'badge-active'}`}>
                      {c.type === 'bh_center' ? 'BH Center' : 'Marketing'}
                    </span>
                  </td>
                  <td>{c.gmail_address}</td>
                  <td>
                    <span className={`badge ${c.is_active ? 'badge-connected' : 'badge-disconnected'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
