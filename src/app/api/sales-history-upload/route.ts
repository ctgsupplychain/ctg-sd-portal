// ============================================================
// POST /api/sales-history-upload
// Accepts B2B or B2C WMS order report (XLS/XLSX)
// ETL: parse → weekly rollup → upsert sales_history → generate forecast
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseOrderReport, Channel } from '@/lib/forecasting/parse-order-report'
import { generateForecast, dateToIsoWeek, addIsoWeeks, isoWeekToMonday } from '@/lib/forecasting/holt-winters'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()

    if (!['admin', 'supply_chain'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Parse form data ───────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File
    const channelRaw = (formData.get('channel') as string)?.toUpperCase()

    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    if (!['B2B', 'B2C'].includes(channelRaw)) {
      return NextResponse.json({ error: 'channel must be B2B or B2C' }, { status: 400 })
    }

    const channel = channelRaw as Channel

    // ── Load WMS→master SKU mapping ───────────────────────
    const { data: mappings } = await supabase
      .from('sku_wms_mapping')
      .select('wms_sku, master_sku')

    const wmsToMaster = new Map<string, string>(
      (mappings ?? []).map((m: any) => [m.wms_sku, m.master_sku])
    )

    // Load master_sku list to filter non-master SKUs
    const { data: masterSkus } = await supabase
      .from('master_sku')
      .select('sku, brand, company')

    const masterSkuSet = new Set((masterSkus ?? []).map((m: any) => m.sku))
    const skuBrandMap = new Map((masterSkus ?? []).map((m: any) => [m.sku, m.brand]))

    // ── Parse the uploaded file ───────────────────────────
    const buffer = await file.arrayBuffer()
    const parseResult = parseOrderReport(buffer, channel, wmsToMaster)

    // Filter to known master SKUs only
    const validRows = parseResult.rows.filter(r => masterSkuSet.has(r.sku))
    const unknownSkus = [
      ...new Set(parseResult.rows
        .filter(r => !masterSkuSet.has(r.sku))
        .map(r => r.sku))
    ]

    if (validRows.length === 0) {
      return NextResponse.json({
        error: 'No rows matched known master SKUs',
        unknownSkus,
        parseStats: {
          totalLineItems: parseResult.totalLineItems,
          skippedLineItems: parseResult.skippedLineItems,
        }
      }, { status: 422 })
    }

    // ── Upsert into sales_history ─────────────────────────
    const historyRecords = validRows.map(r => ({
      brand:           skuBrandMap.get(r.sku) ?? r.brand,
      company:         r.company,
      sku:             r.sku,
      channel:         r.channel,
      iso_year:        r.isoYear,
      iso_week:        r.isoWeek,
      week_start_date: r.weekStartDate,
      qty:             r.qty,
      order_count:     r.orderCount,
      source:          'WMS Upload',
      uploaded_by:     user.email,
      uploaded_at:     new Date().toISOString(),
    }))

    const { error: upsertErr, count: upsertedCount } = await supabase
      .from('sales_history')
      .upsert(historyRecords, {
        onConflict: 'sku,channel,iso_year,iso_week',
        count: 'exact',
      })

    if (upsertErr) {
      console.error('sales_history upsert error:', upsertErr)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    // ── Regenerate demand forecast for affected SKUs ───────
    const affectedSkus = [...new Set(validRows.map(r => r.sku))]
    const forecastSummary: Record<string, {
      model: string; historyWeeks: number; mape?: number
    }> = {}

    for (const sku of affectedSkus) {
      // Load full history for this SKU (B2B + B2C combined)
      const { data: history } = await supabase
        .from('sales_history')
        .select('iso_year, iso_week, qty')
        .eq('sku', sku)
        .order('iso_year', { ascending: true })
        .order('iso_week', { ascending: true })

      if (!history || history.length === 0) continue

      // Aggregate B2B + B2C per week
      const weekMap = new Map<string, number>()
      for (const h of history) {
        const key = `${h.iso_year}-${h.iso_week}`
        weekMap.set(key, (weekMap.get(key) ?? 0) + h.qty)
      }

      const historyPoints = Array.from(weekMap.entries()).map(([key, qty]) => {
        const [isoYear, isoWeek] = key.split('-').map(Number)
        return { isoYear, isoWeek, qty }
      })

      // Forecast starts from next week
      const now = new Date()
      const curIso = dateToIsoWeek(now)
      const startFrom = addIsoWeeks(curIso.isoYear, curIso.isoWeek, 1)

      const result = generateForecast(sku, historyPoints, startFrom)
      forecastSummary[sku] = {
        model: result.model,
        historyWeeks: result.historyWeeks,
        cappedWeeks: result.cappedWeeks,
        mape: result.mape,
      }

      // Resolve WK labels from week_calendar if available
      const forecastWeekStarts = result.points.map(p => p.weekStartDate)
      const { data: wkCalendar } = await supabase
        .from('week_calendar')
        .select('wk_label, monday_date')
        .in('monday_date', forecastWeekStarts)

      const calMap = new Map(
        (wkCalendar ?? []).map((w: any) => [w.monday_date, w.wk_label])
      )

      const brand = skuBrandMap.get(sku) ?? 'Unknown'

      const forecastRecords = result.points.map(p => ({
        sku,
        brand,
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
      }))

      const { error: fcErr } = await supabase
        .from('demand_forecast')
        .upsert(forecastRecords, { onConflict: 'sku,iso_year,iso_week' })

      if (fcErr) {
        console.error(`Forecast upsert error for ${sku}:`, fcErr)
      }
    }

    return NextResponse.json({
      success: true,
      channel,
      parseStats: {
        totalLineItems:   parseResult.totalLineItems,
        validLineItems:   parseResult.totalLineItems - parseResult.skippedLineItems,
        skippedLineItems: parseResult.skippedLineItems,
        skippedStatuses:  parseResult.skippedStatuses,
        dateRange:        parseResult.dateRange,
      },
      salesHistory: {
        weeklyRowsProcessed: validRows.length,
        upserted: upsertedCount,
      },
      forecast: {
        skusUpdated: affectedSkus.length,
        summary: forecastSummary,
      },
      warnings: {
        unknownSkus,
      }
    })

  } catch (err: any) {
    console.error('sales-history-upload error:', err)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
