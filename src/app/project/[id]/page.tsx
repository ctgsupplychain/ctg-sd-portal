'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import SDTable from '@/components/sd/SDTable'
import { computeSD, FLAG_DISPLAY } from '@/lib/sd-compute'
import type { SkuSdResult, WeekInfo } from '@/lib/sd-compute'
import { RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const CURRENT_WK = process.env.NEXT_PUBLIC_CURRENT_WEEK || 'WK20'

export default function ProjectPage() {
  const params = useParams()
  const brand = decodeURIComponent(params.id as string)
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [brands, setBrands] = useState<string[]>([])
  const [weeks, setWeeks] = useState<WeekInfo[]>([])
  const [skuResults, setSkuResults] = useState<SkuSdResult[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  useEffect(() => {
    loadAll()
  }, [brand])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    const isAdmin = prof?.role === 'admin' || prof?.role === 'supply_chain'
    if (isAdmin) {
      const { data: allSkus } = await supabase.from('master_sku').select('brand').neq('brand', '')
      const uniqueBrands = [...new Set(allSkus?.map((s: any) => s.brand) || [])]
      setBrands(uniqueBrands as string[])
    } else {
      const { data: access } = await supabase.from('user_brand_access').select('brand').eq('user_id', user.id)
      setBrands(access?.map((a: any) => a.brand) || [])
    }

    const { data: wkData } = await supabase
      .from('week_calendar')
      .select('*')
      .gte('wk_label', CURRENT_WK)
      .order('wk_in_year')
      .limit(26)

    const wkList: WeekInfo[] = (wkData || []).map((w: any) => ({
      label: w.wk_label,
      year: w.year,
      month: w.month,
      monthLabel: w.month_label,
      wkInYear: w.wk_in_year,
      wkInMonth: w.wk_in_month,
      mondayDate: w.monday_date,
      weeksInMonth: w.weeks_in_month,
    }))
    setWeeks(wkList)

    const { data: skuData } = await supabase
      .from('master_sku')
      .select('*')
      .eq('brand', brand)
      .eq('status', 'Active')

    const { data: stockData } = await supabase
  .from('wms_inventory_snapshots')
  .select('sku, atp, snapshot_date')
  .in('sku', skuData?.map((s: any) => s.sku) || [])
  .order('snapshot_date', { ascending: false })

const latestStock: Record<string, number> = {}
const stockDates: string[] = []
stockData?.forEach((s: any) => {
  if (!latestStock[s.sku]) {
    latestStock[s.sku] = s.atp
    stockDates.push(s.snapshot_date)
  }
})
if (stockDates[0]) setLastUpdated(stockDates[0])
    // Get project_id from projects table matching brand
const { data: projectData } = await supabase
  .from('projects')
  .select('id')
  .eq('brand', brand)
  .limit(1)
  .single()

const { data: fcstData } = await supabase
  .from('sales_forecast')
  .select('*')
  .eq('project_id', projectData?.id || '')
  .order('submitted_at', { ascending: false })
  .limit(1)
  .single()

    const forecast = fcstData || null

    const { data: supplyData } = await supabase
      .from('supply_input')
      .select('*')
      .in('sku', skuData?.map((s: any) => s.sku) || [])

    const { data: histData } = await supabase
      .from('historical_demand')
      .select('sku, qty')
      .in('sku', skuData?.map((s: any) => s.sku) || [])
      .gte('iso_year', 2026)
      .lte('iso_week', 17)
      .gte('iso_week', 5)

    const histBySku: Record<string, number[]> = {}
    histData?.forEach((h: any) => {
      if (!histBySku[h.sku]) histBySku[h.sku] = []
      histBySku[h.sku].push(h.qty)
    })
    const histAvg: Record<string, number> = {}
    Object.entries(histBySku).forEach(([sku, qtys]) => {
      histAvg[sku] = qtys.reduce((a, b) => a + b, 0) / qtys.length
    })

    const results: SkuSdResult[] = (skuData || []).map((skuRaw: any) => {
      const sku = {
        sku: skuRaw.sku, description: skuRaw.description, brand: skuRaw.brand,
        moq: skuRaw.moq, uom: skuRaw.uom, leadTimeWk: skuRaw.lead_time_wk,
        avgSellingPrice: skuRaw.avg_selling_price, safetyStock: skuRaw.safety_stock,
        bufferStock: skuRaw.buffer_stock, status: skuRaw.status,
      }
      const skuSupply = supplyData?.filter((s: any) => s.sku === skuRaw.sku) || []
      const commits: Record<string, number> = {}
      const uncommits: Record<string, number> = {}
      skuSupply.forEach((s: any) => {
        if (s.status === 'Commit') commits[s.receipt_wk] = (commits[s.receipt_wk] || 0) + s.qty
        else uncommits[s.receipt_wk] = (uncommits[s.receipt_wk] || 0) + s.qty
      })
      return computeSD({
        sku, onHand: latestStock[skuRaw.sku] || 0, weeks: wkList,
        forecast, historicalAvg: histAvg[skuRaw.sku] || 0,
        supplyCommits: commits, supplyUncommits: uncommits,
        currentWk: CURRENT_WK, thresholdOrderNow: 4, thresholdMonitor: 8,
      })
    })

    setSkuResults(results)
    setLoading(false)
  }

 const criticalSkus: SkuSdResult[] = []

  return (
    <div className="flex h-screen overflow-hidden bg-[#F0F2F5]">
      <Sidebar userEmail={profile?.email} userName={profile?.full_name}
        userRole={profile?.role} brands={brands} activeBrand={brand} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#EAECF0] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-[#101828]">Supply & Demand</h1>
            <span className="bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6] text-xs px-2.5 py-1 rounded-full font-medium">{brand}</span>
            <span className="bg-[#F2F4F7] text-[#667085] text-xs px-2.5 py-1 rounded-full">{CURRENT_WK} 2026</span>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && <span className="text-xs text-[#98A2B3]">Inventory: {lastUpdated}</span>}
            <button onClick={loadAll} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#D0D5DD] rounded-lg text-[#344054] hover:bg-[#F9FAFB]">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-[#667085] text-sm">Loading S&D data...</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4">
                {skuResults.slice(0, 4).map(s => {
                  const f = FLAG_DISPLAY[s.flag]
                  return (
                    <div key={s.sku.sku} className="bg-white rounded-xl border border-[#EAECF0] p-4">
                      <div className="text-xs text-[#667085] mb-1 truncate">{s.sku.sku}</div>
                      <div className="text-xl font-semibold text-[#101828]">{s.onHand.toLocaleString()}</div>
                      <div className="text-xs mt-1 flex items-center justify-between">
                        <span className="text-[#667085]">WoC: <b>{s.weeksOfCover}</b> wks</span>
                        <span style={{ color: f.color }} className="font-medium">{f.emoji} {f.label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {criticalSkus.length > 0 && (
                <div className="space-y-2">
                  {criticalSkus.map(s => {
                    const f = FLAG_DISPLAY[s.flag]
                    return (
                      <div key={s.sku.sku} className={clsx(
                        'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm',
                        s.flag === 'STOCKOUT' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'
                      )}>
                        <span className="text-base mt-0.5 flex-shrink-0">{f.emoji}</span>
                        <div className="flex-1">
                          <span className="font-semibold">{s.sku.sku}</span>
                          {s.flag === 'PULL_IN' && ' — Open PO in pipeline. Request supplier to advance delivery.'}
                          {s.flag === 'ORDER_NOW' && ' — No open supply. Raise purchase order immediately.'}
                          {s.flag === 'STOCKOUT' && ' — Stock depleted. Urgent action required.'}
                          <span className="ml-2 text-xs opacity-70">WoC: {s.weeksOfCover} wks · On-Hand: {s.onHand.toLocaleString()}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="bg-white rounded-xl border border-[#EAECF0] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-[#344054]">Weekly Supply & Demand</h2>
                  <span className="text-xs text-[#98A2B3]">Rolling 26 weeks from {CURRENT_WK}</span>
                </div>
                {skuResults.length > 0 && weeks.length > 0
                  ? <SDTable skus={skuResults} weeks={weeks} currentWk={CURRENT_WK} />
                  : <div className="text-sm text-[#667085] text-center py-8">No SKU data found for {brand}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
