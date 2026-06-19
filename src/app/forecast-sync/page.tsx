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

interface TrendRow {
  project: string
  brand: string
  company: string
  subs: number
  prevTotal: number | null
  latestTotal: number
  deltaPct: number | null
  status: 'up' | 'down' | 'volatile' | 'single'
  spark: number[]
}

// Snapshot from CTG Sales Forecast Google Sheet, W18-W25/2026 — recon view, not live-queried.
// Sorted by submission count, descending.
const TREND_DATA: TrendRow[] = [
  { project: 'BeYoute', brand: 'Bonlife', company: 'CTG Wellness', subs: 5, prevTotal: 3600, latestTotal: 3200, deltaPct: -11.1, status: 'down', spark: [2400, 2399, 2450, 3600, 3200] },
  { project: 'Master Nerv', brand: 'Mejorecare', company: 'CTG Wellness', subs: 5, prevTotal: 5750, latestTotal: 6400, deltaPct: 11.3, status: 'up', spark: [5750, 5500, 5500, 5750, 6400] },
  { project: 'Skindae', brand: 'Skindae', company: 'Skindae', subs: 4, prevTotal: 11400, latestTotal: 11800, deltaPct: 3.5, status: 'up', spark: [10300, 11200, 11400, 11800] },
  { project: 'iLady', brand: 'iProcare', company: 'Iprocare', subs: 3, prevTotal: 15600, latestTotal: 18172, deltaPct: 16.5, status: 'up', spark: [15400, 15600, 18172] },
  { project: 'KATA', brand: 'KATA', company: 'Minfinity', subs: 3, prevTotal: 8600, latestTotal: 7694, deltaPct: -10.5, status: 'down', spark: [6450, 8600, 7694] },
  { project: 'Recovery', brand: 'Naturelish', company: 'Oasis CTG', subs: 3, prevTotal: 7000, latestTotal: 7500, deltaPct: 7.1, status: 'up', spark: [6596, 7000, 7500] },
  { project: 'IsoKae', brand: 'Naturelish', company: 'Zen E Wellness', subs: 3, prevTotal: 2000, latestTotal: 2850, deltaPct: 42.5, status: 'volatile', spark: [3900, 2000, 2850] },
  { project: 'Jeeroul', brand: 'Jeeroul', company: 'CTG4u Jeeroul', subs: 3, prevTotal: 1210, latestTotal: 2510, deltaPct: 107.4, status: 'volatile', spark: [56, 1210, 2510] },
  { project: 'Mformula', brand: 'Naturelish', company: 'Oasis CTG', subs: 2, prevTotal: 13340, latestTotal: 15100, deltaPct: 13.2, status: 'up', spark: [13340, 15100] },
  { project: 'LivAct', brand: 'Wellsprings', company: 'CTG Wellness', subs: 2, prevTotal: 3600, latestTotal: 3350, deltaPct: -6.9, status: 'down', spark: [3600, 3350] },
  { project: 'URO360', brand: 'Naturelish', company: 'Naturelish', subs: 2, prevTotal: 2150, latestTotal: 2640, deltaPct: 22.8, status: 'up', spark: [2150, 2640] },
  { project: 'Dr. Smile', brand: 'Dr. Smile', company: 'DrSmile Whitening', subs: 1, prevTotal: null, latestTotal: 10550, deltaPct: null, status: 'single', spark: [10550] },
  { project: 'Reneicare', brand: 'GoHerb', company: 'GoHerb', subs: 1, prevTotal: null, latestTotal: 6700, deltaPct: null, status: 'single', spark: [6700] },
  { project: 'Ninoko', brand: 'Ninoko', company: 'Oasis CTG', subs: 1, prevTotal: null, latestTotal: 5900, deltaPct: null, status: 'single', spark: [5900] },
  { project: 'Moesie', brand: 'Moesie', company: 'Nuan Nuan', subs: 1, prevTotal: null, latestTotal: 4550, deltaPct: null, status: 'single', spark: [4550] },
  { project: 'Mplus', brand: 'Mplus', company: 'M PLUS SKINPRO', subs: 1, prevTotal: null, latestTotal: 3850, deltaPct: null, status: 'single', spark: [3850] },
  { project: 'Bugucare', brand: 'Naturelish', company: 'Naturelish', subs: 1, prevTotal: null, latestTotal: 3850, deltaPct: null, status: 'single', spark: [3850] },
  { project: 'M.Placenta', brand: 'Mizino', company: 'Leaf Cottage', subs: 1, prevTotal: null, latestTotal: 2980, deltaPct: null, status: 'single', spark: [2980] },
  { project: 'M.Chocolate', brand: 'Mizino', company: 'CTG Ricebow', subs: 1, prevTotal: null, latestTotal: 2400, deltaPct: null, status: 'single', spark: [2400] },
  { project: 'Pomegranate', brand: 'GoHerb', company: 'GoHerb', subs: 1, prevTotal: null, latestTotal: 2000, deltaPct: null, status: 'single', spark: [2000] },
  { project: 'Eco Plus', brand: 'Naturelish', company: 'GTI', subs: 1, prevTotal: null, latestTotal: 1899, deltaPct: null, status: 'single', spark: [1899] },
  { project: 'Agepros', brand: 'SwissMed', company: 'Gold Waves', subs: 1, prevTotal: null, latestTotal: 1830, deltaPct: null, status: 'single', spark: [1830] },
  { project: 'M.Enzyme', brand: 'Mizino', company: 'CTG Ricebow', subs: 1, prevTotal: null, latestTotal: 1750, deltaPct: null, status: 'single', spark: [1750] },
]

function Sparkline({ values, status }: { values: number[]; status: TrendRow['status'] }) {
  if (values.length < 2) return <span className="text-xs" style={{ color: '#98A2B3' }}>&mdash;</span>
  const w = 70, h = 22, pad = 2
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const color = status === 'down' ? '#C5453F' : status === 'volatile' ? '#E8A33D' : '#2F9E68'
  const [lastX, lastY] = pts[pts.length - 1].split(',')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  )
}

function StatusTag({ status }: { status: TrendRow['status'] }) {
  const map = {
    up: { bg: '#E1F5EE', fg: '#085041', label: 'Trending up' },
    down: { bg: '#FAEAEA', fg: '#C5453F', label: 'Trending down' },
    volatile: { bg: '#FBEFD9', fg: '#85530B', label: 'Volatile — review' },
    single: { bg: '#F4F2EE', fg: '#4B5563', label: 'Single submission' },
  } as const
  const s = map[status]
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
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
    <div className="max-w-4xl mx-auto px-6 py-10">
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

      <div className="mt-10 pt-8" style={{ borderTop: '1px solid #E4DDD3' }}>
        <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {[
            { label: 'Projects tracked', value: '22', hint: 'across 24 companies', bg: '#FFFFFF', border: '#E4DDD3', fg: '#1F2937', fgHint: '#98A2B3' },
            { label: 'Revised up', value: '9', hint: 'vs prior submission', bg: '#E4F4EE', border: 'transparent', fg: '#0F6E56', fgHint: '#0F6E56' },
            { label: 'Revised down', value: '3', hint: 'vs prior submission', bg: '#FBEAEA', border: 'transparent', fg: '#A32D2D', fgHint: '#A32D2D' },
            { label: 'Single submission', value: '10', hint: 'no trend yet — flag', bg: '#FBEFD9', border: 'transparent', fg: '#85530B', fgHint: '#85530B' },
            { label: 'Total forecast', value: '142.0k', hint: 'latest, all projects', bg: '#FFFFFF', border: '#E4DDD3', fg: '#1F2937', fgHint: '#98A2B3' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl p-3" style={{ background: kpi.bg, border: kpi.border !== 'transparent' ? `1px solid ${kpi.border}` : undefined }}>
              <div className="text-xs font-medium" style={{ color: kpi.fg, opacity: 0.85 }}>{kpi.label}</div>
              <div className="text-2xl font-medium mt-0.5" style={{ color: kpi.fg, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{kpi.value}</div>
              <div className="text-xs mt-0.5" style={{ color: kpi.fgHint, opacity: 0.8 }}>{kpi.hint}</div>
            </div>
          ))}
        </div>

        <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-sm font-semibold" style={{ color: '#1F2937' }}>Forecast on record</h2>
          <span className="text-xs" style={{ color: '#98A2B3' }}>
            sorted by submission count, descending
          </span>
        </div>
        <p className="text-xs mb-1" style={{ color: '#4B5563', opacity: 0.7 }}>
          Snapshot from the Google Sheet (W18&ndash;W25/2026, 22 projects) &mdash; not yet wired to a live query. Refresh this section after each sync run is automated.
        </p>
        <div className="rounded-xl overflow-hidden mt-4" style={{ border: '1px solid #E4DDD3' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#F4F2EE', borderBottom: '1px solid #E4DDD3' }}>
                {['Project', 'Brand', 'Company', 'Subs', 'Trend', 'Prior', 'Latest', 'Δ', 'Status'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 text-xs font-medium ${i < 3 ? 'text-left' : 'text-right'}`}
                    style={{ color: '#4B5563' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TREND_DATA.map(row => (
                <tr key={row.project} style={{ borderBottom: '1px solid #F4F2EE' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: '#1F2937' }}>{row.project}</td>
                  <td className="px-3 py-2" style={{ color: '#4B5563' }}>{row.brand}</td>
                  <td className="px-3 py-2" style={{ color: '#4B5563' }}>{row.company}</td>
                  <td className="px-3 py-2 text-right" style={{ color: '#4B5563', fontFamily: 'monospace' }}>{row.subs}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex justify-end"><Sparkline values={row.spark} status={row.status} /></span>
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: '#4B5563', fontFamily: 'monospace' }}>
                    {row.prevTotal !== null ? row.prevTotal.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: '#1F2937', fontFamily: 'monospace' }}>
                    {row.latestTotal.toLocaleString()}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-medium"
                    style={{ fontFamily: 'monospace', color: row.deltaPct === null ? '#98A2B3' : row.deltaPct >= 0 ? '#2F9E68' : '#C5453F' }}
                  >
                    {row.deltaPct === null ? '—' : `${row.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(row.deltaPct)}%`}
                  </td>
                  <td className="px-3 py-2 text-right"><StatusTag status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: '#98A2B3' }}>
          Volatile = |Δ| &gt; 30% vs prior submission &mdash; likely needs owner follow-up before trusting the number.
        </p>

        <div className="grid gap-3 mt-6" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
          <div className="rounded-xl p-4" style={{ border: '1px solid #E4DDD3' }}>
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <span className="text-sm font-semibold" style={{ color: '#1F2937' }}>Near-term curve &mdash; top 5 projects</span>
              <span className="text-xs" style={{ color: '#98A2B3' }}>first 6 non-zero months, latest submission</span>
            </div>
            <svg viewBox="0 0 560 200" style={{ width: '100%', height: 'auto' }}>
              <line x1="46" y1="22" x2="46" y2="162" stroke="rgba(15,40,30,0.14)" strokeWidth="1" />
              <line x1="46" y1="162" x2="540" y2="162" stroke="rgba(15,40,30,0.14)" strokeWidth="1" />
              <polyline points="46,128 128,140 210,140 292,118 374,130 456,118" fill="none" stroke="#1D9E75" strokeWidth="2.2" />
              <polyline points="46,150 128,150 210,140 292,140 374,118 456,96" fill="none" stroke="#378ADD" strokeWidth="2.2" />
              <polyline points="46,108 128,72 210,72 292,72 374,72 456,72" fill="none" stroke="#EF9F27" strokeWidth="2.2" />
              <polyline points="46,114 128,130 210,121 292,96 374,114 456,84" fill="none" stroke="#E24B4A" strokeWidth="2.2" />
              <polyline points="46,128 128,128 210,96 292,150 374,96 456,68" fill="none" stroke="#8B948F" strokeWidth="2.2" strokeDasharray="4 3" />
              <text x="42" y="26" fontFamily="IBM Plex Sans, sans-serif" fontSize="9.5" fill="#8B948F" textAnchor="end">units/mo</text>
              <text x="46" y="180" fontFamily="IBM Plex Sans, sans-serif" fontSize="9.5" fill="#8B948F">mo 1</text>
              <text x="512" y="180" fontFamily="IBM Plex Sans, sans-serif" fontSize="9.5" fill="#8B948F">mo 6</text>
            </svg>
            <div className="flex flex-wrap gap-3 mt-2 text-xs" style={{ color: '#98A2B3' }}>
              {[
                { c: '#1D9E75', label: 'iLady' },
                { c: '#378ADD', label: 'Mformula' },
                { c: '#EF9F27', label: 'Skindae' },
                { c: '#E24B4A', label: 'Dr. Smile' },
                { c: '#8B948F', label: 'KATA' },
              ].map(item => (
                <span key={item.label} className="inline-flex items-center gap-1">
                  <i style={{ width: 9, height: 2, display: 'inline-block', borderRadius: 2, background: item.c }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ border: '1px solid #E4DDD3' }}>
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <span className="text-sm font-semibold" style={{ color: '#1F2937' }}>Submission cadence</span>
              <span className="text-xs" style={{ color: '#98A2B3' }}>weeks with a row, per project</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F4F2EE' }}>
                  <th className="text-left text-xs font-medium pb-2" style={{ color: '#4B5563' }}>Project</th>
                  <th className="text-right text-xs font-medium pb-2" style={{ color: '#4B5563' }}>W18&hellip;W25</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { project: 'Master Nerv', weeks: [1, 1, 0, 1, 1, 0, 1, 0] },
                  { project: 'BeYoute', weeks: [1, 1, 0, 1, 1, 0, 1, 0] },
                  { project: 'Skindae', weeks: [1, 1, 0, 0, 0, 1, 1, 0] },
                  { project: 'Jeeroul', weeks: [1, 0, 0, 1, 0, 1, 0, 0] },
                  { project: 'iLady', weeks: [1, 0, 0, 1, 1, 0, 0, 0] },
                ].map(row => (
                  <tr key={row.project} style={{ borderBottom: '1px solid #F4F2EE' }}>
                    <td className="py-2 text-sm" style={{ color: '#1F2937' }}>{row.project}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        {row.weeks.map((on, i) => (
                          <i
                            key={i}
                            style={{
                              width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
                              background: on ? '#1D9E75' : 'rgba(15,40,30,0.16)',
                            }}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs mt-3" style={{ color: '#98A2B3' }}>
              Most projects submit every 1&ndash;3 weeks, not weekly &mdash; sync logic&apos;s &ldquo;fallback to most recent&rdquo; is doing real work here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
