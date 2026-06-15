'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Part, BomRow, PriceTier } from '@/lib/plm-types'
import { computeCosts, fmtMYR } from '@/lib/plm-cost'

const MOQ_OPTIONS = [5000, 6000, 10000, 18000]

export default function TabCost({ fg }: { fg: Part }) {
  const [bomRows, setBomRows] = useState<BomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [moq, setMoq] = useState(10000)
  const [freight, setFreight] = useState(0)
  const [tax, setTax] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: explosion } = await supabase.rpc('explode_bom', { p_part_number: fg.part_number, p_forecast_qty: 1 })
    if (!explosion?.length) { setBomRows([]); setLoading(false); return }
    const pns = explosion.map((r: BomRow) => r.component_pn)
    const { data: ps } = await supabase.from('manufacturer_parts')
      .select('part_number,price_tiers').in('part_number', pns).eq('is_preferred', true)
    const psMap = Object.fromEntries((ps ?? []).map((p: any) => [p.part_number, p]))
    setBomRows(explosion.map((r: BomRow) => ({ ...r, price_tiers: psMap[r.component_pn]?.price_tiers ?? [] })))
    setLoading(false)
  }, [fg.part_number])

  useEffect(() => { load() }, [load])

  const costs = computeCosts(bomRows, moq, freight, tax)
  const totMat = costs.reduce((s, c) => s + (c.ext_mat ?? 0), 0)
  const totLanded = costs.reduce((s, c) => s + (c.ext_landed ?? 0), 0) + 1.20
  const sorted = [...costs].filter(c => (c.ext_landed ?? 0) > 0).sort((a, b) => (b.ext_landed ?? 0) - (a.ext_landed ?? 0))

  if (loading) return <div className="text-sm text-[#4B5563] p-4">Computing rollup…</div>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#1F2937]">Cost Rollup</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {MOQ_OPTIONS.map(m => (
              <button key={m} onClick={() => setMoq(m)}
                className="text-xs px-2.5 py-1 rounded-lg font-mono"
                style={moq === m ? { background: '#0E5C56', color: 'white' } : { background: '#E4DDD3', color: '#4B5563' }}>
                {(m / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-[#4B5563]">
            Freight
            <input type="number" value={freight} onChange={e => setFreight(+e.target.value || 0)}
              className="w-12 px-1.5 py-0.5 border border-[#E4DDD3] rounded text-right font-mono" />%
          </label>
          <label className="flex items-center gap-1 text-xs text-[#4B5563]">
            SST
            <input type="number" value={tax} onChange={e => setTax(+e.target.value || 0)}
              className="w-12 px-1.5 py-0.5 border border-[#E4DDD3] rounded text-right font-mono" />%
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-[#E4DDD3] px-4 py-3">
          <div className="text-xs text-[#4B5563] uppercase tracking-wider mb-1">Material</div>
          <div className="text-xl font-semibold font-mono text-[#0E5C56]">{fmtMYR(totMat)}</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E4DDD3] px-4 py-3">
          <div className="text-xs text-[#4B5563] uppercase tracking-wider mb-1">MVA</div>
          <div className="text-xl font-semibold font-mono text-[#E8A33D]">RM 1.20</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E4DDD3] px-4 py-3">
          <div className="text-xs text-[#4B5563] uppercase tracking-wider mb-1">Total Landed</div>
          <div className="text-xl font-semibold font-mono text-[#1F2937]">{fmtMYR(totLanded)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E4DDD3] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#E4DDD3] text-xs text-[#4B5563] uppercase tracking-wider">
          Cost contribution by component
        </div>
        {sorted.map(c => {
          const el = c.ext_landed ?? 0
          const share = totLanded > 0 ? (el / totLanded * 100) : 0
          const row = bomRows.find(r => r.component_pn === c.component_pn)
          return (
            <div key={c.component_pn} className="px-4 py-2.5 border-b border-[#E4DDD3] last:border-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-[#0E5C56]">{c.component_pn}</span>
                <span className="text-sm font-mono text-[#1F2937]">{fmtMYR(el, 4)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#4B5563] flex-1 truncate">{row?.component_desc}</span>
                <div className="w-32 h-1.5 bg-[#E4DDD3] rounded-full overflow-hidden">
                  <div className="h-full bg-[#0E5C56] rounded-full" style={{ width: `${share}%` }} />
                </div>
                <span className="text-xs text-[#4B5563] font-mono min-w-[40px] text-right">{share.toFixed(1)}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
