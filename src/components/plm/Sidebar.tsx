'use client'
import { Part } from '@/lib/plm-types'

interface Props {
  parts: Part[]
  selected: Part | null
  onSelect: (p: Part) => void
  loading: boolean
}

const BRAND_COLORS: Record<string, string> = {
  Naturelish: '#00d4a0',
  Bonlife:    '#6c8cff',
  Mejorecare: '#a78bfa',
  KATA:       '#f59e0b',
  iProcare:   '#34d399',
  SwissMed:   '#0099ff',
  GoHerb:     '#f5a623',
}

function brandColor(brand: string | null): string {
  return BRAND_COLORS[brand ?? ''] ?? '#7a8394'
}

export default function Sidebar({ parts, selected, onSelect, loading }: Props) {
  const grouped = parts.reduce<Record<string, Part[]>>((acc, p) => {
    const key = p.brand ?? 'Other'
    acc[key] = acc[key] ?? []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div style={{
      width: 260,
      background: 'var(--bg1)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30,
            background: '#1a1e25',
            border: '1px solid var(--border2)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'var(--accent)',
            fontFamily: 'monospace',
          }}>PLM</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>CTG PLM</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Product Lifecycle Mgmt</div>
          </div>
        </div>
        <div style={{
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'var(--muted)',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '5px 8px',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          BOM Viewer — Phase 1
        </div>
      </div>

      {/* SKU list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading && (
          <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
        )}
        {Object.entries(grouped).map(([brand, brandParts]) => (
          <div key={brand}>
            <div style={{
              padding: '8px 16px 4px',
              fontSize: 9,
              fontFamily: 'monospace',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: brandColor(brand),
                display: 'inline-block',
              }} />
              {brand}
            </div>
            {brandParts.map(p => {
              const isSelected = selected?.part_number === p.part_number
              return (
                <div
                  key={p.part_number}
                  onClick={() => onSelect(p)}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(0,212,160,0.08)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg2)'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  <div style={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: isSelected ? 'var(--accent)' : 'var(--accent2)',
                    marginBottom: 2,
                  }}>{p.part_number}</div>
                  <div style={{
                    fontSize: 12,
                    color: isSelected ? 'var(--text)' : 'var(--muted)',
                    lineHeight: 1.3,
                  }}>{p.description}</div>
                  {p.master_sku_ref && (
                    <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)', marginTop: 2 }}>
                      {p.master_sku_ref}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {!loading && parts.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--muted)' }}>
            No active FG parts found.
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        fontFamily: 'monospace',
        color: 'var(--muted)',
      }}>
        {parts.length} FG SKU{parts.length !== 1 ? 's' : ''} · ap-southeast-1
      </div>
    </div>
  )
}
