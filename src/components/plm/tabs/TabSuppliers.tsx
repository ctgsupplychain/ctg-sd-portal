'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ManufacturerPart, MpnStatus } from '@/lib/plm-types'
import { Star, Plus } from 'lucide-react'

const FLAGS: Record<string, string> = { MY: '🇲🇾', CN: '🇨🇳', US: '🇺🇸' }

const STATUS_STYLE: Record<MpnStatus, { bg: string; color: string }> = {
  Active:     { bg: '#ECFDF5', color: '#047857' },
  Alternate:  { bg: '#F2F4F7', color: '#475467' },
  Qualifying: { bg: '#FFFBEB', color: '#b45309' },
  Obsolete:   { bg: '#FEF2F2', color: '#dc2626' },
}

export default function TabSuppliers({ pn }: { pn: string }) {
  const [mpns, setMpns] = useState<ManufacturerPart[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: rows } = await supabase
        .from('manufacturer_parts')
        .select('*')
        .eq('part_number', pn)
        .order('is_preferred', { ascending: false })

      const supplierIds = [...new Set((rows ?? []).map((r: any) => r.supplier_id).filter(Boolean))]
      const { data: sups } = supplierIds.length
        ? await supabase.from('plm_suppliers').select('id,name,country').in('id', supplierIds)
        : { data: [] }
      const supMap = Object.fromEntries((sups ?? []).map((s: any) => [s.id, s]))

      setMpns((rows ?? []).map((r: any) => ({
        ...r,
        supplier_name: r.supplier_id ? supMap[r.supplier_id]?.name : null,
        supplier_country: r.supplier_id ? supMap[r.supplier_id]?.country : null,
      })))
      setLoading(false)
    })()
  }, [pn])

  if (loading) return <div className="text-sm text-[#667085] p-4">Loading suppliers…</div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[#101828]">Approved Manufacturer List (AML)</h2>
          <p className="text-xs text-[#667085] mt-0.5">
            {pn} is the internal part. Each card below is a Manufacturer Part (MPN) — a specific supplier's offering.
          </p>
        </div>
        <button
          onClick={() => alert('Add MPN form — Phase 2 follow-up')}
          className="flex items-center gap-1.5 text-xs text-[#048A81] border border-[#048A81]/30 rounded-lg px-3 py-1.5 hover:bg-[#F0FDF9] transition-colors">
          <Plus size={13} /> Add MPN
        </button>
      </div>

      {mpns.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#EAECF0] p-8 text-center text-sm text-[#667085]">
          No manufacturer parts linked yet.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {mpns.map(m => {
            const st = STATUS_STYLE[m.status]
            const tiers = m.price_tiers ?? []
            return (
              <div key={m.id} className="bg-white rounded-xl border overflow-hidden"
                style={{ borderColor: m.is_preferred ? '#048A81' : '#EAECF0', borderWidth: m.is_preferred ? 2 : 1 }}>
                <div className="px-4 py-3 border-b border-[#EAECF0] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{FLAGS[m.supplier_country ?? ''] ?? '🏭'}</span>
                    <div>
                      <div className="text-xs font-medium text-[#101828]">{m.supplier_name ?? 'Unassigned supplier'}</div>
                      <div className="text-xs font-mono text-[#667085]">{m.mpn ?? 'MPN —'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.is_preferred && (
                      <span className="flex items-center gap-1 text-xs text-[#048A81]" title="Preferred">
                        <Star size={11} fill="#048A81" /> 
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>
                      {m.status}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <Row k="MOQ" v={m.moq != null ? Number(m.moq).toLocaleString() : '—'} />
                  <Row k="Lead time" v={m.lead_time_wk != null ? `${m.lead_time_wk} wk` : '—'} />
                  <Row k="NRE" v={m.nre_cost != null ? `RM ${Number(m.nre_cost).toFixed(2)}` : '—'} />
                  {tiers.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#EAECF0]">
                      <div className="text-xs text-[#667085] uppercase tracking-wider mb-1.5">Price tiers</div>
                      {tiers.map((t, i) => (
                        <div key={i} className="flex justify-between text-xs py-0.5">
                          <span className="text-[#667085]">MOQ {t.min_qty.toLocaleString()}</span>
                          <span className="font-mono text-[#344054]">RM {t.unit_price.toFixed(5)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.notes && <div className="mt-2 text-xs text-[#667085] bg-[#F9FAFB] rounded-lg p-2 leading-relaxed">{m.notes}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1 text-xs border-b border-[#F2F4F7] last:border-0">
      <span className="text-[#667085]">{k}</span>
      <span className="font-mono text-[#344054]">{v}</span>
    </div>
  )
}
