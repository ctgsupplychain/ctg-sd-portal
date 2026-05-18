// ============================================================
// CTG Demand Forecasting Engine
// Pure TypeScript — no external ML dependencies
//
// Strategy:
//   >= 16 weeks history → Holt-Winters Double Exponential Smoothing
//                          (trend + level; no seasonality — insufficient data for 52-wk cycle)
//    8–15 weeks history → Weighted Moving Average (recency-weighted)
//   < 8 weeks history  → Simple trailing average
//
// Output: 26 weekly forecast points per SKU with 80% confidence bounds
// ============================================================

export type ForecastModel = 'holt_winters' | 'wma' | 'avg'

export interface ForecastPoint {
  isoYear: number
  isoWeek: number
  weekStartDate: string   // YYYY-MM-DD (Monday)
  wkLabel: string         // e.g. 'WK22'
  forecastQty: number
  lowerBound: number
  upperBound: number
}

export interface ForecastResult {
  sku: string
  model: ForecastModel
  historyWeeks: number
  cappedWeeks: number       // number of outlier weeks replaced before model fitting
  points: ForecastPoint[]
  mape?: number           // Mean Absolute Percentage Error on last-4-week holdout
}

// ── ISO week utilities ──────────────────────────────────────

/** Returns Monday date of a given ISO year + week */
export function isoWeekToMonday(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const mondayWk1 = new Date(jan4)
  mondayWk1.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1))
  const result = new Date(mondayWk1)
  result.setUTCDate(mondayWk1.getUTCDate() + (isoWeek - 1) * 7)
  return result
}

/** Returns ISO year and week for a given date */
export function dateToIsoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayOfWeek = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek)
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const isoWeek = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + 1) / 7)
  return { isoYear: d.getUTCFullYear(), isoWeek }
}

/** Advance N weeks from an ISO week */
export function addIsoWeeks(
  isoYear: number,
  isoWeek: number,
  n: number
): { isoYear: number; isoWeek: number } {
  const monday = isoWeekToMonday(isoYear, isoWeek)
  monday.setUTCDate(monday.getUTCDate() + n * 7)
  return dateToIsoWeek(monday)
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function toWkLabel(isoWeek: number): string {
  return `WK${String(isoWeek).padStart(2, '0')}`
}

// ── Holt-Winters Double Exponential Smoothing (Damped Trend) ─
//
// Damping factor φ (phi) prevents runaway linear extrapolation.
// Forecast(h) = level + (φ + φ² + ... + φʰ) × trend
// φ=0.9 means trend contribution converges to level + 9×trend at infinity
// vs undamped which grows to level + h×trend indefinitely.

const PHI = 0.57  // damping factor — review monthly (0.57 brings WK26 near S&D plan level)

function hwSSE(series: number[], alpha: number, beta: number): number {
  let level = series[0]
  let trend = series[1] - series[0]
  let sse = 0
  for (let i = 1; i < series.length; i++) {
    const prevLevel = level
    const fitted = level + PHI * trend
    level = alpha * series[i] + (1 - alpha) * (level + PHI * trend)
    trend = beta * (level - prevLevel) + (1 - beta) * PHI * trend
    sse += (series[i] - fitted) ** 2
  }
  return sse
}

function hwFit(
  series: number[],
  alpha: number,
  beta: number,
  horizon: number
): { forecast: number[]; residuals: number[] } {
  let level = series[0]
  let trend = series[1] - series[0]
  const residuals: number[] = [0]

  for (let i = 1; i < series.length; i++) {
    const prevLevel = level
    const fitted = level + PHI * trend
    level = alpha * series[i] + (1 - alpha) * (level + PHI * trend)
    trend = beta * (level - prevLevel) + (1 - beta) * PHI * trend
    residuals.push(series[i] - fitted)
  }

  // Damped forecast: sum of geometric series φ + φ² + ... + φʰ
  const forecast: number[] = []
  let phiSum = 0
  for (let h = 1; h <= horizon; h++) {
    phiSum += Math.pow(PHI, h)
    forecast.push(Math.max(0, level + phiSum * trend))
  }

  return { forecast, residuals }
}

function holtWinters(
  series: number[],
  horizon: number
): { forecast: number[]; residuals: number[] } {
  let bestAlpha = 0.3, bestBeta = 0.1, bestSSE = Infinity

  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 5; b++) {
      const alpha = a / 10
      const beta = b / 10
      const sse = hwSSE(series, alpha, beta)
      if (sse < bestSSE) { bestSSE = sse; bestAlpha = alpha; bestBeta = beta }
    }
  }

  return hwFit(series, bestAlpha, bestBeta, horizon)
}

// ── Weighted Moving Average ─────────────────────────────────

function weightedMovingAverage(series: number[], horizon: number): {
  forecast: number[]
  residuals: number[]
} {
  const window = Math.min(8, series.length)
  const slice = series.slice(-window)
  const totalWeight = (window * (window + 1)) / 2
  const wma = slice.reduce((acc, v, i) => acc + v * (i + 1), 0) / totalWeight
  const forecast = Array(horizon).fill(Math.max(0, wma))
  const residuals = series.map(v => v - wma)
  return { forecast, residuals }
}

// ── Simple Average ──────────────────────────────────────────

function simpleAverage(series: number[], horizon: number): {
  forecast: number[]
  residuals: number[]
} {
  const avg = series.reduce((a, b) => a + b, 0) / series.length
  const forecast = Array(horizon).fill(Math.max(0, avg))
  const residuals = series.map(v => v - avg)
  return { forecast, residuals }
}

// ── Confidence Bounds (80% CI) ──────────────────────────────

function confidenceBounds(
  forecast: number[],
  residuals: number[]
): { lower: number[]; upper: number[] } {
  const Z = 1.28 // z-score for 80% CI
  const variance = residuals.length > 1
    ? residuals.reduce((s, r) => s + r ** 2, 0) / residuals.length
    : (forecast.reduce((a, b) => a + b, 0) / forecast.length * 0.2) ** 2
  const stdDev = Math.sqrt(variance)

  return {
    lower: forecast.map(f => Math.max(0, Math.round(f - Z * stdDev))),
    upper: forecast.map(f => Math.round(f + Z * stdDev)),
  }
}

// ── Channel-aware Outlier Capping ──────────────────────────

/**
 * Cap B2B outlier weeks before combining with B2C.
 *
 * Rationale: B2B spikes are typically event/campaign stock-outs where
 * the project owner takes a large bulk quantity to an event. These are
 * not representative of recurring demand. B2C is the true demand signal
 * and is never capped.
 *
 * Method: for each B2B week, if qty > trailing 12-week mean + 2σ,
 * replace with the trailing mean. Applied before B2B+B2C are combined.
 *
 * @param b2bSeries  Weekly B2B quantities, sorted ascending by week
 * @param windowSize Trailing window for mean/std calculation (default 12)
 * @returns Capped B2B series + indices of weeks that were capped
 */
export function capB2BOutliers(
  b2bSeries: number[],
  windowSize = 12
): { capped: number[]; cappedIndices: number[] } {
  const result = [...b2bSeries]
  const cappedIndices: number[] = []

  for (let i = windowSize; i < b2bSeries.length; i++) {
    const window = b2bSeries.slice(i - windowSize, i)
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length
    const stdDev = Math.sqrt(variance)
    const ceiling = mean + 2 * stdDev

    if (b2bSeries[i] > ceiling && ceiling > 0) {
      result[i] = Math.round(mean)
      cappedIndices.push(i)
    }
  }

  return { capped: result, cappedIndices }
}

/**
 * Combine B2B and B2C weekly series into a single demand series.
 * B2B outliers are capped first; B2C is used as-is.
 *
 * Both series must be aligned (same weeks, same length).
 * Missing weeks in either channel should be filled with 0 before calling.
 */
export function combineChannels(
  b2bSeries: number[],
  b2cSeries: number[]
): { combined: number[]; b2bCappedIndices: number[] } {
  const { capped: cappedB2B, cappedIndices } = capB2BOutliers(b2bSeries)
  const combined = cappedB2B.map((b2b, i) => b2b + (b2cSeries[i] ?? 0))
  return { combined, b2bCappedIndices: cappedIndices }
}

// ── Dense Series Builder ────────────────────────────────────

/** Fill gaps between history points with 0 to produce a continuous series */
function buildDenseSeries(sorted: HistoryPoint[]): number[] {
  if (sorted.length === 0) return []
  const lookup = new Map(sorted.map(p => [`${p.isoYear}-${p.isoWeek}`, p.qty]))
  const series: number[] = []
  let cur = { isoYear: sorted[0].isoYear, isoWeek: sorted[0].isoWeek }
  const last = sorted[sorted.length - 1]

  while (
    cur.isoYear < last.isoYear ||
    (cur.isoYear === last.isoYear && cur.isoWeek <= last.isoWeek)
  ) {
    series.push(lookup.get(`${cur.isoYear}-${cur.isoWeek}`) ?? 0)
    cur = addIsoWeeks(cur.isoYear, cur.isoWeek, 1)
  }

  return series
}

/**
 * Fill null gaps in a weekly series with the trailing 8-week average.
 * Prevents sparse gaps (e.g. stock-out weeks or WMS non-trading periods)
 * from being treated as zero demand, which distorts the HW trend.
 * Nulls at the start of the series use the first observed value.
 */
function fillGapsWithTrailingAvg(values: (number | null)[], window = 8): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) {
      result.push(values[i] as number)
    } else {
      // Trailing average of last `window` observed (non-null) values
      const observed = result.filter(v => v > 0)
      if (observed.length === 0) {
        // No prior data — look ahead for first non-null
        const ahead = values.slice(i + 1).find(v => v !== null)
        result.push(ahead ?? 0)
      } else {
        const slice = observed.slice(-window)
        result.push(Math.round(slice.reduce((a, b) => a + b, 0) / slice.length))
      }
    }
  }
  return result
}

// ── Main Entry Point ────────────────────────────────────────

export interface HistoryPoint {
  isoYear: number
  isoWeek: number
  qty: number
  channel?: 'B2B' | 'B2C'  // when provided, B2B outliers are capped; B2C is always used as-is
}

/**
 * Generate 26-week demand forecast for a single SKU.
 *
 * When history includes channel info, B2B event/campaign spikes are
 * capped (trailing 12-wk mean+2σ) before combining with B2C.
 * B2C is the true demand signal and is never modified.
 *
 * @param sku        SKU code
 * @param history    Weekly actuals from sales_history (any order)
 * @param startFrom  ISO week to start forecast from (default: current week + 1)
 */
export function generateForecast(
  sku: string,
  history: HistoryPoint[],
  startFrom?: { isoYear: number; isoWeek: number }
): ForecastResult {
  const HORIZON = 26

  const sorted = [...history].sort(
    (a, b) => a.isoYear * 100 + a.isoWeek - (b.isoYear * 100 + b.isoWeek)
  )

  if (sorted.length === 0) {
    return { sku, model: 'avg', historyWeeks: 0, cappedWeeks: 0, points: [], mape: undefined }
  }

  // Build dense aligned week list across full history range
  const firstWk = { isoYear: sorted[0].isoYear, isoWeek: sorted[0].isoWeek }
  const lastWk  = { isoYear: sorted[sorted.length-1].isoYear, isoWeek: sorted[sorted.length-1].isoWeek }
  const weeks: { isoYear: number; isoWeek: number }[] = []
  let cur = { ...firstWk }
  while (cur.isoYear < lastWk.isoYear || (cur.isoYear === lastWk.isoYear && cur.isoWeek <= lastWk.isoWeek)) {
    weeks.push({ ...cur })
    cur = addIsoWeeks(cur.isoYear, cur.isoWeek, 1)
  }

  const hasChannels = sorted.some(p => p.channel)
  let series: number[]
  let cappedWeeks = 0

  if (hasChannels) {
    // Separate B2B and B2C, cap B2B outliers, then combine
    const b2bMap = new Map<string, number>()
    const b2cMap = new Map<string, number>()
    for (const p of sorted) {
      const key = `${p.isoYear}-${p.isoWeek}`
      if (p.channel === 'B2B') b2bMap.set(key, (b2bMap.get(key) ?? 0) + p.qty)
      else                     b2cMap.set(key, (b2cMap.get(key) ?? 0) + p.qty)
    }

    // Fill gaps with trailing average (not zero) to avoid false downtrends
    const b2cValues = weeks.map(w => b2cMap.get(`${w.isoYear}-${w.isoWeek}`) ?? null)
    const b2cFilled = fillGapsWithTrailingAvg(b2cValues)
    const b2bValues = weeks.map(w => b2bMap.get(`${w.isoYear}-${w.isoWeek}`) ?? null)
    const b2bFilled = fillGapsWithTrailingAvg(b2bValues)

    const { combined, b2bCappedIndices } = combineChannels(b2bFilled, b2cFilled)
    series = combined
    cappedWeeks = b2bCappedIndices.length
  } else {
    // No channel info — aggregate directly, fill gaps with trailing avg
    const combinedMap = new Map<string, number>()
    for (const p of sorted) {
      const key = `${p.isoYear}-${p.isoWeek}`
      combinedMap.set(key, (combinedMap.get(key) ?? 0) + p.qty)
    }
    const rawValues = weeks.map(w => combinedMap.get(`${w.isoYear}-${w.isoWeek}`) ?? null)
    series = fillGapsWithTrailingAvg(rawValues)
  }

  const n = series.length

  let model: ForecastModel
  let rawForecast: number[]
  let residuals: number[]

  if (n >= 16) {
    model = 'holt_winters'
    ;({ forecast: rawForecast, residuals } = holtWinters(series, HORIZON))
  } else if (n >= 8) {
    model = 'wma'
    ;({ forecast: rawForecast, residuals } = weightedMovingAverage(series, HORIZON))
  } else {
    model = 'avg'
    ;({ forecast: rawForecast, residuals } = simpleAverage(series, HORIZON))
  }

  const { lower, upper } = confidenceBounds(rawForecast, residuals)

  let { isoYear: curYear, isoWeek: curWeek } = startFrom ?? (() => {
    const iso = dateToIsoWeek(new Date())
    return addIsoWeeks(iso.isoYear, iso.isoWeek, 1)
  })()

  const points: ForecastPoint[] = rawForecast.map((_, h) => {
    const { isoYear, isoWeek } = addIsoWeeks(curYear, curWeek, h)
    const monday = isoWeekToMonday(isoYear, isoWeek)
    return {
      isoYear,
      isoWeek,
      weekStartDate: toDateStr(monday),
      wkLabel: toWkLabel(isoWeek),
      forecastQty: Math.round(rawForecast[h]),
      lowerBound: lower[h],
      upperBound: upper[h],
    }
  })

  // MAPE holdout on last 4 weeks
  let mape: number | undefined
  if (n >= 8) {
    const trainSeries = series.slice(0, -4)
    const holdout = series.slice(-4)
    const { forecast: hindcast } = n >= 16
      ? holtWinters(trainSeries, 4)
      : weightedMovingAverage(trainSeries, 4)
    const mapeVals = holdout
      .map((actual, i) => actual > 0 ? Math.abs(actual - hindcast[i]) / actual : null)
      .filter((v): v is number => v !== null)
    if (mapeVals.length > 0) {
      mape = Math.round((mapeVals.reduce((a, b) => a + b, 0) / mapeVals.length) * 1000) / 10
    }
  }

  return { sku, model, historyWeeks: n, cappedWeeks, points, mape }
}
