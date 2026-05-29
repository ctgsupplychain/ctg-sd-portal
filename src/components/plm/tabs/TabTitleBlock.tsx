'use client'
import { Part } from '@/lib/plm-types'

export default function TabTitleBlock({ part }: { part: Part }) {
  const cards = [
    { l: 'Category', v: catLabel(part.category) },
    { l: 'Revision', v: part.current_revision },
    { l: 'Lifecycle', v: part.lifecycle_status },
    { l: 'UOM', v: part.uom },
  ]
  return (
    <div className="max-w-3xl">
      <h2 className="text-sm font-semibold text-[#101828] mb-3">Title Block</h2>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {cards.map((c, i) => (
          <div key={i} className="bg-white rounded-xl border border-[#EAECF0] px-4 py-3">
            <div className="text-xs text-[#667085] uppercase tracking-wider mb-1">{c.l}</div>
            <div className="text-sm font-medium text-[#101828]">{c.v}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-[#EAECF0] px-5 py-2">
        <Row k="Internal part number" v={part.part_number} mono />
        <Row k="Master SKU" v={part.master_sku_ref ?? '—'} mono />
        <Row k="Description" v={part.description} />
        <Row k="Brand" v={part.brand ?? '—'} />
        <Row k="Project link" v={part.project_id ?? '—'} mono />
        <Row k="Notes" v={part.notes ?? '—'} />
      </div>
    </div>
  )
}

function catLabel(c: string): string {
  return { FG: 'Finished Good', SA: 'Sub-Assembly', PK: 'Packaging', RM: 'Raw Material', WIP: 'Work in Progress' }[c] ?? c
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-[#F2F4F7] last:border-0 text-sm">
      <span className="text-[#667085]">{k}</span>
      <span className={mono ? 'font-mono text-[#344054] text-xs' : 'text-[#344054]'}>{v}</span>
    </div>
  )
}
