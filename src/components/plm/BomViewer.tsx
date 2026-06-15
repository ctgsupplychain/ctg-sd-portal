'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Part, BomRow, PriceTier, PlmDocument } from '@/lib/plm-types'
import { computeCosts, fmtMYR, fmtPct, getTierPrice } from '@/lib/plm-cost'
import MetricStrip from './MetricStrip'
import BomTable from './BomTable'
import DocDrawer from './DocDrawer'
import { AlertTriangle } from 'lucide-react'

interface Props { fg: Part; embedded?: boolean }

const MOQ_OPTIONS = [5000, 6000, 10000, 18000]

export default function BomViewer({ fg, embedded = false }: Props) {
  const [bomRows, setBomRows] = useState<BomRow[]>([])
  const [fgTiers, setFgTiers] = useState<PriceTier[]>([])
  const [docs, setDocs] = useState<Record<string, PlmDocument[]>>({})
  const [loading, setLoading] = useState(true)
  const [moq, setMoq] = useState(10000)
  const [freight, setFreight] = useState(0)
  const [tax, setTax] = useState(0)
  const [showL2, setShowL2] = useState(true)
  const [openPn, setOpenPn] = useState<string | null>(null)

  const loadBom = useCallback(async () => {
    setLoading(true)
    setOpenPn(null)
    const supabase = createClient()

    const { data: explosion } = await supabase.rpc('explode_bom', {
      p_part_number: fg.part_number, p_forecast_qty: 1,
    })
    if (!explosion || explosion.length === 0) { setBomRows([]); setLoading(false); return }

    const componentPns: string[] = explosion.map((r: BomRow) => r.component_pn)
    const [{ data: partsData }, { data: psData }, { data: docsData }] = await Promise.all([
      supabase.from('parts').select('part_number,current_revision,lifecycle_status,notes').in('part_number', componentPns),
      supabase.from('manufacturer_parts').select('part_number,supplier_id,is_preferred,moq,nre_cost,price_tiers,lead_time_wk').in('part_number', componentPns).eq('is_preferred', true),
      supabase.from('plm_documents').select('*').in('part_number', componentPns),
    ])

    const supplierIds = [...new Set((psData ?? []).map((ps: any) => ps.supplier_id).filter(Boolean))]
    const { data: supplierData } = supplierIds.length
      ? await supabase.from('plm_suppliers').select('id,name,country,lead_time_wk').in('id', supplierIds)
      : { data: [] }

    const supplierMap = Object.fromEntries((supplierData ?? []).map((s: any) => [s.id, s]))
    const partsMap = Object.fromEntries((partsData ?? []).map((p: any) => [p.part_number, p]))
    const psMap = Object.fromEntries((psData ?? []).map((ps: any) => [ps.part_number, ps]))

    const merged: BomRow[] = explosion.map((r: BomRow) => {
      const part = partsMap[r.component_pn] ?? {}
      const ps: any = psMap[r.component_pn]
      const sup = ps ? supplierMap[ps.supplier_id] : null
      return { ...r, current_revision: part.current_revision, lifecycle_status: part.lifecycle_status, part_notes: part.notes, supplier_name: sup?.name ?? null, supplier_country: sup?.country ?? null, lead_time_wk: sup?.lead_time_wk ?? null, moq: ps?.moq ?? null, price_tiers: ps?.price_tiers ?? [], nre_cost: ps?.nre_cost ?? null }
    })

    const docsMap: Record<string, PlmDocument[]> = {}
    for (const doc of (docsData ?? []) as PlmDocument[]) {
      docsMap[doc.part_number] = docsMap[doc.part_number] ?? []
      docsMap[doc.part_number].push(doc)
    }

    const { data: fgPs } = await supabase.from('manufacturer_parts').select('price_tiers').eq('part_number', fg.part_number).eq('is_preferred', true).single()
    setFgTiers(fgPs?.price_tiers ?? [])
    setBomRows(merged)
    setDocs(docsMap)
    setLoading(false)
  }, [fg.part_number])

  useEffect(() => { loadBom() }, [loadBom])

  const costs = computeCosts(bomRows, moq, freight, tax)
  const costMap = Object.fromEntries(costs.map(c => [c.component_pn, c]))
  const totMat    = costs.reduce((s, c) => s + (c.ext_mat ?? 0), 0)
  const totFr     = costs.reduce((s, c) => s + (c.ext_freight ?? 0), 0)
  const totTax    = costs.reduce((s, c) => s + (c.ext_tax ?? 0), 0)
  const totLanded = costs.reduce((s, c) => s + (c.ext_landed ?? 0), 0)
  const fgChargeTier = getTierPrice(fgTiers, moq)
  const fgCharge = fgChargeTier?.price ?? null
  const supplierGM = fgCharge !== null && totMat > 0 ? ((fgCharge - totMat) / fgCharge * 100) : null

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F4F2EE]">

      {/* Page header — matches S&D header bar (hidden when embedded in tab) */}
      {!embedded && (
      <div className="bg-white border-b border-[#E4DDD3] px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold text-[#1F2937] flex-shrink-0">BOM Viewer</h1>
          <span className="bg-[#DCEAE8] text-[#0E5C56] text-xs px-2.5 py-1 rounded-full font-medium font-mono border border-[#0E5C56]/20 flex-shrink-0">
            {fg.master_sku_ref ?? fg.part_number}
          </span>
          <span className="text-sm text-[#1F2937] truncate font-medium">{fg.description}</span>
          <span className="text-xs text-[#4B5563] bg-[#E4DDD3] px-2 py-0.5 rounded font-mono flex-shrink-0">{fg.current_revision}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a href={`/plm/${encodeURIComponent(fg.part_number)}`}
            className="text-xs text-[#0E5C56] border border-[#0E5C56]/30 rounded-lg px-2.5 py-1 hover:bg-[#DCEAE8] transition-colors">
            Open part detail ↗
          </a>
          <span className="text-xs text-[#4B5563]">{fg.part_number} · {fg.lifecycle_status}</span>
        </div>
      </div>
      )}

      {/* Metrics */}
      <MetricStrip
        totMat={totMat} totFreight={totFr} totTax={totTax} totLanded={totLanded}
        freightPct={freight} taxPct={tax} fgCharge={fgCharge} supplierGM={supplierGM}
      />

      {/* Controls */}
      <div className="bg-white border-b border-[#E4DDD3] px-6 py-2.5 flex items-center gap-4 flex-wrap flex-shrink-0">
        <span className="text-xs font-medium text-[#1F2937]">FG MOQ</span>
        <div className="flex gap-1.5">
          {MOQ_OPTIONS.map(m => (
            <button key={m} onClick={() => setMoq(m)}
              className="text-xs px-3 py-1 rounded-lg font-mono transition-all"
              style={moq === m
                ? { background: '#0E5C56', color: 'white', fontWeight: 500 }
                : { background: '#E4DDD3', color: '#4B5563' }}>
              {(m / 1000).toFixed(0)}k
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-[#E4DDD3]" />

        <span className="text-xs font-medium text-[#1F2937]">Freight %</span>
        <div className="flex items-center gap-1.5">
          <input type="number" min={0} max={30} step={0.5} value={freight}
            onChange={e => setFreight(parseFloat(e.target.value) || 0)}
            className="w-14 text-xs font-mono px-2 py-1 border border-[#E4DDD3] rounded-lg text-right text-[#1F2937] focus:outline-none focus:border-[#0E5C56]" />
          <span className="text-xs text-[#4B5563]">%</span>
        </div>

        <div className="w-px h-4 bg-[#E4DDD3]" />

        <span className="text-xs font-medium text-[#1F2937]">SST %</span>
        <div className="flex items-center gap-1.5">
          <input type="number" min={0} max={20} step={1} value={tax}
            onChange={e => setTax(parseFloat(e.target.value) || 0)}
            className="w-14 text-xs font-mono px-2 py-1 border border-[#E4DDD3] rounded-lg text-right text-[#1F2937] focus:outline-none focus:border-[#0E5C56]" />
          <span className="text-xs text-[#4B5563]">%</span>
        </div>

        <div className="w-px h-4 bg-[#E4DDD3]" />

        <button onClick={() => setShowL2(v => !v)}
          className="text-xs px-3 py-1 rounded-lg transition-all font-medium"
          style={showL2
            ? { background: '#EFF6FF', color: '#2563eb', border: '1px solid #BFDBFE' }
            : { background: '#E4DDD3', color: '#4B5563', border: '1px solid #E4DDD3' }}>
          {showL2 ? '⊟ Collapse L2' : '⊞ Expand L2'}
        </button>
      </div>

      {/* Supplier GM info */}
      {supplierGM !== null && (
        <div className="bg-[#DCEAE8] border-b border-[#0E5C56]/20 px-6 py-2 text-xs text-[#4B5563] flex-shrink-0">
          <span className="font-medium text-[#0E5C56]">Supplier GM (est.)</span>
          {' '}OEM charges us{' '}
          <span className="font-mono font-medium text-[#1F2937]">{fmtMYR(fgCharge, 4)}</span>
          {' '}/ unit @ {(moq / 1000).toFixed(0)}k MOQ. Material cost rollup ={' '}
          <span className="font-mono font-medium text-[#1F2937]">{fmtMYR(totMat)}</span>.
          {' '}Implied OEM margin ={' '}
          <span className="font-medium" style={{ color: supplierGM > 15 ? '#d97706' : supplierGM >= 0 ? '#0E5C56' : '#dc2626' }}>
            {supplierGM >= 0 ? '+' : ''}{fmtPct(supplierGM)}
          </span>
          {' '}— understated until MVA is transparent.
        </div>
      )}

      {/* Table area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {loading
          ? <div className="flex items-center justify-center h-32 text-sm text-[#4B5563]">Loading BOM…</div>
          : <div className="bg-white rounded-xl border border-[#E4DDD3] overflow-hidden">
              <BomTable
                rows={bomRows} costMap={costMap} moq={moq}
                showL2={showL2} openPn={openPn}
                onToggle={pn => setOpenPn(prev => prev === pn ? null : pn)}
              />
              {openPn && (
                <DocDrawer
                  pn={openPn}
                  row={bomRows.find(r => r.component_pn === openPn) ?? null}
                  cost={costMap[openPn] ?? null}
                  docs={docs[openPn] ?? []}
                  moq={moq}
                  onClose={() => setOpenPn(null)}
                />
              )}
            </div>
        }
      </div>

      {/* Flag bar */}
      <div className="border-t px-6 py-2 flex items-center gap-2 flex-shrink-0" style={{ background: "#FEF3E2", borderColor: "#F9DEB8" }}>
        <AlertTriangle size={13} className="text-[#d97706] flex-shrink-0" />
        <span className="text-xs text-[#92400e]">
          <strong>SA-NAT-006</strong> Shrink Wrap — RM0.00, confirm if absorbed into MVA.
          &nbsp;&nbsp;
          <strong>SA-NAT-005</strong> Bottle Assembly — no direct price; cost rolls from L2 children.
        </span>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-[#E4DDD3] px-6 py-2 flex justify-between text-xs text-[#4B5563] flex-shrink-0">
        <span>PLM · CTGSupplyChain · ap-southeast-1</span>
        <span>{bomRows.length} components · {fg.part_number}</span>
      </div>
    </div>
  )
}
