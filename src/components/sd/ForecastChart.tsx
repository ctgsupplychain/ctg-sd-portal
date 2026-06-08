'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { SkuSdResult } from '@/lib/sd-compute'

interface ForecastChartProps {
  selectedSku: string
  skuResult: SkuSdResult | null
  brand: string
}

interface HistoryPoint { wk: string; qty: number; date: string }
interface ForecastPoint { wk: string; qty: number; lower: number; upper: number; date: string }

const MODEL_DISPLAY: Record<string, string> = {
  growth_hybrid: 'Growth-Hybrid',
  holts_linear_mgmt_seasonal: 'Holt-Winters (seasonal)',
  holts_linear: 'Holt-Winters',
  ses: 'SES',
  avg: 'Avg',
}

export default function ForecastChart({ selectedSku, skuResult }: ForecastChartProps) {
  const supabase  = createClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const chartLib  = useRef<any>(null)

  const [history,    setHistory]    = useState<HistoryPoint[]>([])
  const [b2bHistory, setB2bHistory] = useState<HistoryPoint[]>([])
  const [b2cHistory, setB2cHistory] = useState<HistoryPoint[]>([])
  const [forecast,   setForecast]   = useState<ForecastPoint[]>([])
  const [modelUsed,  setModelUsed]  = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [ready,      setReady]      = useState(false)   // Chart.js loaded
  const [showCI,     setShowCI]     = useState(true)
  const [showHist,   setShowHist]   = useState(true)
  const [showB2B,    setShowB2B]    = useState(false)
  const [showB2C,    setShowB2C]    = useState(false)

  // Load Chart.js once
  useEffect(() => {
    if ((window as any).Chart) {
      chartLib.current = (window as any).Chart
      setReady(true)
      return
    }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    s.onload = () => {
      chartLib.current = (window as any).Chart
      setReady(true)
    }
    document.head.appendChild(s)
  }, [])

  // Load data when SKU changes
  useEffect(() => {
    if (!selectedSku) return
    loadData(selectedSku)
  }, [selectedSku])

  // Render chart when data or toggles change
  useEffect(() => {
    if (!ready || loading) return
    renderChart()
  }, [ready, loading, history, b2bHistory, b2cHistory, forecast, showCI, showHist, showB2B, showB2C, skuResult])

  async function loadData(sku: string) {
    setLoading(true)

    // week_start_date is stored as Sunday; current week's Sunday = Monday - 1 day
    const today = new Date()
    const dow = today.getDay() // 0=Sun, 1=Mon, ...
    const diffToMon = dow === 0 ? -6 : 1 - dow
    const currentSunday = new Date(today)
    currentSunday.setDate(today.getDate() + diffToMon - 1)
    const currentWeekSundayStr = currentSunday.toISOString().slice(0, 10)

    const [histRes, fcRes] = await Promise.all([
      supabase
        .from('sales_history')
        .select('iso_year, iso_week, qty, week_start_date, channel')
        .eq('sku', sku)
        .order('iso_year').order('iso_week'),
      supabase
        .from('demand_forecast')
        .select('wk_label, forecast_qty, lower_bound, upper_bound, week_start_date, model_used')
        .eq('sku', sku)
        .gte('week_start_date', currentWeekSundayStr)
        .order('iso_year').order('iso_week'),
    ])

    // Aggregate total, B2B, and B2C per week
    const weekMap    = new Map<string, { qty: number; date: string }>()
    const b2bMap     = new Map<string, { qty: number; date: string }>()
    const b2cMap     = new Map<string, { qty: number; date: string }>()

    histRes.data?.forEach((h: any) => {
      const key  = `${h.iso_year}-W${String(h.iso_week).padStart(2,'0')}`
      const date = h.week_start_date ?? ''

      // Total
      const prev = weekMap.get(key)
      if (prev) prev.qty += h.qty
      else weekMap.set(key, { qty: h.qty, date })

      // Channel split
      const ch = (h.channel ?? '').toUpperCase()
      if (ch === 'B2B') {
        const p = b2bMap.get(key)
        if (p) p.qty += h.qty
        else b2bMap.set(key, { qty: h.qty, date })
      } else if (ch === 'B2C') {
        const p = b2cMap.get(key)
        if (p) p.qty += h.qty
        else b2cMap.set(key, { qty: h.qty, date })
      }
    })

    const HISTORY_WEEKS = 26
    const toPoints = (map: Map<string, { qty: number; date: string }>): HistoryPoint[] =>
      Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-HISTORY_WEEKS)
        .map(([key, v]) => ({ wk: key, qty: v.qty, date: v.date }))

    const fcPoints: ForecastPoint[] = (fcRes.data ?? []).map((f: any) => ({
      wk:    f.wk_label,
      qty:   f.forecast_qty,
      lower: f.lower_bound ?? 0,
      upper: f.upper_bound ?? 0,
      date:  f.week_start_date ?? '',
    }))

    setHistory(toPoints(weekMap))
    setB2bHistory(toPoints(b2bMap))
    setB2cHistory(toPoints(b2cMap))
    setForecast(fcPoints)
    setModelUsed((fcRes.data?.[0] as any)?.model_used ?? null)
    setLoading(false)
  }

  function fmtDate(dateStr: string): string {
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: '2-digit' })
    } catch { return dateStr }
  }

  function renderChart() {
    if (!canvasRef.current || !chartLib.current) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const nHist = showHist ? history.length : 0
    const nFc   = forecast.length

    const histLabels = history.map(h => fmtDate(h.date) || h.wk)
    const fcLabels   = forecast.map(f => fmtDate(f.date) || f.wk)
    const allLabels  = [...(showHist ? histLabels : []), ...fcLabels]

    const fcPad   = new Array(nHist).fill(null)
    const histPad = new Array(nFc).fill(null)
    const datasets: any[] = []

    if (showCI && nFc > 0) {
      datasets.push({
        label: 'CI upper',
        data: [...fcPad, ...forecast.map(f => f.upper)],
        borderColor: 'transparent', backgroundColor: 'rgba(29,158,117,0.12)',
        fill: '+1', pointRadius: 0, tension: 0.3, order: 5,
      })
      datasets.push({
        label: 'CI lower',
        data: [...fcPad, ...forecast.map(f => f.lower)],
        borderColor: 'transparent', backgroundColor: 'rgba(29,158,117,0.12)',
        fill: false, pointRadius: 0, tension: 0.3, order: 5,
      })
    }

    if (nFc > 0) {
      datasets.push({
        label: 'Forecast',
        data: [...fcPad, ...forecast.map(f => f.qty)],
        borderColor: '#1D9E75', backgroundColor: 'transparent',
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, order: 2,
      })
    }

    if (showHist && nHist > 0) {
      datasets.push({
        label: 'Actuals',
        data: [...history.map(h => h.qty), ...histPad],
        borderColor: '#888780', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.2, order: 3,
      })
    }

    // B2B channel line â aligned to total history labels
    if (showB2B && showHist && b2bHistory.length > 0) {
      // Map b2bHistory by wk key for fast lookup
      const b2bMap = new Map(b2bHistory.map(p => [p.wk, p.qty]))
      const b2bData = history.map(h => b2bMap.get(h.wk) ?? null)
      datasets.push({
        label: 'B2B',
        data: [...b2bData, ...histPad],
        borderColor: '#7C3AED', backgroundColor: 'transparent',
        borderWidth: 1.5, borderDash: [3, 2],
        pointRadius: 0, pointHoverRadius: 4, tension: 0.2, order: 4,
      })
    }

    // B2C channel line
    if (showB2C && showHist && b2cHistory.length > 0) {
      const b2cMap = new Map(b2cHistory.map(p => [p.wk, p.qty]))
      const b2cData = history.map(h => b2cMap.get(h.wk) ?? null)
      datasets.push({
        label: 'B2C',
        data: [...b2cData, ...histPad],
        borderColor: '#E8474C', backgroundColor: 'transparent',
        borderWidth: 1.5, borderDash: [3, 2],
        pointRadius: 0, pointHoverRadius: 4, tension: 0.2, order: 4,
      })
    }

    if (skuResult && skuResult.weeks.length > 0) {
      datasets.push({
        label: 'S&D plan',
        data: [...new Array(nHist).fill(null), ...skuResult.weeks.map(w => w.forecastQty)],
        borderColor: '#378ADD', backgroundColor: 'transparent',
        borderWidth: 1.5, borderDash: [4, 3],
        pointRadius: 0, pointHoverRadius: 4, tension: 0.2, order: 1,
      })
    }

    // Safety stock reference line
    const safetyStock = skuResult?.sku.safetyStock ?? 0
    if (safetyStock > 0) {
      const totalPoints = nHist + nFc
      datasets.push({
        label: 'Safety stock',
        data: new Array(totalPoints).fill(safetyStock),
        borderColor: '#EF9F27', backgroundColor: 'transparent',
        borderWidth: 1.5, borderDash: [3, 3],
        pointRadius: 0, pointHoverRadius: 0, tension: 0, order: 0,
      })
    }

    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new chartLib.current.Chart(ctx, {
      type: 'line',
      data: { labels: allLabels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item: any) => {
                if (item.raw === null) return null
                if (['CI upper', 'CI lower'].includes(item.dataset.label)) return null
                if (item.dataset.label === 'Safety stock') return ` Safety stock: ${Math.round(item.raw).toLocaleString()} units`
                return ` ${item.dataset.label}: ${Math.round(item.raw).toLocaleString()} units`
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 14, maxRotation: 45, font: { size: 10 }, color: '#888780' },
            grid:  { color: 'rgba(136,135,128,0.08)' },
          },
          y: {
            min: 0,
            ticks: {
              font: { size: 11 }, color: '#888780',
              callback: (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(Math.round(v)),
            },
            grid: { color: 'rgba(136,135,128,0.08)' },
          }
        }
      }
    })
  }

  const asp        = skuResult?.sku.avgSellingPrice ?? 0
  const modelLabel = forecast.length > 0
    ? (modelUsed
        ? (MODEL_DISPLAY[modelUsed] ?? modelUsed)
        : (asp > 0 ? 'GSheet plan' : history.length >= 16 ? 'Holt-Winters' : history.length >= 8 ? 'Wtd MA' : 'Avg'))
    : null
  const fc26total  = forecast.reduce((a, f) => a + f.qty, 0)

  return (
    <div className="bg-white rounded-xl border border-[#EAECF0] p-5 mt-4">

      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-[#344054]">Demand Forecast</h2>
          {modelLabel && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#E1F5EE] text-[#085041] font-medium">{modelLabel}</span>
          )}
          {history.length > 0 && (
            <span className="text-xs text-[#98A2B3]">{history.length}wk history</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-[#667085]">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showHist} onChange={e => setShowHist(e.target.checked)} className="accent-[#888780]" />
            History
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showB2B} onChange={e => setShowB2B(e.target.checked)} className="accent-[#7C3AED]" />
            B2B
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showB2C} onChange={e => setShowB2C(e.target.checked)} className="accent-[#E8474C]" />
            B2C
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showCI} onChange={e => setShowCI(e.target.checked)} className="accent-[#1D9E75]" />
            80% CI band
          </label>
        </div>
      </div>

      <div className="flex gap-5 mb-3 flex-wrap">
        {[
          { color: '#888780', label: 'Actuals',  dash: false },
          { color: '#1D9E75', label: modelLabel ?? 'Forecast', dash: false },
          { color: '#378ADD', label: 'S&D plan', dash: true },
          { color: '#EF9F27', label: 'Safety stock', dash: true },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5 text-xs text-[#667085]">
            <svg width="20" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="20" y2="5" stroke={l.color} strokeWidth="2"
                strokeDasharray={l.dash ? '4 3' : undefined} />
            </svg>
            {l.label}
          </span>
        ))}
        {showB2B && (
          <span className="flex items-center gap-1.5 text-xs text-[#667085]">
            <svg width="20" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="20" y2="5" stroke="#7C3AED" strokeWidth="2" strokeDasharray="3 2" />
            </svg>
            B2B
          </span>
        )}
        {showB2C && (
          <span className="flex items-center gap-1.5 text-xs text-[#667085]">
            <svg width="20" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="20" y2="5" stroke="#E8474C" strokeWidth="2" strokeDasharray="3 2" />
            </svg>
            B2C
          </span>
        )}
        {showCI && (
          <span className="flex items-center gap-1.5 text-xs text-[#667085]">
            <span className="w-5 h-3 inline-block rounded-sm" style={{ background: 'rgba(29,158,117,0.2)' }} />
            80% CI
          </span>
        )}
      </div>

      <div style={{ position: 'relative', height: '240px', overflowX: 'auto', overflowY: 'hidden' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-[#98A2B3]">Loading forecast data...</div>
        ) : !ready ? (
          <div className="flex items-center justify-center h-full text-sm text-[#98A2B3]">Initialising chart...</div>
        ) : forecast.length === 0 && history.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-[#98A2B3]">
            No forecast data. Upload sales history to generate.
          </div>
        ) : (
          <div style={{ position: 'relative', height: '100%', minWidth: `${Math.max(((showHist ? history.length : 0) + forecast.length) * 24, 600)}px` }}>
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>

      {forecast.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#EAECF0] grid grid-cols-4 gap-3">
          {[
            { label: '52-wk total',    value: fc26total.toLocaleString() },
            { label: 'Avg / wk',       value: Math.round(fc26total / forecast.length).toLocaleString() },
            { label: 'Wk 1 forecast',  value: (forecast[0]?.qty ?? 0).toLocaleString() },
            { label: 'Wk 52 forecast', value: (forecast[51]?.qty ?? 0).toLocaleString() },
          ].map(s => (
            <div key={s.label}>
              <p className="text-[10px] text-[#98A2B3] uppercase tracking-wide mb-0.5">{s.label}</p>
              <p className="text-sm font-semibold text-[#344054]">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
