'use client'
import { BomRow, PlmDocument, PriceTier } from '@/lib/plm-types'
import { CostResult } from '@/lib/plm-types'
import { X, Upload, FileText } from 'lucide-react'
import { getTierPrice } from '@/lib/plm-cost'

interface Props {
  pn: string
  row: BomRow | null
  cost: CostResult | null
  docs: PlmDocument[]
  moq: number
  onClose: () => void
}

const FILE_STYLE: Record<string, { bg: string; color: string }> = {
  pdf: { bg: '#FEF2F2', color: '#dc2626' },
  ai:  { bg: '#FFFBEB', color: '#d97706' },
  dwg: { bg: '#EFF6FF', color: '#2563eb' },
  png: { bg: '#F0FDF4', color: '#16a34a' },
}

function fileExt(name: string): string {
  return (name.split('.').pop() ?? 'file').toLowerCase()
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#EAECF0] text-xs">
      <span className="text-[#667085]">{k}</span>
      <span className="font-mono text-[#344054]">{v}</span>
    </div>
  )
}

export default function DocDrawer({ pn, row, cost, docs, moq, onClose }: Props) {
  if (!row) return null

  const tiers: PriceTier[] = row.price_tiers ?? []
  const childOrderQty = cost?.child_order_qty ?? moq * row.qty_per_fg
  const activeTierIdx = cost?.active_tier_idx ?? 0
  const current = docs.filter(d => d.is_current)
  const archived = docs.filter(d => !d.is_current)

  return (
    <div className="bg-white border-t border-[#EAECF0] grid flex-shrink-0"
      style={{ gridTemplateColumns: '260px 1fr', maxHeight: 340 }}>

      {/* Left: part info */}
      <div className="p-4 border-r border-[#EAECF0] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-sm font-mono font-semibold text-[#048A81]">{pn}</div>
            <div className="text-xs text-[#667085] mt-0.5 leading-snug">{row.component_desc}</div>
          </div>
          <button onClick={onClose}
            className="text-[#667085] hover:text-[#344054] transition-colors p-0.5 rounded hover:bg-[#F2F4F7]">
            <X size={14} />
          </button>
        </div>

        <div className="text-xs font-medium text-[#344054] uppercase tracking-wider mb-2">Part info</div>
        <MetaRow k="Category"       v={row.category} />
        <MetaRow k="Revision"       v={row.current_revision ?? '—'} />
        <MetaRow k="Qty / FG"       v={`${row.qty_per_fg} ${row.uom}`} />
        <MetaRow k="Supplier"       v={row.supplier_name ?? '—'} />
        <MetaRow k="Lead time"      v={row.lead_time_wk != null ? `${row.lead_time_wk}w` : '—'} />
        <MetaRow k="MOQ"            v={row.moq != null ? row.moq.toLocaleString() : '—'} />
        <MetaRow k="Child order qty" v={`${childOrderQty.toLocaleString()} ${row.uom}`} />
        {row.nre_cost != null && <MetaRow k="NRE" v={`RM ${row.nre_cost.toFixed(2)}`} />}

        {tiers.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-[#344054] uppercase tracking-wider mb-2">Price tiers</div>
            {tiers.map((t, i) => (
              <div key={i}
                className="flex justify-between py-1.5 border-b border-[#EAECF0] text-xs"
                style={{ color: i === activeTierIdx ? '#048A81' : '#667085',
                         fontWeight: i === activeTierIdx ? 500 : 400 }}>
                <span>MOQ {t.min_qty.toLocaleString()}</span>
                <span className="font-mono">
                  RM {t.unit_price.toFixed(5)}
                  {i === activeTierIdx && <span className="ml-1.5 text-[#048A81] text-xs">← active</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {row.part_notes && (
          <div className="mt-3 text-xs text-[#667085] leading-relaxed bg-[#F9FAFB] rounded-lg p-2.5">
            {row.part_notes}
          </div>
        )}
      </div>

      {/* Right: documents */}
      <div className="p-4 overflow-y-auto">
        <div className="text-xs font-medium text-[#344054] uppercase tracking-wider mb-3">
          Documents
          {current.length > 0 && (
            <span className="ml-2 text-[#667085] normal-case font-normal">
              {current.length} current{archived.length > 0 ? `, ${archived.length} archived` : ''}
            </span>
          )}
        </div>

        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText size={28} className="text-[#D0D5DD] mb-2" />
            <div className="text-sm text-[#344054] font-medium">No documents attached</div>
            <div className="text-xs text-[#667085] mt-0.5">Upload spec sheet, drawing or artwork</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-3">
            {current.map(doc => <DocRow key={doc.id} doc={doc} />)}
            {archived.length > 0 && (
              <>
                <div className="text-xs text-[#667085] uppercase tracking-wider pt-1">Archived</div>
                {archived.map(doc => <DocRow key={doc.id} doc={doc} archived />)}
              </>
            )}
          </div>
        )}

        <button
          onClick={() => alert('Connect Supabase Storage to enable uploads')}
          className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#D0D5DD] rounded-lg text-xs text-[#667085] hover:border-[#048A81] hover:text-[#048A81] transition-colors"
        >
          <Upload size={13} />
          Upload new version
        </button>
      </div>
    </div>
  )
}

function DocRow({ doc, archived }: { doc: PlmDocument; archived?: boolean }) {
  const ext = fileExt(doc.file_name)
  const style = FILE_STYLE[ext] ?? { bg: '#F9FAFB', color: '#667085' }

  return (
    <div
      onClick={() => window.open(doc.file_url, '_blank')}
      className="flex items-center gap-3 p-3 bg-white border border-[#EAECF0] rounded-lg cursor-pointer hover:border-[#048A81]/40 hover:bg-[#F0FDF9] transition-all"
      style={{ opacity: archived ? 0.5 : 1 }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold font-mono flex-shrink-0 uppercase"
        style={{ background: style.bg, color: style.color }}>
        {ext}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#344054] truncate">{doc.file_name}</div>
        <div className="text-xs text-[#667085] font-mono mt-0.5">
          v{doc.version} · {doc.doc_type} · {new Date(doc.uploaded_at).toLocaleDateString('en-MY')}
        </div>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
        style={archived
          ? { background: '#F2F4F7', color: '#667085' }
          : { background: '#F0FDF9', color: '#048A81' }}>
        {archived ? 'Archived' : 'Current'}
      </span>
    </div>
  )
}
