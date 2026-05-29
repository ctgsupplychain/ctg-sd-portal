import { PriceTier, BomRow, CostResult } from './plm-types'

export function getTierPrice(tiers: PriceTier[], orderQty: number): { price: number; idx: number } | null {
  if (!tiers || tiers.length === 0) return null
  let best = tiers[0]
  let idx = 0
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].min_qty <= orderQty) { best = tiers[i]; idx = i }
  }
  return { price: best.unit_price, idx }
}

export function computeCosts(
  bomRows: BomRow[],
  fgMoq: number,
  freightPct: number,
  taxPct: number
): CostResult[] {
  return bomRows.map(r => {
    const childOrderQty = fgMoq * r.qty_per_fg
    const tiers = r.price_tiers ?? []
    const tierResult = getTierPrice(tiers, childOrderQty)
    const unitPrice = tierResult?.price ?? null
    const activeTierIdx = tierResult?.idx ?? 0
    const extMat = unitPrice !== null ? +(r.qty_per_fg * unitPrice).toFixed(4) : null
    const extFreight = extMat !== null ? +(extMat * freightPct / 100).toFixed(4) : null
    const extTax = extMat !== null ? +((extMat + (extFreight ?? 0)) * taxPct / 100).toFixed(4) : null
    const extLanded = extMat !== null
      ? +((extMat ?? 0) + (extFreight ?? 0) + (extTax ?? 0)).toFixed(4)
      : null
    return {
      component_pn: r.component_pn,
      qty_per_fg: r.qty_per_fg,
      uom: r.uom,
      unit_price: unitPrice,
      ext_mat: extMat,
      ext_freight: extFreight,
      ext_tax: extTax,
      ext_landed: extLanded,
      active_tier_idx: activeTierIdx,
      child_order_qty: childOrderQty,
    }
  })
}

export function fmtMYR(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined) return '—'
  return 'RM ' + n.toFixed(dp)
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}
