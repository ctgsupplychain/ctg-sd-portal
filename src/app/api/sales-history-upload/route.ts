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
        .from('sales_history').select('iso_year, iso_week, qty').eq('sku', sku)
        .order('iso_year', { ascending: true }).order('iso_week', { ascending: true })

      if (!history || history.length === 0) continue

      const weekMap = new Map<string, number>()
      for (const h of history) {
        const key = `${h.iso_year}-${h.iso_week}`
        weekMap.set(key, (weekMap.get(key) ?? 0) + h.qty)
      }

      const historyPoints = Array.from(weekMap.entries()).map(([key, qty]) => {
        const [isoYear, isoWeek] = key.split('-').map(Number)
        return { isoYear, isoWeek, qty }
      })

      const startFrom = addIsoWeeks(...Object.values(dateToIsoWeek(new Date())) as [number, number], 1)
      const result = generateForecast(sku, historyPoints, startFrom)
      forecastSummary[sku] = { model: result.model, historyWeeks: result.historyWeeks, cappedWeeks: result.cappedWeeks, mape: result.mape }

      const { data: wkCalendar } = await supabase.from('week_calendar')
        .select('wk_label, monday_date').in('monday_date', result.points.map(p => p.weekStartDate))

      const calMap = new Map((wkCalendar ?? []).map((w: any) => [w.monday_date, w.wk_label]))
      const brand  = skuBrandMap.get(sku) ?? 'Unknown'

      await supabase.from('demand_forecast').upsert(
        result.points.map(p => ({
          sku, brand,
          iso_year:        p.isoYear,
          iso_week:        p.isoWeek,
          week_start_date: p.weekStartDate,
          wk_label:        calMap.get(p.weekStartDate) ?? p.wkLabel,
          forecast_qty:    p.forecastQty,
          lower_bound:     p.lowerBound,
          upper_bound:     p.upperBound,
          model_used:      result.model,
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
