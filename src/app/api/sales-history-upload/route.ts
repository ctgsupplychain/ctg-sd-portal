// ============================================================
// POST /api/sales-history-upload
// Accepts pre-parsed weekly rows as JSON (parsed client-side)
// Bypasses Vercel's hard 4.5MB body limit for file uploads.
// Input: { channel, rows: WeeklyRow[], filename }
// ============================================================

export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateForecast, dateToIsoWeek, addIsoWeeks } from '@/lib/forecasting/holt-winters'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface WeeklyRow {
  brand: string; company: string; sku: string; channel: string
  isoYear: number; isoWeek: number; weekStart: string
  qty: number; orderCount: number
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'supply_chain'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { channel, rows } = body as { channel: string; rows: WeeklyRow[] }

    if (!channel || !['B2B', 'B2C'].includes(channel))
      return NextResponse.json({ error: 'channel must be B2B or B2C' }, { status: 400 })
    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })

    const { data: masterSkus } = await supabase.from('master_sku').select('sku, brand')
    const masterSkuSet = new Set((masterSkus ?? []).map((m: any) => m.sku))
    const skuBrandMap  = new Map((masterSkus ?? []).map((m: any) => [m.sku, m.brand]))

    const validRows   = rows.filter(r => masterSkuSet.has(r.sku))
    const unknownSkus = [...new Set(rows.filter(r => !masterSkuSet.has(r.sku)).map(r => r.sku))]

    if (validRows.length === 0)
      return NextResponse.json({ error: 'No rows matched known master SKUs', unknownSkus }, { status: 422 })

    const historyRecords = validRows.map(r => ({
      brand:           skuBrandMap.get(r.sku) ?? r.brand,
      company:         r.company,
      sku:             r.sku,
      channel:         r.channel,
      iso_year:        r.isoYear,
      iso_week:        r.isoWeek,
      week_start_date: r.weekStart,
      qty:             r.qty,
      order_count:     r.orderCount,
      source:          'WMS Upload',
      uploaded_by:     user.email,
      uploaded_at:     new Date().toISOString(),
    }))

    const { error: upsertErr, count: upsertedCount } = await supabase
      .from('sales_history')
      .upsert(historyRecords, { onConflict: 'sku,channel,iso_year,iso_week', count: 'exact' })

    if (upsertErr) {
      console.error('sales_history upsert error:', upsertErr)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    const affectedSkus = [...new Set(validRows.map(r => r.sku))]
    const forecastSummary: Record<string, { model: string; historyWeeks: number; cappedWeeks: number; mape?: number }> = {}

    for (const sku of affectedSkus) {
      const { data: history } = await supabase
        .from('sales_history').select('iso_year, iso_week, qty, channel').eq('sku', sku)
        .order('iso_year', { ascending: true }).order('iso_week', { ascending: true })

      if (!history || history.length === 0) continue

      const historyPoints = history.map((h: any) => ({
        isoYear: h.iso_year,
        isoWeek: h.iso_week,
        qty:     h.qty,
        channel: h.channel as 'B2B' | 'B2C',
      }))

      const startFrom = addIsoWeeks(...Object.values(dateToIsoWeek(new Date())) as [number, number], 1)

      // Load confirmed stockout weeks from weekly_atp_snapshot view
      const { data: atpData } = await supabase
        .from('weekly_atp_snapshot')
        .select('iso_year, iso_week, min_atp')
        .eq('sku', sku)

      const stockoutWeeks = new Set<string>()
      for (const row of atpData ?? []) {
        if (row.min_atp === 0) stockoutWeeks.add(`${row.iso_year}-${row.iso_week}`)
      }
      const hasAtpData = (atpData ?? []).length > 0

      const result = generateForecast(sku, historyPoints, startFrom,
        hasAtpData ? stockoutWeeks : undefined
      )
      forecastSummary[sku] = { model: result.model, historyWeeks: result.historyWeeks, cappedWeeks: result.cappedWeeks, mape: result.mape }

      // ── Management seasonal index for ASP>0 SKUs ──────────────
      // sales_forecast table stores monthly revenue as wide columns:
      // may_26, jun_26, jul_26 ... mar_27 per brand row.
      // Use the latest submission for this brand as seasonal weights.
      const skuAsp = Number(masterSkus?.find((m: any) => m.sku === sku)?.avg_selling_price ?? 0)
      let forecastPoints = result.points

      if (skuAsp > 0) {
        const skuBrand = skuBrandMap.get(sku) ?? ''

        const { data: gsheetRows } = await supabase
          .from('sales_forecast')
          .select('may_26, jun_26, jul_26, aug_26, sep_26, oct_26, nov_26, dec_26, jan_27, feb_27, mar_27, apr_27')
          .eq('brand', skuBrand)
          .order('submitted_at', { ascending: false })
          .limit(1)

        const gsheet = gsheetRows?.[0]

        if (gsheet) {
          // Map column name → YYYY-MM key
          const colToMonth: Record<string, string> = {
            may_26: '2026-05', jun_26: '2026-06', jul_26: '2026-07',
            aug_26: '2026-08', sep_26: '2026-09', oct_26: '2026-10',
            nov_26: '2026-11', dec_26: '2026-12', jan_27: '2027-01',
            feb_27: '2027-02', mar_27: '2027-03', apr_27: '2027-04',
          }

          const monthRevMap = new Map<string, number>()
          for (const [col, monthKey] of Object.entries(colToMonth)) {
            const val = Number(gsheet[col] ?? 0)
            if (val > 0) monthRevMap.set(monthKey, val)
          }

          const totalRevenue = Array.from(monthRevMap.values()).reduce((a, b) => a + b, 0)

          if (totalRevenue > 0 && monthRevMap.size > 0) {
            const avgMonthlyRev = totalRevenue / monthRevMap.size

            forecastPoints = result.points.map(p => {
              const monthKey = p.weekStartDate.substring(0, 7) // 'YYYY-MM' from 'YYYY-MM-DD'
              const monthRev = monthRevMap.get(monthKey)
              if (!monthRev) return p

              const seasonalIndex = monthRev / avgMonthlyRev
              return {
                ...p,
                forecastQty: Math.max(0, Math.round(p.forecastQty * seasonalIndex)),
                lowerBound:  Math.max(0, Math.round(p.lowerBound  * seasonalIndex)),
                upperBound:  Math.max(0, Math.round(p.upperBound  * seasonalIndex)),
              }
            })
          }
        }
      }

      const { data: wkCalendar } = await supabase.from('week_calendar')
        .select('wk_label, monday_date').in('monday_date', forecastPoints.map(p => p.weekStartDate))

      const calMap = new Map((wkCalendar ?? []).map((w: any) => [w.monday_date, w.wk_label]))
      const brand  = skuBrandMap.get(sku) ?? 'Unknown'

      await supabase.from('demand_forecast').upsert(
        forecastPoints.map(p => ({
          sku, brand,
          iso_year:        p.isoYear,
          iso_week:        p.isoWeek,
          week_start_date: p.weekStartDate,
          wk_label:        calMap.get(p.weekStartDate) ?? p.wkLabel,
          forecast_qty:    p.forecastQty,
          lower_bound:     p.lowerBound,
          upper_bound:     p.upperBound,
          model_used:      skuAsp > 0 ? `${result.model}_mgmt_seasonal` : result.model,
          history_weeks:   result.historyWeeks,
          generated_at:    new Date().toISOString(),
        })),
        { onConflict: 'sku,iso_year,iso_week' }
      )
    }

    return NextResponse.json({
      success: true, channel,
      parseStats: { totalLineItems: rows.length, validLineItems: validRows.length, skippedLineItems: rows.length - validRows.length, dateRange: null },
      salesHistory: { weeklyRowsProcessed: validRows.length, upserted: upsertedCount },
      forecast: { skusUpdated: affectedSkus.length, summary: forecastSummary },
      warnings: { unknownSkus },
    })

  } catch (err: any) {
    console.error('sales-history-upload error:', err)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
