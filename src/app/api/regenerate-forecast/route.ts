// ============================================================
// POST /api/regenerate-forecast
// Regenerates demand_forecast from existing sales_history data.
// No re-upload needed — reads what's already in the DB.
// Body: { brand?: string, skus?: string[] }
//
// PERF: All data is bulk-fetched upfront (not per-SKU) so the
// total DB round-trips are O(1) not O(N SKUs). This avoids
// Vercel 504 timeouts on large SKU sets.
// ============================================================

export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateForecast, dateToIsoWeek } from '@/lib/forecasting/holt-winters'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await getSupabase()
      .from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'supply_chain'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { brand, skus: requestedSkus } = body as { brand?: string; skus?: string[] }

    // ── Bulk-fetch all data upfront (O(1) queries regardless of SKU count) ──

    // 1. Master SKUs
    const { data: masterSkus } = await getSupabase()
      .from('master_sku').select('sku, brand, avg_selling_price')
    const skuBrandMap = new Map((masterSkus ?? []).map((m: any) => [m.sku, m.brand]))
    const skuAspMap = new Map((masterSkus ?? []).map((m: any) => [m.sku, Number(m.avg_selling_price ?? 0)]))

    // 2. All sales_history (filtered to target SKUs/brand)
    let historyQuery = getSupabase()
      .from('sales_history').select('sku, iso_year, iso_week, qty, channel')
      .order('iso_year', { ascending: true }).order('iso_week', { ascending: true })
    if (requestedSkus?.length) historyQuery = historyQuery.in('sku', requestedSkus)
    else if (brand) historyQuery = historyQuery.eq('brand', brand)
    const { data: allHistory } = await historyQuery

    const targetSkus = [...new Set((allHistory ?? []).map((r: any) => r.sku))]
    if (targetSkus.length === 0) {
      return NextResponse.json({ error: 'No SKUs found in sales_history for the given filter' }, { status: 404 })
    }

    // Group history by SKU
    const historyBySku = new Map<string, any[]>()
    for (const row of allHistory ?? []) {
      if (!historyBySku.has(row.sku)) historyBySku.set(row.sku, [])
      historyBySku.get(row.sku)!.push(row)
    }

    // 3. ATP data for all target SKUs
    const { data: atpData } = await getSupabase()
      .from('weekly_atp_snapshot').select('sku, iso_year, iso_week, min_atp')
      .in('sku', targetSkus)

    // Group ATP by SKU
    const atpBySku = new Map<string, Set<string>>()
    const atpSkuSet = new Set<string>()
    for (const row of atpData ?? []) {
      atpSkuSet.add(row.sku)
      if (!atpBySku.has(row.sku)) atpBySku.set(row.sku, new Set())
      if (row.min_atp === 0) atpBySku.get(row.sku)!.add(`${row.iso_year}-${row.iso_week}`)
    }

    // 4. Management forecast (sales_forecast) for all relevant brands
    const relevantBrands = [...new Set(targetSkus.map(s => skuBrandMap.get(s)).filter(Boolean))]
    const { data: gsheetRows } = await getSupabase()
      .from('sales_forecast')
      .select('brand, may_26, jun_26, jul_26, aug_26, sep_26, oct_26, nov_26, dec_26, jan_27, feb_27, mar_27, apr_27, submitted_at')
      .in('brand', relevantBrands)
      .order('submitted_at', { ascending: false })

    // Keep only latest submission per brand
    const latestGsheetByBrand = new Map<string, any>()
    for (const row of gsheetRows ?? []) {
      if (!latestGsheetByBrand.has(row.brand)) latestGsheetByBrand.set(row.brand, row)
    }

    const COL_TO_MONTH: Record<string, string> = {
      may_26: '2026-05', jun_26: '2026-06', jul_26: '2026-07',
      aug_26: '2026-08', sep_26: '2026-09', oct_26: '2026-10',
      nov_26: '2026-11', dec_26: '2026-12', jan_27: '2027-01',
      feb_27: '2027-02', mar_27: '2027-03', apr_27: '2027-04',
    }

    // Precompute seasonal index map per brand
    const seasonalByBrand = new Map<string, Map<string, number>>()
    for (const [brand, gsheet] of latestGsheetByBrand) {
      const monthRevMap = new Map<string, number>()
      for (const [col, monthKey] of Object.entries(COL_TO_MONTH)) {
        const val = Number((gsheet as any)[col] ?? 0)
        if (val > 0) monthRevMap.set(monthKey, val)
      }
      const total = Array.from(monthRevMap.values()).reduce((a, b) => a + b, 0)
      if (total > 0 && monthRevMap.size > 0) {
        const avg = total / monthRevMap.size
        const idxMap = new Map<string, number>()
        for (const [m, v] of monthRevMap) idxMap.set(m, v / avg)
        seasonalByBrand.set(brand, idxMap)
      }
    }

    // ── Generate forecasts in memory ─────────────────────────────────────────
    const curIso = dateToIsoWeek(new Date())
    const startFrom = { isoYear: curIso.isoYear, isoWeek: curIso.isoWeek }

    const summary: Record<string, any> = {}
    const allForecastRecords: any[] = []
    const allWeekDates = new Set<string>()

    for (const sku of targetSkus) {
      try {
        const history = historyBySku.get(sku) ?? []
        if (history.length === 0) continue

        const historyPoints = history.map((h: any) => ({
          isoYear: h.iso_year, isoWeek: h.iso_week, qty: h.qty, channel: h.channel as 'B2B' | 'B2C',
        }))

        const stockoutWeeks = atpBySku.get(sku)
        const hasAtpData = atpSkuSet.has(sku)
        const result = generateForecast(sku, historyPoints, startFrom, hasAtpData ? stockoutWeeks : undefined)

        summary[sku] = {
          model: result.model, historyWeeks: result.historyWeeks,
          cappedWeeks: result.cappedWeeks, stockoutCorrectedWeeks: result.stockoutCorrectedWeeks, mape: result.mape,
        }

        const asp = skuAspMap.get(sku) ?? 0
        const skuBrand = skuBrandMap.get(sku) ?? ''
        let forecastPoints = result.points

        // Apply seasonal index if ASP > 0
        if (asp > 0 && skuBrand) {
          const idxMap = seasonalByBrand.get(skuBrand)
          if (idxMap) {
            forecastPoints = result.points.map(p => {
              const idx = idxMap.get(p.weekStartDate.substring(0, 7))
              if (!idx) return p
              return {
                ...p,
                forecastQty: Math.max(0, Math.round(p.forecastQty * idx)),
                lowerBound: Math.max(0, Math.round(p.lowerBound * idx)),
                upperBound: Math.max(0, Math.round(p.upperBound * idx)),
              }
            })
          }
        }

        const modelStr = asp > 0 ? `${result.model}_mgmt_seasonal` : result.model
        for (const p of forecastPoints) {
          allWeekDates.add(p.weekStartDate)
          allForecastRecords.push({
            sku, brand: skuBrand || 'Unknown',
            iso_year: p.isoYear, iso_week: p.isoWeek,
            week_start_date: p.weekStartDate,
            wk_label: p.wkLabel, // filled in below
            forecast_qty: p.forecastQty,
            lower_bound: p.lowerBound, upper_bound: p.upperBound,
            model_used: modelStr, history_weeks: result.historyWeeks,
            generated_at: new Date().toISOString(),
          })
        }
      } catch (skuErr: any) {
        console.error(`Forecast error for ${sku}:`, skuErr)
      }
    }

    // 5. Week calendar — one bulk fetch for all needed dates
    if (allForecastRecords.length > 0) {
      const { data: wkCalendar } = await getSupabase()
        .from('week_calendar').select('wk_label, monday_date')
        .in('monday_date', [...allWeekDates])
      const calMap = new Map((wkCalendar ?? []).map((w: any) => [w.monday_date, w.wk_label]))

      for (const rec of allForecastRecords) {
        rec.wk_label = calMap.get(rec.week_start_date) ?? rec.wk_label
      }

      // 6. Single bulk upsert for all forecast records
      await getSupabase().from('demand_forecast')
        .upsert(allForecastRecords, { onConflict: 'sku,iso_year,iso_week' })
    }

    return NextResponse.json({
      success: true,
      skusProcessed: targetSkus.length,
      skusUpdated: Object.keys(summary).length,
      summary,
    })

  } catch (err: any) {
    console.error('regenerate-forecast error:', err)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
      }
