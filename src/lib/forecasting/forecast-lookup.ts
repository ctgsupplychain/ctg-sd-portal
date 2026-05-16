// ============================================================
// Demand Forecast Lookup
// Provides getForecastFromDB() to replace historicalAvg fallback
// in sd-compute.ts for ASP=0 SKUs
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Load the latest demand forecast for a set of SKUs, keyed by wk_label.
 * Returns: Map<sku, Map<wkLabel, forecastQty>>
 *
 * Usage in sd-compute pipeline (server-side):
 *   const fcMap = await loadDemandForecast(['SDDLSC030', 'SDSDPD01S'])
 *   const qty = fcMap.get(sku)?.get(wkLabel) ?? historicalAvg
 */
export async function loadDemandForecast(
  skus: string[]
): Promise<Map<string, Map<string, number>>> {
  if (skus.length === 0) return new Map()

  const { data, error } = await supabase
    .from('demand_forecast')
    .select('sku, wk_label, forecast_qty')
    .in('sku', skus)

  if (error || !data) {
    console.error('demand_forecast load error:', error)
    return new Map()
  }

  const result = new Map<string, Map<string, number>>()
  for (const row of data) {
    if (!result.has(row.sku)) result.set(row.sku, new Map())
    result.get(row.sku)!.set(row.wk_label, row.forecast_qty)
  }

  return result
}

/**
 * Get forecast qty for a single SKU + week label.
 * Convenience wrapper — use loadDemandForecast() for batch (avoids N+1).
 */
export async function getForecastQtyFromDB(
  sku: string,
  wkLabel: string
): Promise<number | null> {
  const { data } = await supabase
    .from('demand_forecast')
    .select('forecast_qty')
    .eq('sku', sku)
    .eq('wk_label', wkLabel)
    .single()

  return data?.forecast_qty ?? null
}
