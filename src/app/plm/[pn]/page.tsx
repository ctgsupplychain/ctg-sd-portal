'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Part } from '@/lib/plm-types'
import { ArrowLeft } from 'lucide-react'
import TabBom from '@/components/plm/tabs/TabBom'
import TabCost from '@/components/plm/tabs/TabCost'
import TabWhereUsed from '@/components/plm/tabs/TabWhereUsed'
import TabSuppliers from '@/components/plm/tabs/TabSuppliers'
import TabDocuments from '@/components/plm/tabs/TabDocuments'
import TabTitleBlock from '@/components/plm/tabs/TabTitleBlock'

type TabKey = 'title' | 'bom' | 'cost' | 'where' | 'sup' | 'docs'

const TABS: { key: TabKey; label: string; fgOnly?: boolean }[] = [
  { key: 'title', label: 'Title Block' },
  { key: 'bom',   label: 'BOM', fgOnly: false },
  { key: 'cost',  label: 'Cost Rollup', fgOnly: false },
  { key: 'where', label: 'Where Used' },
  { key: 'sup',   label: 'Suppliers (AML)' },
  { key: 'docs',  label: 'Documents' },
]

export default function PartDetailPage() {
  const params = useParams()
  const router = useRouter()
  const pn = decodeURIComponent(params.pn as string)
  const [part, setPart] = useState<Part | null>(null)
  const [hasBom, setHasBom] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('title')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: p }, { data: bomKids }] = await Promise.all([
      supabase.from('parts').select('*').eq('part_number', pn).single(),
      supabase.from('bom_lines').select('child_pn').eq('parent_pn', pn).eq('is_active', true).limit(1),
    ])
    setPart(p)
    setHasBom((bomKids?.length ?? 0) > 0)
    // default tab: BOM if it has children, else title
    setTab((bomKids?.length ?? 0) > 0 ? 'bom' : 'title')
    setLoading(false)
  }, [pn])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-[#F4F2EE] text-sm text-[#4B5563]">Loading {pn}…</div>
  }
  if (!part) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#F4F2EE] gap-3">
        <div className="text-sm text-[#4B5563]">Part {pn} not found.</div>
        <button onClick={() => router.push('/plm')} className="text-xs text-[#0E5C56] underline">← Back to BOM Viewer</button>
      </div>
    )
  }

  const lcColor = part.lifecycle_status === 'Active' ? '#12B76A'
    : part.lifecycle_status === 'NPI' ? '#0E5C56'
    : part.lifecycle_status === 'EOL' ? '#F79009' : '#4B5563'

  return (
    <div className="flex flex-col h-screen bg-[#F4F2EE] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-[#E4DDD3] px-6 pt-3 pb-0 flex-shrink-0">
        <button onClick={() => router.push('/plm')}
          className="flex items-center gap-1.5 text-xs text-[#4B5563] hover:text-[#0E5C56] transition-colors mb-2.5">
          <ArrowLeft size={13} /> Back to BOM Viewer
        </button>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <span className="font-mono text-sm bg-[#DCEAE8] text-[#0E5C56] px-2.5 py-1 rounded-md border border-[#0E5C56]/20">{part.part_number}</span>
          <span className="text-base font-semibold text-[#1F2937]">{part.description}</span>
          <span className="ml-auto flex items-center gap-2 text-xs text-[#4B5563]">
            <span className="w-2 h-2 rounded-full" style={{ background: lcColor }} />
            {part.lifecycle_status} · {part.current_revision}
          </span>
        </div>
        {/* Tab bar */}
        <div className="flex gap-0 overflow-x-auto -mb-px">
          {TABS.map(t => {
            const disabled = (t.key === 'bom' || t.key === 'cost') && !hasBom
            const active = tab === t.key
            return (
              <button key={t.key}
                onClick={() => !disabled && setTab(t.key)}
                disabled={disabled}
                className="px-3.5 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors"
                style={{
                  color: disabled ? '#E4DDD3' : active ? '#0E5C56' : '#4B5563',
                  borderBottomColor: active ? '#0E5C56' : 'transparent',
                  fontWeight: active ? 600 : 400,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'title' && <TabTitleBlock part={part} />}
        {tab === 'bom'   && <TabBom fg={part} />}
        {tab === 'cost'  && <TabCost fg={part} />}
        {tab === 'where' && <TabWhereUsed pn={part.part_number} />}
        {tab === 'sup'   && <TabSuppliers pn={part.part_number} />}
        {tab === 'docs'  && <TabDocuments pn={part.part_number} />}
      </div>
    </div>
  )
}
