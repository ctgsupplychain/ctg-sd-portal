'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { WhereUsedRow } from '@/lib/plm-types'
import { Package, Box, ChevronRight } from 'lucide-react'

export default function TabWhereUsed({ pn }: { pn: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<WhereUsedRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('where_used', { p_component: pn }).then(({ data }) => {
      setRows((data ?? []) as WhereUsedRow[])
      setLoading(false)
    })
  }, [pn])

  if (loading) return <div className="text-sm text-[#667085] p-4">Tracing usage…</div>

  const fgs = rows.filter(r => r.is_fg)
  const subs = rows.filter(r => !r.is_fg)

  return (
    <div className="max-w-3xl">
      <h2 className="text-sm font-semibold text-[#101828]">Where Used</h2>
      <p className="text-xs text-[#667085] mt-0.5 mb-4">
        Every parent and finished good that consumes <span className="font-mono text-[#048A81]">{pn}</span>.
        Change blast radius: if this part's spec, artwork, or supplier changes, these are affected.
      </p>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#EAECF0] p-8 text-center text-sm text-[#667085]">
          Not used in any BOM. This is a top-level item or orphan part.
        </div>
      ) : (
        <>
          {fgs.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Package size={12} /> Finished Goods affected ({fgs.length})
              </div>
              <div className="bg-white rounded-xl border border-[#EAECF0] overflow-hidden">
                {fgs.map((r, i) => <UsedRow key={r.parent_pn + i} r={r} onClick={() => router.push(`/plm/${r.parent_pn}`)} />)}
              </div>
            </div>
          )}
          {subs.length > 0 && (
            <div>
              <div className="text-xs text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Box size={12} /> Sub-assemblies / intermediate ({subs.length})
              </div>
              <div className="bg-white rounded-xl border border-[#EAECF0] overflow-hidden">
                {subs.map((r, i) => <UsedRow key={r.parent_pn + i} r={r} onClick={() => router.push(`/plm/${r.parent_pn}`)} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function UsedRow({ r, onClick }: { r: WhereUsedRow; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#F2F4F7] last:border-0 hover:bg-[#F9FAFB] transition-colors text-left">
      <span className="font-mono text-xs text-[#048A81] min-w-[90px]">{r.parent_pn}</span>
      <span className="flex-1 text-sm text-[#344054]">{r.parent_desc}</span>
      <span className="text-xs text-[#667085] font-mono">qty {Number(r.qty_per)}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-[#F2F4F7] text-[#667085] font-mono">L{r.bom_level}</span>
      <ChevronRight size={14} className="text-[#D0D5DD]" />
    </button>
  )
}
