'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

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
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Forecast Sync</h1>
      <p className="text-sm text-gray-500 mb-2">
        Reads latest weekly submissions from Google Sheets and syncs to the portal database.
      </p>
      <p className="text-xs text-gray-400 mb-8">
        Uses previous week's submission per project. Falls back to most recent if not found. Carry-forward applied for zero months.
      </p>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Source</p>
        <p>CTG Sales Forecast — Google Sheet (via service account)</p>
        {lastSynced && <p className="text-xs text-gray-400 mt-2">Last synced: {lastSynced}</p>}
      </div>

      <button onClick={handleSync} disabled={loading}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
        {loading ? 'Syncing...' : 'Sync Forecast from Google Sheets'}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-700 font-medium">✓ {successCount} synced</span>
            {failCount > 0 && <span className="text-red-700 font-medium">✗ {failCount} failed</span>}
            {unmappedCount > 0 && <span className="text-yellow-700 font-medium">⚠ {unmappedCount} unmapped</span>}
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Project', 'Brand', 'Week', 'Project ID', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-gray-800">{r.project}</td>
                    <td className="px-4 py-2 text-gray-600">{r.brand}</td>
                    <td className="px-4 py-2 text-gray-600">{r.submission_wk}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {r.project_id || <span className="text-yellow-600">unmapped</span>}
                    </td>
                    <td className="px-4 py-2">
                      {r.synced
                        ? <span className="text-green-600 font-medium">✓ Synced</span>
                        : <span className="text-red-600 font-medium">✗ {r.error}</span>}
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
