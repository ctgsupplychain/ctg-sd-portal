'use client'
import { BomRow, PartCategory } from '@/lib/plm-types'
import { CostResult } from '@/lib/plm-types'

const CAT_COLORS: Record<PartCategory, { bg: string; color: string }> = {
  SA:  { bg: 'rgba(108,140,255,.15)', color: '#6c8cff' },
  PK:  { bg: 'rgba(167,139,250,.15)', color: '#a78bfa' },
  RM:  { bg: 'rgba(52,211,153,.15)',  color: '#34d399' },
  FG:  { bg: 'rgba(245,158,11,.15)',  color: '#f59e0b' },
  WIP: { bg: 'rgba(255,95,95,.15)',   color: '#ff5f5f' },
}

const LV_COLORS = ['#6c8cff', '#a78bfa', '#34d399', '#f59e0b']

interface Props {
  rows: BomRow[]
  costMap: Record<string, CostResult>
  moq: number
  showL2: boolean
  openPn: string | null
  onToggle: (pn: string) => void
  flags: Record<string, string>
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{
    fontFamily: 'monospace', fontSize: 9, fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'var(--muted)', padding: '8px 13px',
    textAlign: right ? 'right' : 'left',
    background: 'var(--bg1)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
  }}>{children}</th>
)

export default function BomTable({ rows, costMap, showL2, openPn, onToggle, flags }: Props) {
  const visible = rows.filter(r => showL2 || r.bom_level === 1)
  const maxLanded = Math.max(...Object.values(costMap).map(c => c.ext_landed ?? 0))
  const totLanded = Object.values(costMap).reduce((s, c) => s + (c.ext_landed ?? 0), 0)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
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
            const catStyle = CAT_COLORS[row.category] ?? CAT_COLORS.FG
            const lvColor = LV_COLORS[row.bom_level - 1] ?? 'var(--muted)'
            const hasDocs = false // set by parent via docs prop — can extend

            const up = cost?.unit_price
            const el = cost?.ext_landed ?? 0
            const pct = maxLanded > 0 ? (el / maxLanded * 100) : 0
            const share = totLanded > 0 && el ? ((el / totLanded) * 100).toFixed(1) + '%' : '—'
            const barColor = row.category === 'RM' ? '#34d399' : row.category === 'PK' ? '#a78bfa' : '#6c8cff'

            const hasTiers = (row.price_tiers?.length ?? 0) > 1
            const tierBadge = hasTiers && cost
              ? <span style={{ fontFamily: 'monospace', fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(245,166,35,.12)', color: 'var(--warn)', marginLeft: 3 }}>
                  T{cost.active_tier_idx + 1}
                </span>
              : null

            const childQtyBadge = hasTiers && cost
              ? <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--accent2)', marginTop: 2 }}>
                  {cost.child_order_qty.toLocaleString()} {row.uom}
                </div>
              : null

            return (
              <tr
                key={row.component_pn + '-' + i}
                onClick={() => onToggle(row.component_pn)}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: isOpen
                    ? 'rgba(0,212,160,.05)'
                    : isL2 ? 'rgba(255,255,255,.013)' : 'transparent',
                  borderLeft: isOpen ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.background = isL2 ? 'rgba(255,255,255,.013)' : 'transparent' }}
              >
                {/* # */}
                <td style={{ padding: '9px 13px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                  {String(i + 1).padStart(2, '0')}
                </td>

                {/* Level */}
                <td style={{ padding: '9px 13px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 600, color: '#0d0f12', background: lvColor, padding: '1px 5px', borderRadius: 2 }}>
                    L{row.bom_level}
                  </span>
                </td>

                {/* Part Number */}
                <td style={{ padding: '9px 13px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {isL2 && <span style={{ color: 'var(--border2)', marginRight: 4, marginLeft: 8 }}>└</span>}
                    <span style={{
                      fontFamily: 'monospace', fontSize: 11,
                      color: 'var(--accent2)',
                      borderBottom: '1px dashed rgba(0,153,255,.35)',
                    }}>
                      {row.component_pn}
                    </span>
                    {hasDocs && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent2)', display: 'inline-block', marginLeft: 4 }} />}
                  </div>
                </td>

                {/* Description */}
                <td style={{ padding: '9px 13px', fontSize: 12, color: 'var(--text)' }}>
                  {row.component_desc}
                </td>

                {/* Category */}
                <td style={{ padding: '9px 13px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 500, padding: '2px 6px', borderRadius: 2, ...catStyle }}>
                    {row.category}
                  </span>
                </td>

                {/* Qty */}
                <td style={{ padding: '9px 13px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {row.qty_per_fg}
                </td>

                {/* UOM */}
                <td style={{ padding: '9px 13px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                  {row.uom}
                </td>

                {/* Supplier */}
                <td style={{ padding: '9px 13px' }}>
                  {row.supplier_name
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                        {flags[row.supplier_country ?? ''] ?? ''} {row.supplier_name}
                      </span>
                    : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                  }
                </td>

                {/* Rev */}
                <td style={{ padding: '9px 13px', fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)' }}>
                  {row.current_revision ?? '—'}
                </td>

                {/* Unit Price */}
                <td style={{ padding: '9px 13px', textAlign: 'right' }}>
                  {up === null || up === undefined
                    ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>—</span>
                    : <div>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: up === 0 ? 'var(--muted)' : up > 5 ? 'var(--warn)' : 'var(--text)' }}>
                          RM {up.toFixed(4)}
                        </span>
                        {tierBadge}
                        {childQtyBadge}
                      </div>
                  }
                </td>

                {/* Ext / FG */}
                <td style={{ padding: '9px 13px', textAlign: 'right' }}>
                  {cost?.ext_landed === null || cost?.ext_landed === undefined
                    ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>rolled up</span>
                    : <span style={{ fontFamily: 'monospace', fontSize: 12, color: el === 0 ? 'var(--muted)' : el > 15 ? 'var(--warn)' : 'var(--text)' }}>
                        RM {el.toFixed(4)}
                      </span>
                  }
                </td>

                {/* Share bar */}
                <td style={{ padding: '9px 13px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--muted)', minWidth: 30 }}>{share}</span>
                    <div style={{ width: 48, height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width .4s' }} />
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
