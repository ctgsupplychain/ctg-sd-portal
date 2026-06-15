'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import BackToSD from '@/components/layout/BackToSD'

interface SyncResult {
  project: string
  brand: string
  project_id: string | null
  submission_wk: string
  synced: boolean
  error?: string
}

export default function ForecastSyncPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SyncResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true); setError(null); setResults([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const res = await fetch('/api/forecast-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sync failed')

      setResults(json.results || [])
      setLastSynced(new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const successCount = results.filter(r => r.synced).length
  const failCount = results.filter(r => !r.synced).length
  const unmappedCount = results.filter(r => r.synced && !r.project_id).length

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <BackToSD />
        <div className="w-px h-4" style={{ background: '#E4DDD3' }} />
        <h1 className="text-sm font-semibold" style={{ color: '#1F2937', fontFamily: 'Cambria, Georgia, serif' }}>Forecast Sync</h1>
      </div>
      <p className="text-sm mb-2" style={{ color: '#4B5563' }}>
        Reads latest weekly submissions from Google Sheets and syncs to the portal database.
      </p>
      <p className="text-xs mb-8" style={{ color: '#4B5563', opacity: 0.7 }}>
        Uses previous week&apos;s submission per project. Falls back to most recent if not found. Carry-forward applied for zero months.
      </p>

      <div className="rounded-xl p-4 mb-6 text-sm" style={{ background: '#F4F2EE', border: '1px solid #E4DDD3', color: '#4B5563' }}>
        <p className="font-medium mb-1" style={{ color: '#1F2937' }}>Source</p>
        <p>CTG Sales Forecast &mdash; Google Sheet (via service account)</p>
        {lastSynced && <p className="text-xs mt-2" style={{ color: '#4B5563', opacity: 0.7 }}>Last synced: {lastSynced}</p>}
      </div>

      <button
        onClick={handleSync}
        disabled={loading}
        className="w-full text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#0E5C56' }}
      >
        {loading ? 'Syncing...' : 'Sync Forecast from Google Sheets'}
      </button>

      {error && (
        <div className="mt-4 rounded-lg px-4 py-3" style={{ background: '#FAEAEA', border: '1px solid #F5C6C4' }}>
          <p className="text-sm" style={{ color: '#C5453F' }}>{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="font-medium" style={{ color: '#2F9E68' }}>&#10003; {successCount} synced</span>
            {failCount > 0 && <span className="font-medium" style={{ color: '#C5453F' }}>&#10007; {failCount} failed</span>}
            {unmappedCount > 0 && <span className="font-medium" style={{ color: '#E8A33D' }}>&#9888; {unmappedCount} unmapped</span>}
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E4DDD3' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#F4F2EE', borderBottom: '1px solid #E4DDD3' }}>
                  {['Project', 'Brand', 'Week', 'Project ID', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium" style={{ color: '#4B5563' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F4F2EE' }}>
                    <td className="px-4 py-2 font-medium" style={{ color: '#1F2937' }}>{r.project}</td>
                    <td className="px-4 py-2" style={{ color: '#4B5563' }}>{r.brand}</td>
                    <td className="px-4 py-2" style={{ color: '#4B5563' }}>{r.submission_wk}</td>
                    <td className="px-4 py-2 text-xs" style={{ color: '#4B5563' }}>
                      {r.project_id || <span style={{ color: '#E8A33D' }}>unmapped</span>}
                    </td>
                    <td className="px-4 py-2">
                      {r.synced
                        ? <span className="font-medium" style={{ color: '#2F9E68' }}>&#10003; Synced</span>
                        : <span className="font-medium" style={{ color: '#C5453F' }}>&#10007; {r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
