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

// ── Holt-Winters Double Exponential Smoothing ───────────────

function hwSSE(series: number[], alpha: number, beta: number): number {
  let level = series[0]
  let trend = series[1] - series[0]
  let sse = 0
  for (let i = 1; i < series.length; i++) {
    const prevLevel = level
    level = alpha * series[i] + (1 - alpha) * (level + trend)
    trend = beta * (level - prevLevel) + (1 - beta) * trend
    sse += (series[i] - (level + trend)) ** 2
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
    const fitted = level + trend
    level = alpha * series[i] + (1 - alpha) * (level + trend)
    trend = beta * (level - prevLevel) + (1 - beta) * trend
    residuals.push(series[i] - fitted)
  }

  const forecast: number[] = []
  for (let h = 1; h <= horizon; h++) {
    forecast.push(Math.max(0, level + h * trend))
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

// ── Outlier Capping ─────────────────────────────────────────

/**
 * Cap outlier weeks at mean + sigmaThreshold × stdDev using a
 * rolling 12-week trailing window per point.
 *
 * Uses trailing window (not global mean) so a growing SKU's recent
 * high weeks aren't incorrectly flagged against the full-history mean.
 * Capped values are replaced with the trailing mean so trend signal
 * is preserved without the spike distorting the HW level parameter.
 */
export function capOutliers(
  series: number[],
  sigmaThreshold = 3,
  windowSize = 12
): { capped: number[]; cappedIndices: number[] } {
  const result = [...series]
  const cappedIndices: number[] = []

  for (let i = windowSize; i < series.length; i++) {
    const window = series.slice(i - windowSize, i)
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length
    const stdDev = Math.sqrt(variance)
    const ceiling = mean + sigmaThreshold * stdDev

    if (series[i] > ceiling && ceiling > 0) {
      result[i] = Math.round(mean)
      cappedIndices.push(i)
    }
  }

  return { capped: result, cappedIndices }
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

// ── Main Entry Point ────────────────────────────────────────

export interface HistoryPoint {
  isoYear: number
  isoWeek: number
  qty: number
}

/**
 * Generate 26-week demand forecast for a single SKU.
 *
 * @param sku        SKU code
 * @param history    Weekly actuals from sales_history (B2B+B2C combined), any order
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
  const rawSeries = buildDenseSeries(sorted)
  const { capped: series, cappedIndices } = capOutliers(rawSeries)
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

  // Determine forecast start week
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

  return { sku, model, historyWeeks: n, cappedWeeks: cappedIndices.length, points, mape }
}
