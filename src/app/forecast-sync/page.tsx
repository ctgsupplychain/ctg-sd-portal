'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

const SHEET_ID = '1ptI1gnMWdaxzYHQEVGjILgEpwqjCtDeYpj7hvY9R104'
const SHEET_GID = '0'

const MONTH_COL_MAP: Record<string, string> = {
  "Apr'26": 'apr_26', "May'26": 'may_26', "Jun'26": 'jun_26',
  "Jul'26": 'jul_26', "Aug'26": 'aug_26', "Sep'26": 'sep_26',
  "Oct'26": 'oct_26', "Nov'26": 'nov_26', "Dec'26": 'dec_26',
  "Jan'27": 'jan_27', "Feb'27": 'feb_27', "Mar'27": 'mar_27',
}

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

  function getPreviousWk(): string {
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
    return `W${weekNum - 1}/${now.getFullYear()}`
  }

  async function fetchSheetCSV(): Promise<Record<string, string>[]> {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status} — ensure you are logged into Google`)
    const csv = await res.text()
    return parseCSV(csv)
  }

  function parseCSV(csv: string): Record<string, string>[] {
    const lines = csv.split('\n').filter(l => l.trim())
    if (lines.length < 2) return []
    const headers = parseCSVLine(lines[0])
    return lines.slice(1).map(line => {
      const vals = parseCSVLine(line)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim() })
      return row
    }).filter(r => r['Project']?.trim())
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let cur = ''; let inQ = false
    for (const c of line) {
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { result.push(cur); cur = '' }
      else { cur += c }
    }
    result.push(cur)
    return result
  }

  function getLatestRow(rows: Record<string, string>[], project: string, targetWk: string) {
    const wkRows = rows.filter(r => r['Project']?.trim() === project && r['Week']?.trim() === targetWk)
    if (wkRows.length) return wkRows.sort((a, b) => new Date(b['Timestamp']).getTime() - new Date(a['Timestamp']).getTime())[0]
    const all = rows.filter(r => r['Project']?.trim() === project)
    return all.length ? all.sort((a, b) => new Date(b['Timestamp']).getTime() - new Date(a['Timestamp']).getTime())[0] : null
  }

  function applyCarryForward(monthly: Record<string, number>): Record<string, number> {
    const keys = Object.values(MONTH_COL_MAP)
    let last = 0; const result: Record<string, number> = {}
    keys.forEach(k => { if (monthly[k] > 0) { last = monthly[k]; result[k] = monthly[k] } else { result[k] = last } })
    return result
  }

  async function handleSync() {
    setLoading(true); setError(null); setResults([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      let rows: Record<string, string>[]
      try { rows = await fetchSheetCSV() }
      catch (e: any) { throw new Error(`Cannot read Google Sheet: ${e.message}`) }
      if (!rows.length) throw new Error('No data in Google Sheet.')

      const { data: projects } = await supabase.from('projects').select('id, project_name')
      const targetWk = getPreviousWk()
      const sheetProjects = [...new Set(rows.map(r => r['Project']?.trim()).filter(Boolean))]
      const syncResults: SyncResult[] = []

      for (const projectName of sheetProjects) {
        const row = getLatestRow(rows, projectName, targetWk)
        if (!row) continue

        const projectRecord = projects?.find(p => p.project_name.toLowerCase() === projectName.toLowerCase())
        const monthly: Record<string, number> = {}
        Object.entries(MONTH_COL_MAP).forEach(([col, key]) => {
          const v = parseFloat(row[col] || '0'); monthly[key] = isNaN(v) ? 0 : v
        })
        const carried = applyCarryForward(monthly)
        const wkStr = row['Week']?.trim() || targetWk
        const yearMatch = wkStr.match(/(\d{4})/); const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear()

        const { error: upsertErr } = await supabase.from('sales_forecast').upsert({
          brand: row['Brand']?.trim(),
          project: projectName,
          project_id: projectRecord?.id || null,
          submission_wk: wkStr,
          year,
          ...carried,
          submitted_at: row['Timestamp'] ? new Date(row['Timestamp']).toISOString() : new Date().toISOString(),
        }, { onConflict: 'brand,submission_wk,year' })

        syncResults.push({ project: projectName, brand: row['Brand']?.trim(), project_id: projectRecord?.id || null, submission_wk: wkStr, synced: !upsertErr, error: upsertErr?.message })
      }

      setResults(syncResults)
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
      <p className="text-sm text-gray-500 mb-2">Reads latest weekly submissions from Google Sheets and syncs to the portal database.</p>
      <p className="text-xs text-gray-400 mb-8">Uses previous week's submission per project. Falls back to most recent if not found.</p>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Source</p>
        <p>CTG Sales Forecast — Google Sheet</p>
        {lastSynced && <p className="text-xs text-gray-400 mt-2">Last synced: {lastSynced}</p>}
      </div>

      <button onClick={handleSync} disabled={loading}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
        {loading ? 'Syncing...' : 'Sync Forecast from Google Sheets'}
      </button>

      {error && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-sm text-red-700">{error}</p></div>}

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
                  {['Project','Brand','Week','Project ID','Status'].map(h => (
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
                    <td className="px-4 py-2 text-xs text-gray-500">{r.project_id || <span className="text-yellow-600">unmapped</span>}</td>
                    <td className="px-4 py-2">
                      {r.synced ? <span className="text-green-600 font-medium">✓ Synced</span> : <span className="text-red-600 font-medium">✗ {r.error}</span>}
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
