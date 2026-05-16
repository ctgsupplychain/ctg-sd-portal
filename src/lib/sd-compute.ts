// ============================================================
// CTG S&D Core Algorithm
// Computes weekly balance, WoC, and alert flags per SKU
// ============================================================

export const MONTH_WEEKS: Record<number, number> = {
  1:4, 2:4, 3:5, 4:4, 5:4, 6:5,
  7:4, 8:4, 9:5, 10:4, 11:4, 12:5
}

export const MONTHLY_FORECAST_COLS: Record<string, [number, number]> = {
  'apr_26': [2026, 4], 'may_26': [2026, 5], 'jun_26': [2026, 6],
  'jul_26': [2026, 7], 'aug_26': [2026, 8], 'sep_26': [2026, 9],
  'oct_26': [2026, 10], 'nov_26': [2026, 11], 'dec_26': [2026, 12],
  'jan_27': [2027, 1], 'feb_27': [2027, 2], 'mar_27': [2027, 3],
}

export interface WeekInfo {
  label: string
  year: number
  month: number
  monthLabel: string
  wkInYear: number
  wkInMonth: number
  mondayDate: string
  weeksInMonth: number
}

export interface SkuMaster {
  sku: string
  description: string
  brand: string
  moq: number
  uom: string
  leadTimeWk: number
  avgSellingPrice: number
  safetyStock: number
  bufferStock: number
  status: string
}

export interface WeeklyRow {
  wkLabel: string
  forecastRm: number
  forecastQty: number
  supplyCommit: number
  supplyUncommit: number
  balance: number
}

export interface SkuSdResult {
  sku: SkuMaster
  onHand: number
  weeksOfCover: number
  flag: 'STOCKOUT' | 'PULL_IN' | 'ORDER_NOW' | 'MONITOR' | 'OK'
  weeks: WeeklyRow[]
}

// Compute weekly forecast qty for a SKU
function getForecastQty(
  sku: SkuMaster,
  year: number,
  month: number,
  wkLabel: string,
  forecast: Record<string, number> | null,
  historicalAvg: number,
  demandForecast: Map<string, number> | null   // wkLabel → qty from demand_forecast table
): number {
  const wksInMonth = MONTH_WEEKS[month] || 4

  if (sku.avgSellingPrice > 0 && forecast) {
    // ASP > 0: use Google Sheet forecast (Revenue / ASP model)
    const colKey = Object.entries(MONTHLY_FORECAST_COLS).find(
      ([, [y, m]]) => y === year && m === month
    )?.[0]
    if (colKey && forecast[colKey]) {
      const monthlyRm = forecast[colKey]
      return Math.ceil((monthlyRm * 1000) / sku.avgSellingPrice / wksInMonth)
    }
    return 0
  } else {
    // ASP = 0: priority order:
    //   1. Statistical demand forecast (from demand_forecast table)
    //   2. Trailing historical average (legacy fallback)
    //   3. Zero
    const statForecast = demandForecast?.get(wkLabel)
    if (statForecast !== undefined && statForecast > 0) return statForecast
    return Math.ceil(historicalAvg)
  }
}

// Main S&D computation function
export function computeSD(params: {
  sku: SkuMaster
  onHand: number
  weeks: WeekInfo[]
  forecast: Record<string, number> | null
  historicalAvg: number
  demandForecast?: Map<string, number> | null  // wkLabel → qty from demand_forecast table
  supplyCommits: Record<string, number>        // wkLabel → qty
  supplyUncommits: Record<string, number>      // wkLabel → qty
  currentWk: string
  thresholdOrderNow: number   // default 4
  thresholdMonitor: number    // default 8
}): SkuSdResult {
  const {
    sku, onHand, weeks, forecast, historicalAvg,
    demandForecast = null,
    supplyCommits, supplyUncommits, currentWk,
    thresholdOrderNow = 4, thresholdMonitor = 8
  } = params

  let balance = onHand
  const weeklyRows: WeeklyRow[] = []

  for (const wk of weeks) {
    const forecastQty = getForecastQty(sku, wk.year, wk.month, wk.label, forecast, historicalAvg, demandForecast)
    const commit   = supplyCommits[wk.label]   || 0
    const uncommit = supplyUncommits[wk.label] || 0
    const forecastRm = sku.avgSellingPrice > 0 && forecast
      ? (() => {
          const colKey = Object.entries(MONTHLY_FORECAST_COLS).find(
            ([, [y, m]]) => y === wk.year && m === wk.month
          )?.[0]
          return colKey && forecast[colKey]
            ? Math.round((forecast[colKey] / (MONTH_WEEKS[wk.month] || 4)) * 10) / 10
            : 0
        })()
      : 0

    balance = balance + commit - forecastQty

    weeklyRows.push({
      wkLabel: wk.label,
      forecastRm,
      forecastQty,
      supplyCommit: commit,
      supplyUncommit: uncommit,
      balance,
    })
  }

  // Weeks of Cover: current balance / avg demand next 4 weeks
  const curIdx = weeks.findIndex(w => w.label === currentWk)
  const curBalance = curIdx >= 0 ? weeklyRows[curIdx]?.balance ?? onHand : onHand
  const next4Demand = weeklyRows
    .slice(curIdx >= 0 ? curIdx : 0, (curIdx >= 0 ? curIdx : 0) + 4)
    .map(r => r.forecastQty)
  const avgDemand = next4Demand.length > 0
    ? next4Demand.reduce((a, b) => a + b, 0) / next4Demand.length
    : 0
  const woc = avgDemand > 0 ? curBalance / avgDemand : 0

  // Check for open supply in pipeline
  const hasOpenSupply = Object.values(supplyCommits).some(q => q > 0) ||
                        Object.values(supplyUncommits).some(q => q > 0)

  // Determine flag
  let flag: SkuSdResult['flag']
  if (curBalance <= 0) {
    flag = 'STOCKOUT'
  } else if (woc <= thresholdOrderNow) {
    flag = hasOpenSupply ? 'PULL_IN' : 'ORDER_NOW'
  } else if (woc <= thresholdMonitor) {
    flag = 'MONITOR'
  } else {
    flag = 'OK'
  }

  return {
    sku,
    onHand,
    weeksOfCover: Math.round(woc * 10) / 10,
    flag,
    weeks: weeklyRows,
  }
}

// Flag display helpers
export const FLAG_DISPLAY: Record<SkuSdResult['flag'], { emoji: string; label: string; color: string }> = {
  STOCKOUT:  { emoji: '🔴', label: 'STOCKOUT',   color: '#B42318' },
  PULL_IN:   { emoji: '⚡', label: 'PULL IN',    color: '#B54708' },
  ORDER_NOW: { emoji: '🟠', label: 'ORDER NOW',  color: '#B54708' },
  MONITOR:   { emoji: '🟡', label: 'MONITOR',    color: '#854D0E' },
  OK:        { emoji: '🟢', label: 'OK',         color: '#166534' },
}
