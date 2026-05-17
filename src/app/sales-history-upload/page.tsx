'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react'
import BackToSD from '@/components/layout/BackToSD'

type Channel = 'B2B' | 'B2C'

interface ForecastSummaryItem {
  model: string
  historyWeeks: number
  mape?: number
}

interface UploadResult {
  success: boolean
  channel: Channel
  parseStats: {
    totalLineItems: number
    validLineItems: number
    skippedLineItems: number
    skippedStatuses: Record<string, number>
    dateRange: { min: string; max: string } | null
  }
  salesHistory: {
    weeklyRowsProcessed: number
    upserted: number
  }
  forecast: {
    skusUpdated: number
    summary: Record<string, ForecastSummaryItem>
  }
  warnings: {
    unknownSkus: string[]
  }
}

const MODEL_LABELS: Record<string, string> = {
  holt_winters: 'Holt-Winters',
  wma: 'Wtd Moving Avg',
  avg: 'Simple Avg',
}

const MODEL_COLORS: Record<string, string> = {
  holt_winters: 'bg-teal-100 text-teal-800',
  wma: 'bg-blue-100 text-blue-800',
  avg: 'bg-gray-100 text-gray-600',
}

export default function SalesHistoryUploadPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [b2bFile, setB2bFile] = useState<File | null>(null)
  const [b2cFile, setB2cFile] = useState<File | null>(null)
  const [draggingB2b, setDraggingB2b] = useState(false)
  const [draggingB2c, setDraggingB2c] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent, channel: Channel) => {
    e.preventDefault()
    if (channel === 'B2B') setDraggingB2b(false)
    else setDraggingB2c(false)

    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      if (channel === 'B2B') setB2bFile(dropped)
      else setB2cFile(dropped)
      setResults([])
      setError(null)
    }
  }, [])

  async function uploadFile(file: File, channel: Channel, token: string): Promise<UploadResult> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('channel', channel)

    const res = await fetch('/api/sales-history-upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `${channel} upload failed`)
    return json
  }

  const handleUpload = async () => {
    if (!b2bFile && !b2cFile) return

    setLoading(true)
    setError(null)
    setResults([])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const uploads: Promise<UploadResult>[] = []
      if (b2bFile) uploads.push(uploadFile(b2bFile, 'B2B', session.access_token))
      if (b2cFile) uploads.push(uploadFile(b2cFile, 'B2C', session.access_token))

      const uploadResults = await Promise.all(uploads)
      setResults(uploadResults)
    } catch (err: any) {
      setError(err.message ?? 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  const DropZone = ({
    channel, file, dragging,
    onDrag, onDragLeave, onDrop, onChange
  }: {
    channel: Channel
    file: File | null
    dragging: boolean
    onDrag: () => void
    onDragLeave: () => void
    onDrop: (e: React.DragEvent) => void
    onChange: (f: File) => void
  }) => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          channel === 'B2B'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-orange-100 text-orange-700'
        }`}>{channel}</span>
        <span className="text-sm text-gray-600 font-medium">
          {channel === 'B2B' ? 'B2B Order Report' : 'B2C Order Report'}
        </span>
        <span className="text-xs text-gray-400 ml-auto">Optional</span>
      </div>
      <div
        onDragOver={e => { e.preventDefault(); onDrag() }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => document.getElementById(`file-${channel}`)?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-teal-500 bg-teal-50'
            : file
              ? 'border-teal-400 bg-teal-50/40'
              : 'border-gray-200 bg-gray-50 hover:border-teal-300'
        }`}
      >
        <input
          id={`file-${channel}`}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { onChange(f); setResults([]); setError(null) } }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <CheckCircle size={16} className="text-teal-600" />
            <div>
              <p className="text-sm font-medium text-teal-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        ) : (
          <div>
            <Upload size={18} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Drop {channel} report here, or click to browse</p>
            <p className="text-xs text-gray-300 mt-0.5">.xls or .xlsx</p>
          </div>
        )}
      </div>
    </div>
  )

  const totalForecastSkus = results.reduce((sum, r) => sum + r.forecast.skusUpdated, 0)
  const totalWeeklyRows = results.reduce((sum, r) => sum + r.salesHistory.weeklyRowsProcessed, 0)
  const allUnknownSkus = [...new Set(results.flatMap(r => r.warnings.unknownSkus))]
  const allSkippedStatuses = results.reduce((acc, r) => {
    Object.entries(r.parseStats.skippedStatuses).forEach(([k, v]) => {
      acc[k] = (acc[k] ?? 0) + v
    })
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <BackToSD />
        <div className="w-px h-4 bg-gray-200" />
        <h1 className="text-sm font-semibold text-gray-900">Sales History Upload</h1>
      </div>
      <div className="mb-8">
        <p className="text-sm text-gray-500">Upload B2B and/or B2C WMS order reports. Data is rolled up to weekly demand,
          upserted into the sales history table, and demand forecasts are regenerated automatically.</p>
      </div>

      {/* Upload mode notice */}
      <div className="mb-6 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <p className="text-xs font-medium text-blue-800 mb-1">Upload Modes</p>
        <ul className="text-xs text-blue-700 space-y-0.5">
          <li>• <strong>Bootstrap (first time per brand):</strong> Upload 12-month B2B + B2C together — brand is auto-detected from the Company column.</li>
          <li>• <strong>Ongoing:</strong> Upload combined multi-brand reports monthly. Only new weeks are inserted; existing weeks are overwritten.</li>
        </ul>
      </div>

      {/* Drop zones */}
      <div className="space-y-4 mb-6">
        <DropZone
          channel="B2B"
          file={b2bFile}
          dragging={draggingB2b}
          onDrag={() => setDraggingB2b(true)}
          onDragLeave={() => setDraggingB2b(false)}
          onDrop={e => handleDrop(e, 'B2B')}
          onChange={f => setB2bFile(f)}
        />
        <DropZone
          channel="B2C"
          file={b2cFile}
          dragging={draggingB2c}
          onDrag={() => setDraggingB2c(true)}
          onDragLeave={() => setDraggingB2c(false)}
          onDrop={e => handleDrop(e, 'B2C')}
          onChange={f => setB2cFile(f)}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={(!b2bFile && !b2cFile) || loading}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
        ) : (
          <><Upload size={15} />Upload & Generate Forecast</>
        )}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 space-y-4">
          {/* Summary header */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-sm font-semibold text-green-800">Upload Complete</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Weekly rows saved" value={totalWeeklyRows.toString()} />
              <Stat label="SKUs forecasted" value={totalForecastSkus.toString()} />
              <Stat
                label="Date range"
                value={results[0]?.parseStats.dateRange
                  ? `${results[0].parseStats.dateRange.min} → ${results[results.length-1].parseStats.dateRange?.max ?? ''}`
                  : '—'}
                small
              />
            </div>
          </div>

          {/* Per-channel breakdown */}
          {results.map(r => (
            <div key={r.channel} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  r.channel === 'B2B'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-orange-100 text-orange-700'
                }`}>{r.channel}</span>
                <span className="text-sm font-medium text-gray-700">
                  {r.parseStats.validLineItems.toLocaleString()} line items →{' '}
                  {r.salesHistory.weeklyRowsProcessed} weekly rows
                </span>
              </div>

              {/* Forecast per SKU */}
              <div className="px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Forecast Generated</p>
                {Object.entries(r.forecast.summary).map(([sku, info]) => (
                  <div key={sku} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart2 size={13} className="text-gray-400" />
                      <span className="text-sm font-mono text-gray-700">{sku}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${MODEL_COLORS[info.model] ?? 'bg-gray-100 text-gray-600'}`}>
                        {MODEL_LABELS[info.model] ?? info.model}
                      </span>
                      <span className="text-xs text-gray-400">{info.historyWeeks}wk history</span>
                    </div>
                    {info.mape !== undefined && (
                      <span className={`text-xs font-medium ${
                        info.mape < 20 ? 'text-green-600' : info.mape < 40 ? 'text-yellow-600' : 'text-red-500'
                      }`}>
                        MAPE {info.mape}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Warnings */}
          {allUnknownSkus.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-yellow-800 mb-1">
                {allUnknownSkus.length} SKU{allUnknownSkus.length > 1 ? 's' : ''} not in master_sku — skipped
              </p>
              <p className="text-xs text-yellow-700 font-mono">{allUnknownSkus.join(', ')}</p>
            </div>
          )}

          {/* Skipped statuses (collapsible) */}
          {Object.keys(allSkippedStatuses).length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowSkipped(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <span>Skipped order statuses</span>
                {showSkipped ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showSkipped && (
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {Object.entries(allSkippedStatuses).map(([status, count]) => (
                    <span key={status} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                      {status}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className={`${small ? 'text-xs' : 'text-lg'} font-semibold text-green-900`}>{value}</p>
      <p className="text-xs text-green-700">{label}</p>
    </div>
  )
}
