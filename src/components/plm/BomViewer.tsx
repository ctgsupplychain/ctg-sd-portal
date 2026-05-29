'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Part, BomRow, PriceTier, PlmDocument, PartSupplier } from '@/lib/plm-types'
import { computeCosts, fmtMYR, fmtPct, getTierPrice } from '@/lib/plm-cost'
import MetricStrip from './MetricStrip'
import BomTable from './BomTable'
import DocDrawer from './DocDrawer'

interface Props { fg: Part }

const FLAGS: Record<string, string> = { MY: '🇲🇾', CN: '🇨🇳', US: '🇺🇸' }
const MOQ_OPTIONS = [5000, 6000, 10000, 18000]

export default function BomViewer({ fg }: Props) {
  const [bomRows, setBomRows] = useState<BomRow[]>([])
  const [fgSupplier, setFgSupplier] = useState<PartSupplier | null>(null)
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

    // 1. Explode BOM via DB function
    const { data: explosion } = await createClient().rpc('explode_bom', {
      p_part_number: fg.part_number,
      p_forecast_qty: 1,
    })

    if (!explosion || explosion.length === 0) {
      setBomRows([])
      setLoading(false)
      return
    }

    const componentPns: string[] = explosion.map((r: BomRow) => r.component_pn)

    // 2. Fetch part details + supplier info for all components
    const [{ data: partsData }, { data: psData }, { data: docsData }] = await Promise.all([
      createClient().from('parts').select('part_number,current_revision,lifecycle_status,notes').in('part_number', componentPns),
      createClient().from('part_supplier').select('part_number,supplier_id,is_preferred,moq,nre_cost,price_tiers,lead_time_wk')
        .in('part_number', componentPns).eq('is_preferred', true),
      createClient().from('plm_documents').select('*').in('part_number', componentPns),
    ])

    // 3. Fetch supplier names
    const supplierIds: string[] = [...new Set((psData ?? []).map((ps: any) => ps.supplier_id).filter(Boolean))]
    const { data: supplierData } = supplierIds.length
      ? await createClient().from('plm_suppliers').select('id,name,country,lead_time_wk').in('id', supplierIds)
      : { data: [] }

    const supplierMap = Object.fromEntries((supplierData ?? []).map((s: any) => [s.id, s]))
    const partsMap = Object.fromEntries((partsData ?? []).map((p: any) => [p.part_number, p]))
    const psMap = Object.fromEntries((psData ?? []).map((ps: any) => [ps.part_number, ps]))

    // 4. Merge
    const merged: BomRow[] = explosion.map((r: BomRow) => {
      const part = partsMap[r.component_pn] ?? {}
      const ps: PartSupplier = psMap[r.component_pn]
      const sup = ps ? supplierMap[ps.supplier_id] : null
      return {
        ...r,
        current_revision: part.current_revision,
        lifecycle_status: part.lifecycle_status,
        part_notes: part.notes,
        supplier_name: sup?.name ?? null,
        supplier_country: sup?.country ?? null,
        lead_time_wk: sup?.lead_time_wk ?? null,
        moq: ps?.moq ?? null,
        price_tiers: ps?.price_tiers ?? [],
        nre_cost: ps?.nre_cost ?? null,
      }
    })

    // 5. Group docs by part_number
    const docsMap: Record<string, PlmDocument[]> = {}
    for (const doc of (docsData ?? []) as PlmDocument[]) {
      docsMap[doc.part_number] = docsMap[doc.part_number] ?? []
      docsMap[doc.part_number].push(doc)
    }

    // 6. FG supplier (for supplier GM calc)
    const { data: fgPs } = await createClient().from('part_supplier')
      .select('*').eq('part_number', fg.part_number).eq('is_preferred', true).single()
    setFgSupplier(fgPs)

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

  // Supplier GM: what OEM charges us (FG price tier) vs our material cost (their COGS proxy)
  const fgTiers: PriceTier[] = fgSupplier?.price_tiers ?? []
  const fgChargeTier = getTierPrice(fgTiers, moq)
  const fgCharge = fgChargeTier?.price ?? null
  const supplierGM = fgCharge !== null && totMat > 0
    ? ((fgCharge - totMat) / fgCharge * 100)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(0,212,160,.12)', color: 'var(--accent)', border: '1px solid rgba(0,212,160,.3)', padding: '3px 9px', borderRadius: 4 }}>
                {fg.master_sku_ref ?? fg.part_number}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{fg.description}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', background: 'var(--bg3)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 3 }}>
                {fg.current_revision}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {fg.part_number} · {fg.brand ?? ''} · {fg.lifecycle_status}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)' }}>
          {fg.lifecycle_status}
        </div>
      </div>

      {/* Metrics */}
      <MetricStrip
        totMat={totMat}
        totFreight={totFr}
        totTax={totTax}
        totLanded={totLanded}
        freightPct={freight}
        taxPct={tax}
        fgCharge={fgCharge}
        supplierGM={supplierGM}
      />

      {/* Controls */}
      <div style={{
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 22px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <CtrlLabel>FG MOQ</CtrlLabel>
        <div style={{ display: 'flex', gap: 5 }}>
          {MOQ_OPTIONS.map(m => (
            <button key={m} onClick={() => setMoq(m)} style={{
              fontFamily: 'monospace', fontSize: 11, padding: '3px 10px',
              borderRadius: 3, cursor: 'pointer', transition: 'all .15s',
              border: moq === m ? '1px solid var(--accent)' : '1px solid var(--border2)',
              background: moq === m ? 'rgba(0,212,160,.12)' : 'var(--bg2)',
              color: moq === m ? 'var(--accent)' : 'var(--muted)',
            }}>
              {(m / 1000).toFixed(0)}k
            </button>
          ))}
        </div>
        <Sep />
        <CtrlLabel>Freight %</CtrlLabel>
        <NumInput value={freight} onChange={setFreight} />
        <Sep />
        <CtrlLabel>SST %</CtrlLabel>
        <NumInput value={tax} onChange={setTax} />
        <Sep />
        <button onClick={() => setShowL2(v => !v)} style={{
          fontFamily: 'monospace', fontSize: 11, padding: '3px 10px',
          borderRadius: 3, cursor: 'pointer', transition: 'all .15s',
          border: showL2 ? '1px solid var(--accent2)' : '1px solid var(--border2)',
          background: showL2 ? 'rgba(0,153,255,.1)' : 'var(--bg2)',
          color: showL2 ? 'var(--accent2)' : 'var(--muted)',
        }}>
          {showL2 ? '⊟ L2' : '⊞ L2'}
        </button>
      </div>

      {/* Supplier GM banner */}
      {supplierGM !== null && (
        <div style={{
          background: 'rgba(0,153,255,.04)',
          borderBottom: '1px solid rgba(0,153,255,.15)',
          padding: '7px 22px',
          fontSize: 11, color: 'var(--muted)',
          lineHeight: 1.6, flexShrink: 0,
        }}>
          📊{' '}
          <strong style={{ color: 'var(--accent2)' }}>Supplier GM (est.)</strong>
          {' '}OEM charges us{' '}
          <strong style={{ color: 'var(--text)' }}>{fmtMYR(fgCharge, 4)}</strong>
          {' '}/ unit @ {(moq / 1000).toFixed(0)}k MOQ.
          {' '}Material cost rollup ={' '}
          <strong style={{ color: 'var(--text)' }}>{fmtMYR(totMat)}</strong>.
          {' '}Implied OEM margin ={' '}
          <strong style={{ color: supplierGM > 15 ? 'var(--warn)' : supplierGM >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {supplierGM >= 0 ? '+' : ''}{fmtPct(supplierGM)}
          </strong>
          {' '}— understated until MVA is transparent.
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading
          ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading BOM…</div>
          : <BomTable
              rows={bomRows}
              costMap={costMap}
              moq={moq}
              showL2={showL2}
              openPn={openPn}
              onToggle={pn => setOpenPn(prev => prev === pn ? null : pn)}
              flags={FLAGS}
            />
        }
      </div>

      {/* Doc Drawer */}
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

      {/* Flags */}
      <div style={{
        background: 'rgba(245,166,35,.06)',
        borderTop: '1px solid rgba(245,166,35,.2)',
        padding: '7px 22px',
        fontSize: 11, color: 'var(--warn)',
        flexShrink: 0,
      }}>
        ⚠ <strong>SA-NAT-006</strong> Shrink Wrap — RM0.00, confirm if absorbed into MVA.
        &nbsp;&nbsp;⚠ <strong>SA-NAT-005</strong> Bottle Assembly — no direct price; cost rolls from L2 children.
      </div>

      {/* Footer */}
      <div style={{
        background: 'var(--bg1)',
        borderTop: '1px solid var(--border)',
        padding: '7px 22px',
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)',
        flexShrink: 0,
      }}>
        <span>PLM · CTGSupplyChain · ap-southeast-1</span>
        <span>{bomRows.length} components · {fg.part_number}</span>
      </div>
    </div>
  )
}

function CtrlLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{children}</span>
}
function Sep() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
}
function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <input
        type="number" min={0} max={30} step={0.5} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{
          fontFamily: 'monospace', fontSize: 11, width: 52,
          padding: '3px 7px', borderRadius: 3,
          border: '1px solid var(--border2)',
          background: 'var(--bg2)', color: 'var(--text)',
          textAlign: 'right', outline: 'none',
        }}
      />
      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)' }}>%</span>
    </div>
  )
}
