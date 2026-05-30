'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ManufacturerPart, MpnStatus, PriceTier, Supplier } from '@/lib/plm-types'
import { Star, Plus, X, Loader2, Trash2 } from 'lucide-react'

const FLAGS: Record<string, string> = { MY: 'ð²ð¾', CN: 'ð¨ð³', US: 'ðºð¸' }

const STATUS_STYLE: Record<MpnStatus, { bg: string; color: string }> = {
  Active:     { bg: '#ECFDF5', color: '#047857' },
  Alternate:  { bg: '#F2F4F7', color: '#475467' },
  Qualifying: { bg: '#FFFBEB', color: '#b45309' },
  Obsolete:   { bg: '#FEF2F2', color: '#dc2626' },
}

const MPN_STATUSES: MpnStatus[] = ['Active', 'Alternate', 'Qualifying', 'Obsolete']

export default function TabSuppliers({ pn }: { pn: string }) {
  const [mpns, setMpns] = useState<ManufacturerPart[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const fetchMpns = async () => {
    const supabase = createClient()
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
  }

  useEffect(() => { fetchMpns() }, [pn])

  if (loading) return <div className="text-sm text-[#667085] p-4">Loading suppliersâ¦</div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[#101828]">Approved Manufacturer List (AML)</h2>
          <p className="text-xs text-[#667085] mt-0.5">
            {pn} is the internal part. Each card below is a Manufacturer Part (MPN) â a specific supplier's offering.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-[#048A81] border border-[#048A81]/30 rounded-lg px-3 py-1.5 hover:bg-[#F0FDF9] transition-colors">
          <Plus size={13} /> Add MPN
        </button>
      </div>

      {showForm && (
        <AddMpnModal
          pn={pn}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchMpns() }}
        />
      )}

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
                    <span className="text-sm">{FLAGS[m.supplier_country ?? ''] ?? 'ð­'}</span>
                    <div>
                      <div className="text-xs font-medium text-[#101828]">{m.supplier_name ?? 'Unassigned supplier'}</div>
                      <div className="text-xs font-mono text-[#667085]">{m.mpn ?? 'MPN â'}</div>
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
                  <Row k="MOQ" v={m.moq != null ? Number(m.moq).toLocaleString() : 'â'} />
                  <Row k="Lead time" v={m.lead_time_wk != null ? `${m.lead_time_wk} wk` : 'â'} />
                  <Row k="NRE" v={m.nre_cost != null ? `RM ${Number(m.nre_cost).toFixed(2)}` : 'â'} />
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
                  {m.notes && (
                    <div className="mt-2 text-xs text-[#667085] bg-[#F9FAFB] rounded-lg p-2 leading-relaxed">{m.notes}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ââ Add MPN Modal ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function AddMpnModal({ pn, onClose, onSaved }: {
  pn: string
  onClose: () => void
  onSaved: () => void
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [mpn, setMpn] = useState('')
  const [status, setStatus] = useState<MpnStatus>('Active')
  const [isPreferred, setIsPreferred] = useState(false)
  const [moq, setMoq] = useState('')
  const [leadTimeWk, setLeadTimeWk] = useState('')
  const [nreCost, setNreCost] = useState('')
  const [notes, setNotes] = useState('')
  const [tiers, setTiers] = useState<{ min_qty: string; unit_price: string }[]>([
    { min_qty: '', unit_price: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    createClient()
      .from('plm_suppliers')
      .select('id,name,country')
      .order('name')
      .then(({ data }) => setSuppliers((data ?? []) as any))
  }, [])

  const addTier = () => setTiers(t => [...t, { min_qty: '', unit_price: '' }])
  const removeTier = (i: number) => setTiers(t => t.filter((_, idx) => idx !== i))
  const updateTier = (i: number, field: 'min_qty' | 'unit_price', val: string) =>
    setTiers(t => t.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()

      const priceTiers: PriceTier[] = tiers
        .filter(t => t.min_qty && t.unit_price)
        .map(t => ({ min_qty: Number(t.min_qty), unit_price: Number(t.unit_price), currency: 'MYR' }))

      if (isPreferred) {
        const { error: clearErr } = await supabase
          .from('manufacturer_parts')
          .update({ is_preferred: false })
          .eq('part_number', pn)
          .eq('is_preferred', true)
        if (clearErr) throw new Error(`Failed to clear existing preferred: ${clearErr.message}`)
      }

      const { error: insertErr } = await supabase.from('manufacturer_parts').insert({
        part_number: pn,
        supplier_id: supplierId || null,
        mpn: mpn.trim() || null,
        status,
        is_preferred: isPreferred,
        moq: moq ? Number(moq) : null,
        lead_time_wk: leadTimeWk ? Number(leadTimeWk) : null,
        nre_cost: nreCost ? Number(nreCost) : null,
        price_tiers: priceTiers.length > 0 ? priceTiers : [],
        notes: notes.trim() || null,
      })
      if (insertErr) throw new Error(insertErr.message)

      onSaved()
    } catch (e: any) {
      setError(e.message ?? 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAECF0] flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-[#101828]">Add Manufacturer Part</h3>
            <p className="text-xs text-[#667085] mt-0.5">Adding MPN to internal part {pn}</p>
          </div>
          <button onClick={onClose} className="text-[#667085] hover:text-[#344054]"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          <div>
            <label className="block text-xs font-medium text-[#344054] mb-1">Supplier</label>
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30">
              <option value="">â Select supplier â</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.country})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#344054] mb-1">MPN code <span className="text-[#667085] font-normal">(manufacturer's part number)</span></label>
            <input
              type="text"
              value={mpn}
              onChange={e => setMpn(e.target.value)}
              placeholder="e.g. GZ-PET50-A3"
              className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as MpnStatus)}
                className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30">
                {MPN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">Preferred MPN</label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPreferred}
                  onChange={e => setIsPreferred(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#048A81]" />
                <span className="text-xs text-[#344054]">Set as preferred</span>
              </label>
              {isPreferred && (
                <p className="text-xs text-amber-600 mt-1">Existing preferred MPN will be unset.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">MOQ</label>
              <input type="number" value={moq} onChange={e => setMoq(e.target.value)} placeholder="0"
                className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">Lead time (wk)[/label>
              <input type="number" value={leadTimeWk} onChange={e => setLeadTimeWk(e.target.value)} placeholder="0"
                className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">NRE (RM)</label>
              <input type="number" value={nreCost} onChange={e => setNreCost(e.target.value)} placeholder="0.00"
                className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#344054]">Price tiers (MYR)</label>
              <button onClick={addTier}
                className="text-xs text-[#048A81] flex items-center gap-1 hover:underline">
                <Plus size={11} /> Add tier
              </button>
            </div>
            <div className="space-y-2">
              {tiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <input type="number" placeholder="Min qty" value={tier.min_qty}
                      onChange={e => updateTier(i, 'min_qty', e.target.value)}
                      className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30" />
                  </div>
                  <div className="flex-1">
                    <input type="number" step="0.00001" placeholder="Unit price" value={tier.unit_price}
                      onChange={e => updateTier(i, 'unit_price', e.target.value)}
                      className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30" />
                  </div>
                  {tiers.length > 1 && (
                    <button onClick={() => removeTier(i)} className="text-[#D0D5DD] hover:text-red-400 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#344054] mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notesâ¦"
              className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30 resize-none" />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-[#EAECF0] flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="flex-1 text-xs border border-[#D0D5DD] rounded-lg py-2 text-[#344054] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 text-xs bg-[#048A81] text-white rounded-lg py-2 flex items-center justify-center gap-1.5 hover:bg-[#037068] transition-colors disabled:opacity-50">
            {saving ? <><Loader2 size={13} className="animate-spin" /> Savingâ¦</> : 'Save MPN'}
          </button>
        </div>
      </div>
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
