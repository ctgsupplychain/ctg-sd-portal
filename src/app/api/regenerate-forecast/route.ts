// ============================================================
// POST /api/regenerate-forecast
// Regenerates demand_forecast from existing sales_history data.
// No re-upload needed — reads what's already in the DB.
// Body: { brand?: string, skus?: string[] }
//   brand — regenerate all SKUs for a brand
//   skus  — regenerate specific SKUs only
//   (omit both to regenerate all SKUs in sales_history)
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

    // ── Resolve which SKUs to regenerate ─────────────────
    const body = await req.json().catch(() => ({}))
    const { brand, skus: requestedSkus } = body as { brand?: string; skus?: string[] }

    let targetSkus: string[]

    if (requestedSkus?.length) {
      targetSkus = requestedSkus
    } else if (brand) {
      const { data } = await supabase
        .from('sales_history').select('sku').eq('brand', brand)
      targetSkus = [...new Set((data ?? []).map((r: any) => r.sku))]
    } else {
      const { data } = await supabase
        .from('sales_history').select('sku')
      targetSkus = [...new Set((data ?? []).map((r: any) => r.sku))]
    }

    if (targetSkus.length === 0) {
      return NextResponse.json({ error: 'No SKUs found in sales_history for the given filter' }, { status: 404 })
    }

    // ── Load master SKU data for ASP + brand lookup ───────
    const { data: masterSkus } = await supabase
      .from('master_sku').select('sku, brand, avg_selling_price')
    const skuBrandMap = new Map((masterSkus ?? []).map((m: any) => [m.sku, m.brand]))
    const skuAspMap   = new Map((masterSkus ?? []).map((m: any) => [m.sku, Number(m.avg_selling_price ?? 0)]))

    // ── Regenerate per SKU ────────────────────────────────
    const summary: Record<string, { model: string; historyWeeks: number; cappedWeeks: number; mape?: number }> = {}
    const errors: Record<string, string> = {}

    for (const sku of targetSkus) {
      try {
        // Load full history with channel info
        const { data: history } = await supabase
          .from('sales_history')
          .select('iso_year, iso_week, qty, channel')
          .eq('sku', sku)
          .order('iso_year', { ascending: true })
          .order('iso_week', { ascending: true })

        if (!history || history.length === 0) continue

        const historyPoints = history.map((h: any) => ({
          isoYear: h.iso_year,
          isoWeek: h.iso_week,
          qty:     h.qty,
          channel: h.channel as 'B2B' | 'B2C',
        }))

        const curIso    = dateToIsoWeek(new Date())
        const startFrom = addIsoWeeks(curIso.isoYear, curIso.isoWeek, 1)
        const result    = generateForecast(sku, historyPoints, startFrom)

        summary[sku] = {
          model:        result.model,
          historyWeeks: result.historyWeeks,
          cappedWeeks:  result.cappedWeeks,
          mape:         result.mape,
        }

        // ── Management seasonal index for ASP>0 SKUs ─────
        const asp      = skuAspMap.get(sku) ?? 0
        const skuBrand = skuBrandMap.get(sku) ?? ''
        let forecastPoints = result.points

        if (asp > 0 && skuBrand) {
          const { data: gsheetRows } = await supabase
            .from('sales_forecast')
            .select('may_26, jun_26, jul_26, aug_26, sep_26, oct_26, nov_26, dec_26, jan_27, feb_27, mar_27, apr_27')
            .eq('brand', skuBrand)
            .order('submitted_at', { ascending: false })
            .limit(1)

          const gsheet = gsheetRows?.[0]
          if (gsheet) {
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
                const monthKey = p.weekStartDate.substring(0, 7)
                const monthRev = monthRevMap.get(monthKey)
                if (!monthRev) return p
                const idx = monthRev / avgMonthlyRev
                return {
                  ...p,
                  forecastQty: Math.max(0, Math.round(p.forecastQty * idx)),
                  lowerBound:  Math.max(0, Math.round(p.lowerBound  * idx)),
                  upperBound:  Math.max(0, Math.round(p.upperBound  * idx)),
                }
              })
            }
          }
        }

        // ── Map week_start_date → wk_label ───────────────
        const { data: wkCalendar } = await supabase
          .from('week_calendar')
          .select('wk_label, monday_date')
          .in('monday_date', forecastPoints.map(p => p.weekStartDate))

        const calMap   = new Map((wkCalendar ?? []).map((w: any) => [w.monday_date, w.wk_label]))
        const brand    = skuBrandMap.get(sku) ?? 'Unknown'
        const modelStr = asp > 0 ? `${result.model}_mgmt_seasonal` : result.model

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
            model_used:      modelStr,
            history_weeks:   result.historyWeeks,
            generated_at:    new Date().toISOString(),
          })),
          { onConflict: 'sku,iso_year,iso_week' }
        )
      } catch (skuErr: any) {
        errors[sku] = skuErr.message
      }
    }

    return NextResponse.json({
      success: true,
      skusProcessed: targetSkus.length,
      skusUpdated:   Object.keys(summary).length,
      summary,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    })

  } catch (err: any) {
    console.error('regenerate-forecast error:', err)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
