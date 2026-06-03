'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import { computeSD, FLAG_DISPLAY } from '@/lib/sd-compute'
import type { SkuSdResult, WeekInfo } from '@/lib/sd-compute'
import { loadDemandForecast } from '@/lib/forecasting/forecast-lookup'
import { Download, RefreshCw, AlertTriangle, Clock } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────

function getCurrentMondayDate(): string {
  const now = new Date()
  const day = now.getDay() === 0 ? 7 : now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day - 1))
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const CURRENT_MONDAY = getCurrentMondayDate()
let CURRENT_WK = ''

// ── types ─────────────────────────────────────────────────────────────────────

interface PlannedPoRow {
  brand: string
  sku: string
  description: string
  uom: string
  leadTimeWk: number
  woc: number
  stockoutWk: string
  releaseByWk: string
  releaseDateLabel: string   // human-readable monday date string
  orderQty: number
  flag: 'RELEASE_PO' | 'PLAN_PO'
  note: string
}

// ── component ─────────────────────────────────────────────────────────────────

export default function PlannedPoPage() {
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [brands, setBrands] = useState<string[]>([])
  const [rows, setRows] = useState<PlannedPoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterFlag, setFilterFlag] = useState<'ALL' | 'RELEASE_PO' | 'PLAN_PO'>('ALL')
  const [snapshotDate, setSnapshotDate] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    // ── 1. Determine accessible brands ────────────────────────────────────────
    const isAdmin = prof?.role === 'admin' || prof?.role === 'supply_chain'
    let accessibleBrands: string[] = []
    if (isAdmin) {
      const { data: allSkus } = await supabase.from('master_sku').select('brand').neq('brand', '')
      accessibleBrands = [...new Set(allSkus?.map((s: any) => s.brand) || [])] as string[]
    } else {
      const { data: access } = await supabase.from('user_brand_access').select('brand').eq('user_id', user.id)
      accessibleBrands = access?.map((a: any) => a.brand) || []
    }
    setBrands(accessibleBrands.sort((a, b) => a.localeCompare(b)))

    // ── 2. Week calendar ──────────────────────────────────────────────────────
    const { data: wkData } = await supabase
      .from('week_calendar').select('*').gte('monday_date', CURRENT_MONDAY).order('monday_date').limit(52)

    const wkList: WeekInfo[] = (wkData || []).map((w: any) => ({
      label: w.wk_label, year: w.year, month: w.month, monthLabel: w.month_label,
      wkInYear: w.wk_in_year, wkInMonth: w.wk_in_month, mondayDate: w.monday_date, weeksInMonth: w.weeks_in_month,
    }))
    const wkByLabel: Record<string, WeekInfo> = {}
    wkList.forEach(w => { wkByLabel[w.label] = w })
    if (wkList.length > 0) CURRENT_WK = wkList[0].label

    // ── 3. Batch-load all active SKUs ─────────────────────────────────────────
    const { data: allSkuData } = await supabase
      .from('master_sku').select('*')
      .in('brand', accessibleBrands)
      .eq('status', 'Active')

    const allSkus = allSkuData || []
    const allSkuIds = allSkus.map((s: any) => s.sku)

    // ── 4. Batch-load stock, supply, history ──────────────────────────────────
    const [
      { data: stockData },
      { data: supplyData },
      { data: histData },
    ] = await Promise.all([
      supabase.from('wms_inventory_snapshots').select('sku, atp, snapshot_date')
        .in('sku', allSkuIds).order('snapshot_date', { ascending: false }),
      supabase.from('purchase_orders').select('*').in('sku', allSkuIds).eq('status', 'Open'),
      supabase.from('historical_demand').select('sku, qty')
        .in('sku', allSkuIds).gte('iso_year', 2026).lte('iso_week', 17).gte('iso_week', 5),
    ])

    // Latest on-hand per SKU
    const latestStock: Record<string, number> = {}
    const stockDates: string[] = []
    stockData?.forEach((s: any) => {
      if (!latestStock[s.sku]) { latestStock[s.sku] = s.atp; stockDates.push(s.snapshot_date) }
    })
    if (stockDates[0]) setSnapshotDate(stockDates[0])

    // Historical avg per SKU
    const histBySku: Record<string, number[]> = {}
    histData?.forEach((h: any) => {
      if (!histBySku[h.sku]) histBySku[h.sku] = []
      histBySku[h.sku].push(h.qty)
    })
    const histAvg: Record<string, number> = {}
    Object.entries(histBySku).forEach(([sku, qtys]) => {
      histAvg[sku] = qtys.reduce((a, b) => a + b, 0) / qtys.length
    })

    // Supply commits/uncommits per SKU
    const commitsBySku: Record<string, Record<string, number>> = {}
    const uncommitsBySku: Record<string, Record<string, number>> = {}
    supplyData?.forEach((s: any) => {
      if (s.commit_status === 'Commit') {
        if (!commitsBySku[s.sku]) commitsBySku[s.sku] = {}
        commitsBySku[s.sku][s.receipt_wk] = (commitsBySku[s.sku][s.receipt_wk] || 0) + s.qty
      } else {
        if (!uncommitsBySku[s.sku]) uncommitsBySku[s.sku] = {}
        uncommitsBySku[s.sku][s.receipt_wk] = (uncommitsBySku[s.sku][s.receipt_wk] || 0) + s.qty
      }
    })

    // ── 5. Load sales forecasts — one per brand (latest per project) ──────────
    const forecastByBrand: Record<string, any> = {}
    const uniqueBrands = [...new Set(allSkus.map((s: any) => s.brand))] as string[]
    await Promise.all(uniqueBrands.map(async (brand) => {
      const { data: proj } = await supabase
        .from('projects').select('id').eq('brand', brand).limit(1).single()
      if (proj?.id) {
        const { data: fcst } = await supabase
          .from('sales_forecast').select('*').eq('project_id', proj.id)
          .order('submitted_at', { ascending: false }).limit(1).single()
        if (fcst) forecastByBrand[brand] = fcst
      }
    }))

    // ── 6. Load statistical demand forecasts ──────────────────────────────────
    const demandForecastMap = await loadDemandForecast(allSkuIds)

    // ── 7. Compute SD for every SKU, collect actionable rows ──────────────────
    const plannedRows: PlannedPoRow[] = []

    for (const skuRaw of allSkus) {
      const sku = {
        sku: skuRaw.sku, description: skuRaw.description, brand: skuRaw.brand,
        moq: skuRaw.moq, uom: skuRaw.uom, leadTimeWk: skuRaw.lead_time_wk,
        avgSellingPrice: skuRaw.avg_selling_price, safetyStock: skuRaw.safety_stock,
        bufferStock: skuRaw.buffer_stock, status: skuRaw.status,
      }

      const result: SkuSdResult = computeSD({
        sku,
        onHand: latestStock[skuRaw.sku] || 0,
        backorderQty: skuRaw.backorder_qty || 0,
        weeks: wkList,
        forecast: forecastByBrand[skuRaw.brand] || null,
        historicalAvg: histAvg[skuRaw.sku] || 0,
        demandForecast: demandForecastMap.get(skuRaw.sku) ?? null,
        supplyCommits: commitsBySku[skuRaw.sku] || {},
        supplyUncommits: uncommitsBySku[skuRaw.sku] || {},
        currentWk: CURRENT_WK,
        thresholdOrderNow: 4,
        thresholdMonitor: 8,
      })

      if (result.flag !== 'RELEASE_PO' && result.flag !== 'PLAN_PO') continue

      // Resolve release-by monday date for display
      const releaseWkInfo = result.plannedPoReleaseDateWk
        ? wkByLabel[result.plannedPoReleaseDateWk]
        : null
      const releaseDateLabel = releaseWkInfo?.mondayDate ?? '—'

      // Note: MOQ covers estimated weeks at current avg demand
      const avgWklyDemand = result.weeks
        .slice(0, 4).reduce((a, w) => a + w.forecastQty, 0) / 4 || 0
      const moqCoverWks = avgWklyDemand > 0
        ? Math.round(skuRaw.moq / avgWklyDemand)
        : null
      const note = [
        `MOQ (${skuRaw.moq.toLocaleString()} ${skuRaw.uom}) covers ~${moqCoverWks ?? '?'} wks at current demand.`,
        `Safety stock buffer: TBD.`,
      ].join(' ')

      plannedRows.push({
        brand: skuRaw.brand,
        sku: skuRaw.sku,
        description: skuRaw.description,
        uom: skuRaw.uom,
        leadTimeWk: skuRaw.lead_time_wk,
        woc: result.weeksOfCover,
        stockoutWk: result.stockoutWk ?? '—',
        releaseByWk: result.plannedPoReleaseDateWk ?? '—',
        releaseDateLabel,
        orderQty: skuRaw.moq,
        flag: result.flag as 'RELEASE_PO' | 'PLAN_PO',
        note,
      })
    }

    // Sort: RELEASE_PO first, then PLAN_PO; within each group by release date asc
    plannedRows.sort((a, b) => {
      if (a.flag !== b.flag) return a.flag === 'RELEASE_PO' ? -1 : 1
      return a.releaseByWk.localeCompare(b.releaseByWk)
    })

    setRows(plannedRows)
    setLoading(false)
  }

  // ── CSV export ───────────────────────────────────────────────────────────────

  function exportCsv() {
    const headers = [
      'Priority', 'Brand', 'SKU', 'Description', 'UOM',
      'LT (wks)', 'WoC (wks)', 'Stockout Week', 'Release By (Week)',
      'Release By (Date)', 'Order Qty (MOQ)', 'Note'
    ]
    const visibleRows = filterFlag === 'ALL' ? rows : rows.filter(r => r.flag === filterFlag)
    const csvRows = visibleRows.map(r => [
      r.flag === 'RELEASE_PO' ? 'RELEASE PO' : 'PLAN PO',
      r.brand, r.sku, `"${r.description}"`, r.uom,
      r.leadTimeWk, r.woc, r.stockoutWk, r.releaseByWk,
      r.releaseDateLabel, r.orderQty, `"${r.note}"`
    ])
    const csv = [headers, ...csvRows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `planned-po-${CURRENT_WK}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── render ────────────────────────────────────────────────────────────────────

  const visibleRows = filterFlag === 'ALL' ? rows : rows.filter(r => r.flag === filterFlag)
  const releaseCount = rows.filter(r => r.flag === 'RELEASE_PO').length
  const planCount = rows.filter(r => r.flag === 'PLAN_PO').length

  return (
    <div className="flex h-screen overflow-hidden bg-[#F0F2F5]">
      <Sidebar userEmail={profile?.email} userName={profile?.full_name}
        userRole={profile?.role} brands={brands} />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="bg-white border-b border-[#EAECF0] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-[#101828]">Planned PO</h1>
            <span className="bg-[#F2F4F7] text-[#667085] text-xs px-2.5 py-1 rounded-full">{CURRENT_WK} 2026</span>
            {snapshotDate && (
              <span className="text-xs text-[#98A2B3]">Inventory: {snapshotDate}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={loading || rows.length === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#D0D5DD] rounded-lg text-[#344054] hover:bg-[#F9FAFB] disabled:opacity-40"
            >
              <Download size={12} /> Export CSV
            </button>
            <button
              onClick={loadAll}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#D0D5DD] rounded-lg text-[#344054] hover:bg-[#F9FAFB]"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-[#667085] text-sm">
              Computing replenishment queue across all SKUs...
            </div>
          ) : (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
                  <div className="text-xs text-[#667085] mb-1">Release PO</div>
                  <div className="text-2xl font-semibold text-[#B54708]">{releaseCount}</div>
                  <div className="text-xs mt-1 text-[#667085]">POs overdue or due within LT window</div>
                </div>
                <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
                  <div className="text-xs text-[#667085] mb-1">Plan PO</div>
                  <div className="text-2xl font-semibold text-[#854D0E]">{planCount}</div>
                  <div className="text-xs mt-1 text-[#667085]">Stockout projected beyond LT — plan ahead</div>
                </div>
                <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
                  <div className="text-xs text-[#667085] mb-1">Total SKUs Flagged</div>
                  <div className="text-2xl font-semibold text-[#101828]">{rows.length}</div>
                  <div className="text-xs mt-1 text-[#667085]">Across all accessible brands</div>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-2">
                {(['ALL', 'RELEASE_PO', 'PLAN_PO'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterFlag(f)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      filterFlag === f
                        ? 'bg-[#101828] text-white border-[#101828]'
                        : 'bg-white text-[#667085] border-[#D0D5DD] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    {f === 'ALL' ? `All (${rows.length})`
                     : f === 'RELEASE_PO' ? `Release PO (${releaseCount})`
                     : `Plan PO (${planCount})`}
                  </button>
                ))}
              </div>

              {/* Table */}
              {visibleRows.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#EAECF0] p-10 text-center text-sm text-[#667085]">
                  No replenishment actions required.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-[#EAECF0] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#F9FAFB] border-b border-[#EAECF0]">
                        <th className="text-left px-4 py-3 text-[#667085] font-medium w-28">Priority</th>
                        <th className="text-left px-4 py-3 text-[#667085] font-medium">Brand</th>
                        <th className="text-left px-4 py-3 text-[#667085] font-medium">SKU</th>
                        <th className="text-left px-4 py-3 text-[#667085] font-medium max-w-[200px]">Description</th>
                        <th className="text-center px-4 py-3 text-[#667085] font-medium">LT (wks)</th>
                        <th className="text-center px-4 py-3 text-[#667085] font-medium">WoC (wks)</th>
                        <th className="text-center px-4 py-3 text-[#667085] font-medium">Stockout Wk</th>
                        <th className="text-center px-4 py-3 text-[#667085] font-medium">Release By</th>
                        <th className="text-right px-4 py-3 text-[#667085] font-medium">Order Qty</th>
                        <th className="text-left px-4 py-3 text-[#667085] font-medium w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F4F7]">
                      {visibleRows.map((row, i) => (
                        <tr key={`${row.sku}-${i}`} className="hover:bg-[#FAFAFA] transition-colors">

                          {/* Priority badge */}
                          <td className="px-4 py-3">
                            {row.flag === 'RELEASE_PO' ? (
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-medium text-[11px]">
                                <AlertTriangle size={10} /> Release PO
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-full font-medium text-[11px]">
                                <Clock size={10} /> Plan PO
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-[#344054] font-medium">{row.brand}</td>
                          <td className="px-4 py-3 text-[#101828] font-mono font-medium">{row.sku}</td>
                          <td className="px-4 py-3 text-[#667085] max-w-[200px] truncate" title={row.description}>
                            {row.description}
                          </td>

                          {/* LT */}
                          <td className="px-4 py-3 text-center text-[#344054]">{row.leadTimeWk}</td>

                          {/* WoC — colour by urgency */}
                          <td className="px-4 py-3 text-center font-medium" style={{
                            color: row.woc < 4 ? '#B42318' : row.woc < 8 ? '#B54708' : '#344054'
                          }}>{row.woc}</td>

                          {/* Stockout week */}
                          <td className="px-4 py-3 text-center text-[#344054]">{row.stockoutWk}</td>

                          {/* Release by — flag overdue in red */}
                          <td className="px-4 py-3 text-center">
                            <span className={`font-medium ${
                              row.releaseByWk !== '—' && row.releaseByWk <= CURRENT_WK
                                ? 'text-[#B42318]'
                                : 'text-[#344054]'
                            }`}>
                              {row.releaseByWk}
                            </span>
                            {row.releaseDateLabel !== '—' && (
                              <div className="text-[#98A2B3] text-[10px]">{row.releaseDateLabel}</div>
                            )}
                          </td>

                          {/* Order qty */}
                          <td className="px-4 py-3 text-right text-[#101828] font-medium">
                            {row.orderQty.toLocaleString()}
                            <span className="text-[#98A2B3] font-normal ml-1">{row.uom}</span>
                          </td>

                          {/* Note tooltip */}
                          <td className="px-4 py-3 text-center">
                            <span
                              title={row.note}
                              className="text-[#98A2B3] cursor-help hover:text-[#667085] text-sm"
                            >ⓘ</span>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {rows.length > 0 && (
                <p className="text-[11px] text-[#98A2B3]">
                  Order qty = MOQ from Master SKU. Safety stock buffer not yet configured — release dates may shift earlier once SS is defined per SKU.
                  Release by date = Stockout week − Lead time − 1 wk (ops buffer).
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
