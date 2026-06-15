'use client'
import { BomRow, PartCategory } from '@/lib/plm-types'
import { CostResult } from '@/lib/plm-types'

const CAT_STYLE: Record<PartCategory, { bg: string; color: string }> = {
  SA:  { bg: '#E4DDD3', color: '#1F2937' },
  PK:  { bg: '#E4DDD3', color: '#4B5563' },
  RM:  { bg: '#DCEAE8', color: '#0E5C56' },
  FG:  { bg: '#FEF3E2', color: '#E8A33D' },
  WIP: { bg: '#FEF2F2', color: '#dc2626' },
}
const LV_STYLE = [
  { bg: '#E0F2FE', color: '#0369a1' },
  { bg: '#E4DDD3', color: '#4B5563' },
  { bg: '#DCEAE8', color: '#0E5C56' },
  { bg: '#FEF3E2', color: '#E8A33D' },
]
const FLAGS: Record<string, string> = { MY: '🇲🇾', CN: '🇨🇳', US: '🇺🇸' }

interface Props {
  rows: BomRow[]
  costMap: Record<string, CostResult>
  moq: number
  showL2: boolean
  openPn: string | null
  onToggle: (pn: string) => void
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#4B5563] uppercase tracking-wider bg-[#F4F2EE] border-b border-[#E4DDD3] whitespace-nowrap sticky top-0 z-10"
    style={{ textAlign: right ? 'right' : 'left' }}>
    {children}
  </th>
)

/** Build a display order where each L1 row is immediately followed by its L2 children. */
function buildOrderedRows(rows: BomRow[], showL2: boolean): BomRow[] {
  const l1Rows = rows.filter(r => r.bom_level === 1)

  if (!showL2) return l1Rows

  // Group L2 children by their parent_component_pn
  const l2ByParent: Record<string, BomRow[]> = {}
  rows.filter(r => r.bom_level === 2).forEach(r => {
    const key = r.parent_component_pn ?? '__orphan__'
    l2ByParent[key] = l2ByParent[key] ?? []
    l2ByParent[key].push(r)
  })

  const ordered: BomRow[] = []
  l1Rows.forEach(l1 => {
    ordered.push(l1)
    ordered.push(...(l2ByParent[l1.component_pn] ?? []))
  })

  // Append any orphaned L2s (parent not found among L1 rows)
  const shown = new Set(ordered.map(r => r.component_pn))
  rows.filter(r => r.bom_level === 2 && !shown.has(r.component_pn)).forEach(r => ordered.push(r))

  return ordered
}

export default function BomTable({ rows, costMap, showL2, openPn, onToggle }: Props) {
  const visible = buildOrderedRows(rows, showL2)
  const maxLanded = Math.max(...Object.values(costMap).map(c => c.ext_landed ?? 0), 1)
  const totLanded = Object.values(costMap).reduce((s, c) => s + (c.ext_landed ?? 0), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <TH>#</TH>
            <TH>Lv</TH>
            <TH>Part Number</TH>
            <TH>Description</TH>
            <TH>Cat</TH>
            <TH right>Qty/FG</TH>
            <TH>UOM</TH>
            <TH>Supplier</TH>
            <TH>Rev</TH>
            <TH right>Unit Price</TH>
            <TH right>Ext / FG</TH>
            <TH right>Share</TH>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => {
            const cost = costMap[row.component_pn]
            const isOpen = openPn === row.component_pn
            const isL2 = row.bom_level === 2
            const catStyle = CAT_STYLE[row.category] ?? CAT_STYLE.FG
            const lvStyle = LV_STYLE[(row.bom_level - 1) % LV_STYLE.length]
            const up = cost?.unit_price
            const el = cost?.ext_landed ?? 0
            const pct = maxLanded > 0 ? (el / maxLanded * 100) : 0
            const share = totLanded > 0 && el ? ((el / totLanded) * 100).toFixed(1) + '%' : '—'
            const barColor = row.category === 'RM' ? '#0E5C56' : row.category === 'PK' ? '#4B5563' : '#1F2937'
            const hasTiers = (row.price_tiers?.length ?? 0) > 1

            return (
              <tr
                key={row.component_pn + i}
                onClick={() => onToggle(row.component_pn)}
                className="cursor-pointer border-b border-[#E4DDD3] transition-colors hover:bg-[#F4F2EE]"
                style={{
                  background: isOpen ? '#DCEAE8' : i % 2 === 1 ? '#FAFAFA' : 'white',
                  borderLeft: isOpen ? '3px solid #0E5C56' : '3px solid transparent',
                }}
              >
                <td className="px-4 py-2.5 text-xs text-[#4B5563] font-mono">{String(i + 1).padStart(2, '0')}</td>

                <td className="px-4 py-2.5">
                  <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold font-mono"
                    style={{ background: lvStyle.bg, color: lvStyle.color }}>
                    L{row.bom_level}
                  </span>
                </td>

                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    {isL2 && <span className="text-[#CBD5E1] text-xs ml-2">└</span>}
                    <a
                      href={`/plm/${encodeURIComponent(row.component_pn)}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs font-mono text-[#0E5C56] border-b border-dashed border-[#0E5C56]/30 hover:border-solid hover:text-[#036b64]"
                      title="Open part detail"
                    >
                      {row.component_pn}
                    </a>
                  </div>
                </td>

                <td className="px-4 py-2.5 text-sm text-[#1F2937]">{row.component_desc}</td>

                <td className="px-4 py-2.5">
                  <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                    style={{ background: catStyle.bg, color: catStyle.color }}>
                    {row.category}
                  </span>
                </td>

                <td className="px-4 py-2.5 text-right text-sm font-mono text-[#1F2937]">{row.qty_per_fg}</td>
                <td className="px-4 py-2.5 text-xs text-[#4B5563] font-mono">{row.uom}</td>

                <td className="px-4 py-2.5">
                  {row.supplier_name
                    ? <span className="text-xs text-[#4B5563] flex items-center gap-1">
                        {FLAGS[row.supplier_country ?? ''] ?? ''} {row.supplier_name}
                      </span>
                    : <span className="text-xs text-[#E4DDD3]">—</span>
                  }
                </td>

                <td className="px-4 py-2.5 text-xs text-[#4B5563] font-mono">{row.current_revision ?? '—'}</td>

                <td className="px-4 py-2.5 text-right">
                  {up === null || up === undefined
                    ? <span className="text-xs text-[#E4DDD3] italic">—</span>
                    : <div>
                        <span className="text-sm font-mono text-[#1F2937]">RM {up.toFixed(4)}</span>
                        {hasTiers && cost && (
                          <span className="ml-1.5 text-xs px-1 py-0.5 rounded font-mono"
                            style={{ background: '#FEF3E2', color: '#E8A33D' }}>
                            T{cost.active_tier_idx + 1}
                          </span>
                        )}
                        {hasTiers && cost && (
                          <div className="text-xs text-[#4B5563] font-mono mt-0.5">
                            {cost.child_order_qty.toLocaleString()} {row.uom}
                          </div>
                        )}
                      </div>
                  }
                </td>

                <td className="px-4 py-2.5 text-right">
                  {cost?.ext_landed === null || cost?.ext_landed === undefined
                    ? <span className="text-xs text-[#E4DDD3] italic">rolled up</span>
                    : <span className="text-sm font-mono text-[#1F2937]">RM {el.toFixed(4)}</span>
                  }
                </td>

                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs text-[#4B5563] min-w-[32px] text-right">{share}</span>
                    <div className="w-12 h-1.5 bg-[#E4DDD3] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
