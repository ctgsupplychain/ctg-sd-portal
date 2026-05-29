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
    return <div className="flex items-center justify-center h-screen bg-[#F0F2F5] text-sm text-[#667085]">Loading {pn}…</div>
  }
  if (!part) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#F0F2F5] gap-3">
        <div className="text-sm text-[#667085]">Part {pn} not found.</div>
        <button onClick={() => router.push('/plm')} className="text-xs text-[#048A81] underline">← Back to BOM Viewer</button>
      </div>
    )
  }

  const lcColor = part.lifecycle_status === 'Active' ? '#12B76A'
    : part.lifecycle_status === 'NPI' ? '#048A81'
    : part.lifecycle_status === 'EOL' ? '#F79009' : '#667085'

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-[#EAECF0] px-6 pt-3 pb-0 flex-shrink-0">
        <button onClick={() => router.push('/plm')}
          className="flex items-center gap-1.5 text-xs text-[#667085] hover:text-[#048A81] transition-colors mb-2.5">
          <ArrowLeft size={13} /> Back to BOM Viewer
        </button>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <span className="font-mono text-sm bg-[#F0FDF9] text-[#048A81] px-2.5 py-1 rounded-md border border-[#048A81]/20">{part.part_number}</span>
          <span className="text-base font-semibold text-[#101828]">{part.description}</span>
          <span className="ml-auto flex items-center gap-2 text-xs text-[#667085]">
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
                  color: disabled ? '#D0D5DD' : active ? '#048A81' : '#667085',
                  borderBottomColor: active ? '#048A81' : 'transparent',
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
