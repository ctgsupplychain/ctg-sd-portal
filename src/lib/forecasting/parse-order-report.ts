// ============================================================
// WMS Order Report Parser
// Handles B2B and B2C XLS/XLSX exports from Packxpert WMS
//
// Valid statuses (demand-confirmed):
//   delivered, dispatched, manifest_created, awaiting_dispatch
//
// Excluded:
//   cancelled, cancelled_putaway, return_completed, return_assigned,
//   return_order, unassigned
//
// Roll-up: order line items → ISO week totals per SKU
// Dedup: order_number + sku is unique — safe to re-upload
// ============================================================

import * as XLSX from 'xlsx'
import { dateToIsoWeek, isoWeekToMonday } from './holt-winters'

export type Channel = 'B2B' | 'B2C'

export interface ParsedWeeklyRow {
  brand: string
  company: string
  sku: string                 // master_sku key (may need WMS→master mapping)
  channel: Channel
  isoYear: number
  isoWeek: number
  weekStartDate: string       // YYYY-MM-DD Monday
  qty: number
  orderCount: number
}

export interface ParseResult {
  rows: ParsedWeeklyRow[]
  totalLineItems: number
  skippedLineItems: number
  skippedStatuses: Record<string, number>
  unknownSkus: string[]
  dateRange: { min: string; max: string } | null
}

// Statuses that represent confirmed demand
const VALID_STATUSES = new Set([
  'delivered',
  'dispatched',
  'manifest_created',
  'awaiting_dispatch',
])

/**
 * Parse a WMS order report buffer and return weekly demand rows.
 *
 * @param buffer   ArrayBuffer of the XLS/XLSX file
 * @param channel  'B2B' or 'B2C'
 * @param wmsToMasterSku  Optional map of WMS SKU → master_sku (e.g. SDSDCA05 → SDSDCA05S)
 */
export function parseOrderReport(
  buffer: ArrayBuffer,
  channel: Channel,
  wmsToMasterSku?: Map<string, string>
): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null })

  // Accumulator: key = `sku|isoYear|isoWeek`
  const weekMap = new Map<string, {
    brand: string; company: string; sku: string; channel: Channel
    isoYear: number; isoWeek: number; weekStartDate: string
    qty: number; orderCount: number; orderNums: Set<string>
  }>()

  const skippedStatuses: Record<string, number> = {}
  const unknownSkuSet = new Set<string>()
  let totalLineItems = 0
  let skippedLineItems = 0
  const parsedDates: Date[] = []

  for (const row of rawRows) {
    totalLineItems++

    // Status filter
    const status = String(row['Order Status'] ?? '').trim().toLowerCase()
    if (!VALID_STATUSES.has(status)) {
      skippedStatuses[status] = (skippedStatuses[status] ?? 0) + 1
      skippedLineItems++
      continue
    }

    // SKU resolution
    const rawSku = String(row['Seller Sku'] ?? '').trim().toUpperCase()
    if (!rawSku) { skippedLineItems++; continue }
    const masterSku = wmsToMasterSku?.get(rawSku) ?? rawSku

    // Date parsing — format: 'DD/MM/YYYY, HH:MM:SS'
    const orderDateRaw = String(row['Order Date'] ?? '').trim()
    if (!orderDateRaw) { skippedLineItems++; continue }

    const orderDate = parseWmsDate(orderDateRaw)
    if (!orderDate) { skippedLineItems++; continue }

    parsedDates.push(orderDate)

    const { isoYear, isoWeek } = dateToIsoWeek(orderDate)
    const monday = isoWeekToMonday(isoYear, isoWeek)
    const weekStartDate = monday.toISOString().split('T')[0]

    // Quantity
    const qty = Number(row['Ordered Quantity'] ?? 0)
    if (qty <= 0) { skippedLineItems++; continue }

    // Brand / Company
    const company = String(row['Company'] ?? '').trim() || 'UNKNOWN'
    const brand = resolveBrand(company)

    // Order number for dedup tracking
    const orderNum = String(row['Order Number'] ?? '').trim()

    const key = `${masterSku}|${isoYear}|${isoWeek}`
    const existing = weekMap.get(key)

    if (existing) {
      existing.qty += qty
      if (orderNum) existing.orderNums.add(orderNum)
    } else {
      const orderNums = new Set<string>()
      if (orderNum) orderNums.add(orderNum)
      weekMap.set(key, {
        brand, company, sku: masterSku, channel,
        isoYear, isoWeek, weekStartDate,
        qty, orderCount: 0, orderNums,
      })
    }
  }

  // Finalise rows
  const rows: ParsedWeeklyRow[] = Array.from(weekMap.values()).map(entry => ({
    brand: entry.brand,
    company: entry.company,
    sku: entry.sku,
    channel: entry.channel,
    isoYear: entry.isoYear,
    isoWeek: entry.isoWeek,
    weekStartDate: entry.weekStartDate,
    qty: entry.qty,
    orderCount: entry.orderNums.size,
  }))

  // Date range
  let dateRange: { min: string; max: string } | null = null
  if (parsedDates.length > 0) {
    const sorted = parsedDates.sort((a, b) => a.getTime() - b.getTime())
    dateRange = {
      min: sorted[0].toISOString().split('T')[0],
      max: sorted[sorted.length - 1].toISOString().split('T')[0],
    }
  }

  return {
    rows,
    totalLineItems,
    skippedLineItems,
    skippedStatuses,
    unknownSkus: Array.from(unknownSkuSet),
    dateRange,
  }
}

/** Parse WMS date format: 'DD/MM/YYYY, HH:MM:SS' or 'DD/MM/YYYY HH:MM:SS' */
function parseWmsDate(raw: string): Date | null {
  try {
    // Normalise: remove comma, split on space
    const cleaned = raw.replace(',', '').trim()
    const [datePart] = cleaned.split(' ')
    const [dd, mm, yyyy] = datePart.split('/')
    if (!dd || !mm || !yyyy) return null
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
    if (isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

/** Map company code → brand name (expand as new brands onboard) */
function resolveBrand(company: string): string {
  const c = company.toUpperCase().trim()
  if (c === 'SKINDAE' || c === 'SKINDAE') return 'SkinDae'
  if (c === 'NATURELISH') return 'Naturelish'
  if (c === 'IPROCARE') return 'IProcare'
  if (c === 'MEJORECARE') return 'Mejorecare'
  if (c === 'BONLIFE') return 'Bonlife'
  return company  // fallback: use as-is
}
