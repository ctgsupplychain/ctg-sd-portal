'use client'
import { BomRow, PlmDocument, PriceTier } from '@/lib/plm-types'
import { CostResult } from '@/lib/plm-types'
import { getTierPrice } from '@/lib/plm-cost'

interface Props {
  pn: string
  row: BomRow | null
  cost: CostResult | null
  docs: PlmDocument[]
  moq: number
  onClose: () => void
}

const FILE_TYPE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  pdf: { bg: 'rgba(255,95,95,.12)',   color: '#ff5f5f', border: 'rgba(255,95,95,.2)' },
  ai:  { bg: 'rgba(245,166,35,.12)',  color: '#f5a623', border: 'rgba(245,166,35,.2)' },
  dwg: { bg: 'rgba(0,153,255,.12)',   color: '#0099ff', border: 'rgba(0,153,255,.2)' },
  png: { bg: 'rgba(52,211,153,.12)',  color: '#34d399', border: 'rgba(52,211,153,.2)' },
}

function fileExt(name: string): string {
  return (name.split('.').pop() ?? 'file').toLowerCase()
}

export default function DocDrawer({ pn, row, cost, docs, moq, onClose }: Props) {
  if (!row) return null

  const tiers: PriceTier[] = row.price_tiers ?? []
  const childOrderQty = cost?.child_order_qty ?? moq * row.qty_per_fg
  const activeTierIdx = cost?.active_tier_idx ?? 0

  const current = docs.filter(d => d.is_current)
  const archived = docs.filter(d => !d.is_current)

  return (
    <div style={{
      background: 'var(--bg1)',
      borderTop: '1px solid var(--border)',
      display: 'grid',
      gridTemplateColumns: '260px 1fr',
      gap: 0,
      maxHeight: 360,
      flexShrink: 0,
    }}>
      {/* Left: part info */}
      <div style={{
        padding: '16px 18px',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--accent2)' }}>{pn}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{row.component_desc}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 14, padding: '0 4px',
          }}>✕</button>
        </div>

        <SectionTitle>Part info</SectionTitle>
        <MetaRow k="Category" v={row.category} />
        <MetaRow k="Revision" v={row.current_revision ?? '—'} />
        <MetaRow k="Qty / FG" v={`${row.qty_per_fg} ${row.uom}`} />
        <MetaRow k="Supplier" v={row.supplier_name ?? '—'} />
        <MetaRow k="Lead time" v={row.lead_time_wk != null ? `${row.lead_time_wk}w` : '—'} />
        <MetaRow k="MOQ" v={row.moq != null ? row.moq.toLocaleString() : '—'} />
        {row.nre_cost != null && <MetaRow k="NRE" v={`RM ${row.nre_cost.toFixed(2)}`} />}
        <MetaRow k="Child order qty" v={`${childOrderQty.toLocaleString()} ${row.uom}`} />

        {tiers.length > 0 && (
          <>
            <SectionTitle style={{ marginTop: 12 }}>Price tiers</SectionTitle>
            {tiers.map((t, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: 11,
                color: i === activeTierIdx ? 'var(--accent)' : 'var(--muted)',
              }}>
                <span>MOQ {t.min_qty.toLocaleString()}</span>
                <span style={{ fontFamily: 'monospace' }}>
                  RM {t.unit_price.toFixed(5)}
                  {i === activeTierIdx && (
                    <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--accent)' }}>← active</span>
                  )}
                </span>
              </div>
            ))}
          </>
        )}

        {row.part_notes && (
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
            {row.part_notes}
          </div>
        )}
      </div>

      {/* Right: documents */}
      <div style={{ padding: '16px 18px', overflowY: 'auto' }}>
        <SectionTitle>
          Documents {current.length > 0 ? `(${current.length} current${archived.length > 0 ? `, ${archived.length} archived` : ''})` : ''}
        </SectionTitle>

        {docs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 6 }}>
            <div style={{ fontSize: 28, opacity: 0.3 }}>📄</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No documents attached yet</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Upload spec sheet, drawing, or artwork</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
            {current.map(doc => <DocRow key={doc.id} doc={doc} />)}
            {archived.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
                  Archived ({archived.length})
                </div>
                {archived.map(doc => <DocRow key={doc.id} doc={doc} archived />)}
              </>
            )}
          </div>
        )}

        {/* Upload zone */}
        <div
          onClick={() => alert('Upload — connect Supabase Storage bucket to enable file uploads')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: 9, marginTop: 10,
            border: '1px dashed var(--border2)', borderRadius: 4,
            fontSize: 11, color: 'var(--muted)', cursor: 'pointer',
            transition: 'all .15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent2)'
            ;(e.currentTarget as HTMLDivElement).style.color = 'var(--accent2)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)'
            ;(e.currentTarget as HTMLDivElement).style.color = 'var(--muted)'
          }}
        >
          ＋ Upload new version
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: 'monospace', color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  )
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 11,
    }}>
      <span style={{ color: 'var(--muted)' }}>{k}</span>
      <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{v}</span>
    </div>
  )
}

function DocRow({ doc, archived }: { doc: PlmDocument; archived?: boolean }) {
  const ext = (doc.file_name.split('.').pop() ?? 'file').toLowerCase()
  const style = FILE_TYPE_STYLE[ext] ?? { bg: 'var(--bg3)', color: 'var(--muted)', border: 'var(--border)' }

  return (
    <div
      onClick={() => window.open(doc.file_url, '_blank')}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 11px',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 4, cursor: 'pointer',
        opacity: archived ? 0.5 : 1,
        transition: 'border-color .15s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 4, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
        background: style.bg, color: style.color, border: `1px solid ${style.border}`,
        textTransform: 'uppercase',
      }}>
        {ext}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text)' }}>{doc.file_name}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 1 }}>
          v{doc.version} · {doc.doc_type} · {new Date(doc.uploaded_at).toLocaleDateString('en-MY')}
        </div>
      </div>
      <span style={{
        fontFamily: 'monospace', fontSize: 9, padding: '2px 5px', borderRadius: 2,
        background: archived ? 'var(--bg3)' : 'rgba(0,212,160,.12)',
        color: archived ? 'var(--muted)' : 'var(--accent)',
      }}>
        {archived ? 'Archived' : 'Current'}
      </span>
    </div>
  )
}

