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

  if (loading) return <div className="text-sm text-[#4B5563] p-4">Tracing usage…</div>

  const fgs = rows.filter(r => r.is_fg)
  const subs = rows.filter(r => !r.is_fg)

  return (
    <div className="max-w-3xl">
      <h2 className="text-sm font-semibold text-[#1F2937]">Where Used</h2>
      <p className="text-xs text-[#4B5563] mt-0.5 mb-4">
        Every parent and finished good that consumes <span className="font-mono text-[#0E5C56]">{pn}</span>.
        Change blast radius: if this part's spec, artwork, or supplier changes, these are affected.
      </p>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E4DDD3] p-8 text-center text-sm text-[#4B5563]">
          Not used in any BOM. This is a top-level item or orphan part.
        </div>
      ) : (
        <>
          {fgs.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-[#4B5563] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Package size={12} /> Finished Goods affected ({fgs.length})
              </div>
              <div className="bg-white rounded-xl border border-[#E4DDD3] overflow-hidden">
                {fgs.map((r, i) => <UsedRow key={r.parent_pn + i} r={r} onClick={() => router.push(`/plm/${r.parent_pn}`)} />)}
              </div>
            </div>
          )}
          {subs.length > 0 && (
            <div>
              <div className="text-xs text-[#4B5563] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Box size={12} /> Sub-assemblies / intermediate ({subs.length})
              </div>
              <div className="bg-white rounded-xl border border-[#E4DDD3] overflow-hidden">
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
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#E4DDD3] last:border-0 hover:bg-[#F4F2EE] transition-colors text-left">
      <span className="font-mono text-xs text-[#0E5C56] min-w-[90px]">{r.parent_pn}</span>
      <span className="flex-1 text-sm text-[#1F2937]">{r.parent_desc}</span>
      <span className="text-xs text-[#4B5563] font-mono">qty {Number(r.qty_per)}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-[#E4DDD3] text-[#4B5563] font-mono">L{r.bom_level}</span>
      <ChevronRight size={14} className="text-[#E4DDD3]" />
    </button>
  )
}
